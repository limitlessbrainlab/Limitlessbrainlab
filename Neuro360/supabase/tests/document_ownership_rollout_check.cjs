// Staging only. Applies the prerequisite and activation SQL in one rollback-only transaction.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env.local'), override: false });

const project = 'ukmggjcvjvjodksopngs';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');

function sqlFile(name) {
  return fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8')
    .replace(/^\s*(?:BEGIN|COMMIT);\s*$/gim, '');
}

const tables = ['clinical_documentation', 'clinical_reports', 'reports'];
const relationList = tables.map(name => `'${name}'`).join(',');
const countTriggers = `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN (${relationList})
  AND t.tgname='protect_document_references' AND NOT t.tgisinternal`;
const sql = `BEGIN;
DROP TRIGGER IF EXISTS protect_document_references ON public.clinical_documentation;
DROP TRIGGER IF EXISTS protect_document_references ON public.clinical_reports;
DROP TRIGGER IF EXISTS protect_document_references ON public.reports;
${sqlFile('20261111190000_document_ownership.sql')}
DO $$ BEGIN ASSERT (${countTriggers})=0,'Document guard triggers activated by additive prerequisite'; END $$;
DO $$
DECLARE c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
  session_id uuid:=gen_random_uuid(); file text:=gen_random_uuid()||'/gap-upload.pdf'; local_file text:=gen_random_uuid()||'.pdf'; result_file text:=gen_random_uuid()||'/report.pdf';
BEGIN
  PERFORM set_config('test.rollout_clinic',c::text,true);
  PERFORM set_config('test.rollout_patient',p::text,true);
  PERFORM set_config('test.rollout_user',u::text,true);
  PERFORM set_config('test.rollout_session',session_id::text,true);
  PERFORM set_config('test.rollout_file',file,true);
  PERFORM set_config('test.rollout_local_file',local_file,true);
  PERFORM set_config('test.rollout_result_file',result_file,true);
  INSERT INTO auth.users(id,email) VALUES(u,u||'@security-test.invalid');
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(session_id,u,now(),now());
  INSERT INTO public.clinics(id,name,email,is_active,subscription_status,auth_user_id)
    VALUES(c,'Rollout gap fixture',c||'@security-test.invalid',true,'active',u);
  INSERT INTO public.organizations(id,name) VALUES(c,'Rollout gap fixture') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
    VALUES(p,'Rollout gap fixture',p||'@security-test.invalid',c,c,'1990-01-01','other');
  INSERT INTO storage.objects(bucket_id,name) VALUES('patients_documents',file);
  INSERT INTO public.clinical_documentation(patient_id,clinic_id,file_urls)
    VALUES(p,c,jsonb_build_object('gap',jsonb_build_object('path',file,'bucket','patients_documents')));
  INSERT INTO public.reports(patient_id,clinic_id,file_name,file_path,status)
    VALUES(p,c,local_file,'/uploads/'||local_file,'completed');
  INSERT INTO storage.objects(bucket_id,name) VALUES('neurosense-reports',result_file);
  INSERT INTO public.algorithm_results(id,patient_id,patient_name,clinic_id,clinic_name,results,processed_by,claude_report_url)
    VALUES('rollout-'||gen_random_uuid(),p,'Rollout gap fixture',c,'Rollout gap fixture','{}','rollout-check',
      'https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/public/neurosense-reports/'||result_file);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',session_id,'role','authenticated')::text,true);
END $$;
${sqlFile('20261111194909_document_ownership_guard_catchup.sql')}
DO $$ BEGIN
  ASSERT (${countTriggers})=3,'Document guard activation must create all three triggers';
  ASSERT public.resolve_document_owner('patients_documents',current_setting('test.rollout_file'))=current_setting('test.rollout_patient')::uuid,
    'Activation must register metadata saved after the additive prerequisite';
  ASSERT public.resolve_local_report_owner(current_setting('test.rollout_local_file'))=current_setting('test.rollout_patient')::uuid,
    'Activation must register local reports saved after the additive prerequisite';
  ASSERT public.resolve_document_owner('neurosense-reports',current_setting('test.rollout_result_file'))=current_setting('test.rollout_patient')::uuid,
    'Activation must register algorithm reports saved after the additive prerequisite';
END $$;
SET LOCAL ROLE authenticated;
INSERT INTO public.clinical_documentation(patient_id,clinic_id,file_urls)
VALUES(current_setting('test.rollout_patient')::uuid,current_setting('test.rollout_clinic')::uuid,
  jsonb_build_object('gap',jsonb_build_object('path',current_setting('test.rollout_file'),'bucket','patients_documents')));
RESET ROLE;
ROLLBACK;`;

async function main() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Staging rollout check failed (${response.status}): ${await response.text()}`);
  console.log('Staging document, local report, and algorithm report catch-up checks passed; transaction rolled back.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
