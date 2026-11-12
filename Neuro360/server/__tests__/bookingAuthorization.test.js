const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {requirePatientEmailAccess,requireAdmin}=require('../utils/patientEmailAccess');
const {createAuthorizedBooking}=require('../services/bookingAuthority');
const patientId='11111111-1111-4111-8111-111111111111';
const clinicId='22222222-2222-4222-8222-222222222222';
const coachId='33333333-3333-4333-8333-333333333333';
const creditId='44444444-4444-4444-8444-444444444444';
const user={id:'auth-id',role:'patient',patient_id:patientId};
function fixture(patients=[{id:patientId,clinic_id:clinicId,email:'patient@example.test'}]) {
 const calls=[];
 const db={from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:{id:coachId,name:'Real Coach',email:'coach@example.test',is_active:true}}),then(resolve){resolve({data:patients,error:null});}};return q;},
 rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'booking',...args.p_booking},error:null};}};
 return {db,calls};
}
test('email access rejects anonymous, other patients and ambiguous shared addresses',async()=>{
 const f=fixture();
 await assert.rejects(requirePatientEmailAccess(null,'patient@example.test',f.db),/Authentication/);
 await assert.rejects(requirePatientEmailAccess({...user,patient_id:coachId},'patient@example.test',f.db),/access denied/);
 assert.equal(await requirePatientEmailAccess(user,'PATIENT@example.test',f.db),'patient@example.test');
 await assert.rejects(requirePatientEmailAccess(user,'patient@example.test',fixture([{id:patientId},{id:coachId}]).db),/access denied/);
 assert.equal(await requirePatientEmailAccess({role:'clinic_admin',clinic_id:clinicId},'patient@example.test',f.db),'patient@example.test');
 await assert.rejects(requirePatientEmailAccess({role:'clinic_admin',clinic_id:coachId},'patient@example.test',f.db),/access denied/);
 assert.throws(()=>requireAdmin(user),/Administrator/);
});
const input={patient_email:'patient@example.test',coach_id:coachId,start_time:'2026-12-01T10:00:00Z',end_time:'2026-12-01T10:30:00Z',status:'completed',coach_email:'attacker@example.test'};
test('booking needs a credit or verified own coaching purchase and ignores client authority fields',async()=>{
 const f=fixture();
 await assert.rejects(createAuthorizedBooking(user,input,f.db,{}),/credit or verified/);
 assert.equal(f.calls.length,0);
 await createAuthorizedBooking(user,{...input,credit_id:creditId},f.db,{});
 assert.equal(f.calls[0].args.p_credit_id,creditId);
 assert.equal(f.calls[0].args.p_actor_id,user.id);
 assert.equal(f.calls[0].args.p_booking.status,'scheduled');
 assert.equal(f.calls[0].args.p_booking.coach_email,'coach@example.test');
 const stripe={checkout:{sessions:{retrieve:async()=>({id:'cs_real',payment_status:'paid',customer_email:'patient@example.test',metadata:{type:'coaching_session',coach_id:coachId}})}}};
 await createAuthorizedBooking(user,{...input,stripe_session_id:'cs_real'},f.db,stripe);
 assert.equal(f.calls[1].args.p_stripe_session_id,'cs_real');
 assert.equal(f.calls[1].args.p_credit_id,null);
 stripe.checkout.sessions.retrieve=async()=>({payment_status:'unpaid'});
 await assert.rejects(createAuthorizedBooking(user,{...input,stripe_session_id:'cs_bad'},f.db,stripe),/verified coaching/);
 assert.equal(f.calls.length,2);
});
test('all protected actual routes install auth; portal and administrative endpoints deny before side effects',async()=>{
 const source=fs.readFileSync(require.resolve('../index.js'),'utf8');
 const registrations={};let stripeCalls=0;
 const f=fixture();
 const ctx={app:{get:(p,...h)=>registrations[p]=h,post:(p,...h)=>registrations[p]=h,put:(p,...h)=>registrations[p]=h},
 authMiddleware(){},require:p=>p.includes('patientEmailAccess')?{requirePatientEmailAccess,requireAdmin}:{createAuthorizedBooking},supabase:f.db,
 stripe:{customers:{list:async()=>{stripeCalls++;return{data:[]};}}},console:{error(){}}};
 const routes=[['post','/api/stripe/create-portal-session'],['get','/api/coaching-credits/:email'],['post','/api/coaching-credits/grant'],['post','/api/coaching-credits/use'],['get','/api/bookings/:email'],['get','/api/all-bookings'],['put','/api/bookings/:id'],['post','/api/bookings']];
 for(const[method,path]of routes){const start=source.indexOf(`app.${method}('${path}',`);vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),ctx);assert.equal(registrations[path][0],ctx.authMiddleware);}
 for(const path of ['/api/coaching-credits/grant','/api/coaching-credits/use','/api/all-bookings','/api/stripe/create-portal-session']){
  let status=200;const res={status(n){status=n;return this;},json(){return this;}};
  await registrations[path].at(-1)({user:{...user,patient_id:coachId},body:{customerEmail:'patient@example.test'},params:{},query:{}},res);
  assert.equal(status,403,path);
 }
 assert.equal(stripeCalls,0);assert.equal(f.calls.length,0);
});
test('atomic booking SQL is service-only, serializes paid retries and decrements credits inside insertion transaction',()=>{
 const sql=fs.readFileSync(require.resolve('../../supabase/migrations/20261111182500_atomic_coach_booking.sql'),'utf8');
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/credits_available>0 AND expires_at>now\(\)/);
 assert.match(sql,/IF NOT FOUND THEN RAISE EXCEPTION 'No available coaching credit'/);
 assert.ok(sql.indexOf('UPDATE public.patient_coaching_credits')<sql.indexOf('INSERT INTO public.coach_bookings'));
});
