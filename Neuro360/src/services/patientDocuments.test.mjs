import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {documentLocation} from '../utils/documentLocation.js';
function fixture() {
 const calls=[]; const timers=[];
 class TestURL extends URL { static createObjectURL(){return 'blob:private-report';} static revokeObjectURL(){} }
 const context={module:{exports:{}},documentLocation,window:{location:{origin:'https://portal.example'}},URL:TestURL,setTimeout:fn=>timers.push(fn),
 supabase:{supabaseUrl:'https://project.supabase.co',auth:{getSession:async()=>({data:{session:{access_token:'verified-token'}}})}},
 fetch:async(url,options)=>{calls.push({url,options});return{ok:true,blob:async()=>new Blob(['synthetic']),json:async()=>({success:true,signedUrl:'https://signed.example/file'})};}};
 const source=readFileSync(new URL('./patientDocuments.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replaceAll('import.meta.env',"({VITE_API_URL:'https://backend.example/api'})").replaceAll('export async function','async function')+'\nmodule.exports={resolveReportUrl,getPatientDocSignedUrl};';
 vm.runInNewContext(source,context);return{...context.module.exports,calls,timers};
}
test('historical public URL renews through authenticated ownership endpoint',async()=>{
 const f=fixture();assert.equal(await f.resolveReportUrl('https://project.supabase.co/storage/v1/object/public/neurosense-reports/a.pdf'),'https://signed.example/file');
 assert.equal(f.calls[0].url,'https://backend.example/api/patient-documents/signed-url');assert.equal(f.calls[0].options.headers.Authorization,'Bearer verified-token');
 assert.equal(JSON.parse(f.calls[0].options.body).path,'a.pdf');
});
test('local report bytes use native authorization and a temporary blob URL',async()=>{
 const f=fixture();assert.equal(await f.resolveReportUrl('/uploads/report.pdf'),'blob:private-report');assert.equal(f.calls[0].url,'https://backend.example/uploads/report.pdf');assert.equal(f.calls[0].options.headers.Authorization,'Bearer verified-token');assert.equal(f.timers.length,1);
});
test('foreign origins never receive native token, foreign storage project fails closed',async()=>{
 const f=fixture();assert.equal(await f.resolveReportUrl('https://foreign.example/uploads/report.pdf'),'https://foreign.example/uploads/report.pdf');assert.equal(f.calls.length,0);
 await assert.rejects(()=>f.resolveReportUrl('https://other.supabase.co/storage/v1/object/public/neurosense-reports/a.pdf'),/different storage/);assert.equal(f.calls.length,0);
});
