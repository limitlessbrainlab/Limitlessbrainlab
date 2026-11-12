const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {fetchTrustedJotformSubmission}=require('../services/trustedJotformSubmission');
test('webhook answers come only from matching active JotForm API submission',async()=>{
 let calls=0;
 const content={id:'123',form_id:'456',status:'ACTIVE',created_at:'2026-11-01',answers:{1:{text:'Email',answer:'owner@example.test'},2:{text:'Score',answer:'42'}}};
 const request=async()=>{calls++;return{ok:true,json:async()=>({responseCode:200,content})};};
 await assert.rejects(fetchTrustedJotformSubmission({formID:'456',submissionID:'123'},'',request),/not configured/);assert.equal(calls,0);
 const verified=await fetchTrustedJotformSubmission({formID:'456',submissionID:'123',pretty:'Score:999',rawRequest:'{"email":"victim@example.test"}'},'fixture',request);
 assert.equal(verified.answers[2].answer,'42');assert.equal(verified.pretty,'Email:owner@example.test, Score:42');
 content.form_id='789';await assert.rejects(fetchTrustedJotformSubmission({formID:'456',submissionID:'123'},'fixture',request),/does not match/);
 content.form_id='456';content.status='DELETED';await assert.rejects(fetchTrustedJotformSubmission({formID:'456',submissionID:'123'},'fixture',request),/does not match/);
});
const source=fs.readFileSync(require.resolve('../index.js'),'utf8');
test('subscription grants exactly the bound patient or newest legacy row and fails on missing owner',async()=>{
 const start=source.indexOf('async function applySubscriptionPurchase(session)');const end=source.indexOf('  // 2. Payment rows',start);
 const code=source.slice(start,end)+' return {ok:true}; } this.run=applySubscriptionPurchase;';
 const rows=[{id:'older',email:'same@example.test',created_at:'2020-01-01'},{id:'newer',email:'same@example.test',created_at:'2021-01-01'}];
 for(const chosen of ['older',undefined,'missing']){
  const writes=[];
  const db={from(){const filters=[];let update=false,sort=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){sort=true;return q;},limit(){return q;},update(){update=true;return q;},maybeSingle:async()=>{let matching=rows.filter(row=>filters.every(([k,v])=>row[k]===v));if(sort)matching.sort((a,b)=>b.created_at.localeCompare(a.created_at));if(update)writes.push(...matching.map(r=>r.id));return{data:matching[0]||null,error:null};}};return q;}};
  const ctx={supabase:db,console};vm.runInNewContext(code,ctx);
  const paid={payment_status:'paid',customer_email:'same@example.test',metadata:{type:'subscription',tier:'BASIC',...(chosen?{patient_id:chosen}:{})},amount_total:1200,currency:'usd'};
  if(chosen==='missing')await assert.rejects(ctx.run(paid),/could not be resolved/);else await ctx.run(paid);
  assert.deepEqual(writes,chosen==='missing'?[]:[chosen||'newer']);
 }
});
test('assessment token capture never substitutes another patient submission',async()=>{
 const start=source.indexOf('async function fetchJotformSubmission(');const end=source.indexOf('\n}',start)+2;
 const ctx={JOTFORM_API_KEY:'fixture',fetch:async()=>({ok:true,json:async()=>({content:[{id:'1',created_at:'2026-11-01',answers:{1:{text:'Email',answer:'other@example.test'}}}]})}),extractAssessmentScore(){},console,encodeURIComponent};
 vm.runInNewContext(source.slice(start,end)+';this.run=fetchJotformSubmission',ctx);
 assert.equal(await ctx.run('123','owner@example.test'),null);
 assert.equal(await ctx.run('123',''),null);
 const own=await ctx.run('123','other@example.test');assert.equal(own.submissionID,'1');
});
