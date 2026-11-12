const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');

function fixture(user) {
  let handlers, reads = 0, status = 200, body;
  const authenticate = () => {};
  const query = { select() { return this; }, eq(key,value) { assert.equal(key,'id'); assert.equal(value,user.id); return this; },
    async single() { reads++; return {data:user}; } };
  const router = {post(route,...args) { assert.equal(route,'/generate-token'); handlers=args; }};
  const deps = {express:{Router:()=>router},jsonwebtoken:jwt,crypto:require('node:crypto'),
    '../dbRouter':{createRoutedClient:()=>({from:()=>query})},'../middleware/authMiddleware':{authMiddleware:authenticate}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/ssoRoutes.js'),'utf8'),{
    require:name=>deps[name],module:{exports:{}},console,process:{env:{SHARED_SSO_SECRET:'synthetic-test-signing-secret',DDO_DOCTOR_URL:'https://doctor.example.test',DDO_PATIENT_URL:'https://patient.example.test'}}
  });
  return {handlers,authenticate,reads:()=>reads,async request(actor,input){
    await handlers.at(-1)({user:actor,body:input},{set(name,value){assert.equal(name,'Cache-Control');assert.equal(value,'no-store');},status(code){status=code;return this;},json(value){body=value;}});
    return {status,body};
  }};
}

test('SSO route requires authentication middleware',()=>{
 const f=fixture({id:'clinic-1'}); assert.equal(f.handlers[0],f.authenticate);
});
for(const role of ['patient','clinic_admin','super_admin'])test(`${role} receives only its own business identity`,async()=>{
 const businessId=role==='super_admin'?'auth-1':'business-1';
 const f=fixture({id:businessId,email:'owner@example.test',full_name:'Owner'});
 const actor={id:'auth-1',email:'owner@example.test',role,clinic_id:role==='clinic_admin'?businessId:undefined,patient_id:role==='patient'?businessId:undefined};
 const r=await f.request(actor,{userId:businessId,email:'owner@example.test',role,doctorSlug:'own-doctor'});
 assert.equal(r.status,200);
 const token=new URL(r.body.redirectUrl).searchParams.get('token');
 const claims=jwt.verify(token,'synthetic-test-signing-secret',{issuer:'limitlessbrainlab',audience:'ddo'});
 assert.equal(claims.sub,businessId); assert.equal(claims.role,{patient:'patient',clinic_admin:'doctor',super_admin:'superadmin'}[role]);
 assert.equal(claims.exp-claims.iat,60);
 assert.equal(claims.doctor_slug,role==='patient'?'own-doctor':undefined);
});
for(const input of [
 {userId:'other',email:'owner@example.test',role:'patient'},
 {userId:'patient-1',email:'owner@example.test',role:'super_admin'},
 {userId:'patient-1',email:'other@example.test',role:'patient'}
])test('SSO rejects caller-selected identity: '+JSON.stringify(input),async()=>{
 const f=fixture({id:'patient-1'});
 const r=await f.request({id:'auth-1',patient_id:'patient-1',email:'owner@example.test',role:'patient'},input);
 assert.equal(r.status,403);assert.equal(f.reads(),0);
});
