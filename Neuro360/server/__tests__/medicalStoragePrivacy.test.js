const assert=require('node:assert/strict');
const {test}=require('node:test');
const {makePrivate,BUCKETS}=require('../../privatize-medical-storage.cjs');
function fixture(failId) {
 const buckets=BUCKETS.map(id=>({id,public:id!=='patients_documents',file_size_limit:1024,allowed_mime_types:['application/pdf']}));
 buckets.push({id:'site-images',public:true});
 const calls=[];
 return {buckets,calls,storage:{async listBuckets(){return {data:buckets.map(x=>({...x}))}},async updateBucket(id,options){calls.push({id,options});if(id===failId)return {error:new Error('provider failure')};buckets.find(x=>x.id===id).public=options.public;return {error:null}}}};
}
test('medical privacy changes preserve limits and leave non-medical buckets unchanged',async()=>{
 const f=fixture();const r=await makePrivate(f.storage);assert.equal(r.length,5);assert.ok(r.every(x=>!x.public));assert.equal(f.calls.length,4);
 for(const c of f.calls)assert.deepEqual(c.options,{public:false,fileSizeLimit:1024,allowedMimeTypes:['application/pdf']});
 assert.equal(f.buckets.find(x=>x.id==='site-images').public,true);
});
test('missing medical bucket fails before updates',async()=>{
 const f=fixture();f.buckets.shift();await assert.rejects(makePrivate(f.storage),/missing/);assert.equal(f.calls.length,0);
});
test('API errors stop rollout without reopening already-private buckets',async()=>{
 const f=fixture('patient-reports');await assert.rejects(makePrivate(f.storage),/previous successful changes remain private/);
 assert.equal(f.buckets.find(x=>x.id==='neurosense-reports').public,false);assert.equal(f.calls.length,2);
});
