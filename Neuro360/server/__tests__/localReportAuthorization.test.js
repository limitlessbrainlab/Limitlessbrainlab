const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalReportRouter } = require('../routes/localReportRoutes');

const patientId='10000000-0000-4000-8000-000000000001';
async function fixture(t,actor) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-report-test-'));
 fs.writeFileSync(path.join(dir,'bound.pdf'),'synthetic PDF');fs.writeFileSync(path.join(dir,'legacy.pdf'),'synthetic legacy');
 const db={rpc:async(name,args)=>{assert.equal(name,'resolve_local_report_owner');return {data:args.p_filename==='bound.pdf'?patientId:null};},
  from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:{id:patientId,clinic_id:'clinic-1'}}}})};
 const app=express();app.use('/uploads',createLocalReportRouter({db,uploadsDir:dir,authenticate(req,res,next){
  if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'Authentication required'});
  req.user=actor;next();
 }}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})});
 return (filename,authenticated=true)=>fetch(`http://127.0.0.1:${server.address().port}/uploads/${filename}`,{headers:authenticated?{Authorization:'Bearer synthetic'}:{}});
}
test('local file endpoint denies anonymous requests',async t=>{
 const get=await fixture(t,{role:'super_admin'});assert.equal((await get('legacy.pdf',false)).status,401);
});
for(const actor of [{role:'patient',patient_id:patientId},{role:'clinic_admin',clinic_id:'clinic-1'}])test('registered owner can download: '+actor.role,async t=>{
 const get=await fixture(t,actor);const r=await get('bound.pdf');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'synthetic PDF');
 assert.equal((await get('legacy.pdf')).status,403);
});
test('other patient and clinic cannot download a registered file',async t=>{
 for(const actor of [{role:'patient',patient_id:'other'},{role:'clinic_admin',clinic_id:'other'}]){
  const get=await fixture(t,actor);assert.equal((await get('bound.pdf')).status,403);
 }
});
test('admin legacy download is confined to report files',async t=>{
 const get=await fixture(t,{role:'super_admin'});assert.equal((await get('legacy.pdf')).status,200);
 assert.equal((await get('missing.pdf')).status,404);
 assert.equal((await get('secret.env')).status,400);
 assert.equal((await get('..%5Clegacy.pdf')).status,400);
 assert.equal((await get('..%2Flegacy.pdf')).status,400);
});
