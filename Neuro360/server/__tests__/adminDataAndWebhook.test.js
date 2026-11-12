const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const verify=require('../middleware/calendlySignature');
const {requireAdmin}=require('../utils/patientEmailAccess');
test('Calendly requires configured secret, exact body signature and fresh timestamp',()=>{
 const oldKey=process.env.CALENDLY_WEBHOOK_SIGNING_KEY,oldSecret=process.env.CALENDLY_WEBHOOK_SECRET;
 try {
  const rawBody=Buffer.from('{ "event": "invitee.created" }');
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=crypto.createHmac('sha256','fixture-key').update(`${timestamp}.`).update(rawBody).digest('hex');
  const req={rawBody,headers:{'calendly-webhook-signature':`t=${timestamp},v1=${signature}`}};
  function run(request){let status=200,allowed=false;verify(request,{status(n){status=n;return this;},json(){}},()=>allowed=true);return{status,allowed};}
  delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY;delete process.env.CALENDLY_WEBHOOK_SECRET;
  assert.equal(run(req).status,503);
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY='fixture-key';
  assert.equal(run(req).allowed,true);
  assert.equal(run({...req,rawBody:Buffer.from('{"event":"invitee.created"}')}).status,401);
  assert.equal(run({...req,rawBody:undefined}).status,401);
  assert.equal(run({...req,headers:{}}).status,401);
  assert.equal(run({...req,headers:{'calendly-webhook-signature':`t=1,v1=${signature}`}}).status,401);
 } finally {
  if(oldKey===undefined)delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY;else process.env.CALENDLY_WEBHOOK_SIGNING_KEY=oldKey;
  if(oldSecret===undefined)delete process.env.CALENDLY_WEBHOOK_SECRET;else process.env.CALENDLY_WEBHOOK_SECRET=oldSecret;
 }
});
test('actual admin data routes deny patient and clinic identities before database access',async()=>{
 const source=fs.readFileSync(require.resolve('../index.js'),'utf8');const handlers={};let reads=0;
 const ctx={app:{get:(p,...h)=>handlers[p]=h,delete:(p,...h)=>handlers[p]=h},authMiddleware(){},require:()=>({requireAdmin}),supabase:{from(){reads++;throw Error('unexpected DB access');}},console:{error(){}}};
 for(const[method,path]of [['get','/api/inquiries/:type'],['delete','/api/inquiries/:type/:id'],['get','/api/website-payments']]){
  const start=source.indexOf(`app.${method}('${path}'`);vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),ctx);
  assert.equal(handlers[path][0],ctx.authMiddleware);
  for(const role of ['patient','clinic_admin']){
   let status=200;const res={status(n){status=n;return this;},json(){}};
   await handlers[path].at(-1)({user:{role},params:{type:'feedback',id:'fixture'}},res);assert.equal(status,403);
  }
 }
 assert.equal(reads,0);
});
