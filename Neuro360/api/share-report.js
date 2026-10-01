import { createClient } from '@supabase/supabase-js';

export function validateShareRequest(body = {}) {
  for (const key of ['clinicId', 'patientId', 'fileName', 'filePath']) {
    if (!body[key]) return `${key} is required`;
  }
  if (!body.reportData || typeof body.reportData !== 'object' || Array.isArray(body.reportData)) return 'reportData is required';
  return null;
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  try {
    const supabase = serverClient();
    if (!await requireSuperAdmin(req, supabase)) return res.status(401).json({ message: 'Super admin access is required' });
    const error = validateShareRequest(req.body);
    if (error) return res.status(400).json({ message: error });
    const { clinicId, patientId, fileName, filePath, reportData, status = 'completed' } = req.body;
    const { data: patient, error: patientError } = await supabase.from('patients').select('id, clinic_id').eq('id', patientId).single();
    if (patientError || !patient || patient.clinic_id !== clinicId) return res.status(400).json({ message: 'Patient does not belong to this clinic' });
    const { data: existing, error: findError } = await supabase.from('reports').select('*')
      .eq('clinic_id', clinicId).eq('patient_id', patientId).eq('file_name', fileName).eq('file_path', filePath).maybeSingle();
    if (findError) throw findError;
    if (existing) return res.status(200).json({ report: existing, existing: true });
    const { data: report, error: insertError } = await supabase.from('reports').insert({
      clinic_id: clinicId, patient_id: patientId, file_name: fileName, file_path: filePath, report_data: reportData, status,
    }).select().single();
    if (insertError) throw insertError;
    return res.status(201).json({ report, existing: false });
  } catch (error) {
    console.error('Share report failed:', error.message);
    return res.status(500).json({ message: error.message || 'Could not share the report' });
  }
}
