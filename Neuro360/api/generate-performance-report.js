import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import claudeReportData from '../server/services/claudeReportData.js';
import claudeReportGenerator from '../server/services/claudeReportGenerator.js';

const { buildReportData } = claudeReportData;
const { generateBrainReportPdf } = claudeReportGenerator;

const json = (res, status, body) => res.status(status).json(body);

function serverClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireSuperAdmin(req, supabase) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  return profile?.role === 'super_admin' ? data.user : null;
}

async function claimJob(supabase, idempotencyKey, body, userId) {
  const seed = {
    idempotency_key: idempotencyKey,
    report_type: 'performance',
    patient_id: body.patientId || null,
    clinic_id: body.clinicId || null,
    algorithm_result_id: body.savedResultId || null,
    requested_by: userId,
    input_data: { patient: body.patient || {}, clinicLogoUrl: body.clinicLogoUrl || null },
    canonical_results: body.canonicalResults,
    qeeg_data: body.qeegData,
  };
  const { data: inserted, error: insertError } = await supabase.from('report_jobs').insert(seed).select().single();
  if (!insertError) return { job: inserted, claimed: true };
  if (insertError.code !== '23505') throw insertError;

  const { data: existing, error: getError } = await supabase
    .from('report_jobs').select('*').eq('idempotency_key', idempotencyKey).single();
  if (getError) throw getError;
  if (existing.status === 'completed') return { job: existing, claimed: false };

  const { data: claimed, error: claimError } = await supabase
    .from('report_jobs')
    .update({ status: 'running', stage: 'building', progress: 10, attempts: (existing.attempts || 0) + 1, started_at: new Date().toISOString(), error_message: null })
    .eq('id', existing.id).in('status', ['pending', 'failed']).select().maybeSingle();
  if (claimError) throw claimError;
  return { job: claimed || existing, claimed: Boolean(claimed) };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { message: 'Method not allowed' });

  const supabase = serverClient();
  const user = await requireSuperAdmin(req, supabase);
  if (!user) return json(res, 401, { message: 'Super admin access is required' });

  if (req.method === 'GET') {
    const id = String(req.query?.id || '');
    if (!id) return json(res, 400, { message: 'Job id is required' });
    const { data, error } = await supabase.from('report_jobs')
      .select('id,status,stage,progress,output_url,error_message,workflow_run_id,created_at,started_at,completed_at')
      .eq('id', id).single();
    if (error) return json(res, error.code === 'PGRST116' ? 404 : 500, { message: error.message });
    return json(res, 200, { job: data });
  }

  const body = req.body || {};
  if (!body.savedResultId || !body.patientId || !body.canonicalResults || !body.qeegData) {
    return json(res, 400, { message: 'savedResultId, patientId, canonicalResults and qeegData are required' });
  }
  const idempotencyKey = String(body.idempotencyKey || `performance:${body.savedResultId}`);
  let job;
  try {
    const claim = await claimJob(supabase, idempotencyKey, body, user.id);
    job = claim.job;
    if (!claim.claimed) {
      if (job.status === 'completed') return json(res, 200, { job, pdfUrl: job.output_url });
      return json(res, 202, { job });
    }

    await supabase.from('report_jobs').update({ status: 'running', stage: 'narrative', progress: 35, started_at: new Date().toISOString() }).eq('id', job.id);
    const patient = {
      ...(body.patient || {}),
      id: body.patientId,
      clinicName: body.clinicName || body.patient?.clinicName,
      processedAt: body.assessmentDate || body.patient?.processedAt,
      assessmentDate: body.assessmentDate || body.patient?.assessmentDate,
      generatedAt: body.generatedAt || body.assessmentDate,
    };
    const reportData = buildReportData(body.qeegData, body.canonicalResults, patient);
    const { pdf: originalPdf } = await generateBrainReportPdf(reportData, undefined, async (stage) => {
      const progress = stage === 'render' ? 75 : 45;
      await supabase.from('report_jobs').update({ stage, progress }).eq('id', job.id);
    });

    let pdf = originalPdf;
    try {
      const doc = await PDFDocument.load(pdf);
      doc.setTitle(`NPR-${String(reportData.patient.reportId || job.id).replace(/\D/g, '')}.pdf`);
      doc.setAuthor('Limitless Brain Lab');
      doc.setCreator('Limitless Brain Lab');
      pdf = Buffer.from(await doc.save());
    } catch (_) { /* Metadata is best-effort. */ }

    await supabase.from('report_jobs').update({ stage: 'saving', progress: 92 }).eq('id', job.id);
    const fileName = `claude-reports/NPR-${String(reportData.patient.reportId || job.id).replace(/\D/g, '')}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from('neurosense-reports')
      .upload(fileName, pdf, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from('neurosense-reports').getPublicUrl(fileName);
    const pdfUrl = publicData.publicUrl;

    const completedAt = new Date().toISOString();
    const { data: completed, error: completeError } = await supabase.from('report_jobs').update({
      status: 'completed', stage: 'completed', progress: 100, output_url: pdfUrl, completed_at: completedAt, error_message: null,
    }).eq('id', job.id).select().single();
    if (completeError) throw completeError;
    await supabase.from('algorithm_results').update({
      claude_report_url: pdfUrl,
      claude_report_id: reportData.patient.reportId || null,
      canonical_results: body.canonicalResults,
      qeeg_data: body.qeegData,
    }).eq('id', body.savedResultId);

    return json(res, 200, { job: completed, pdfUrl, reportId: reportData.patient.reportId || null });
  } catch (error) {
    console.error('Performance report job failed:', error);
    if (job?.id) {
      await supabase.from('report_jobs').update({
        status: 'failed', stage: 'failed', error_message: String(error.message || error).slice(0, 1000), completed_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
    return json(res, 500, { jobId: job?.id || null, message: error.message || 'Report generation failed' });
  }
}

