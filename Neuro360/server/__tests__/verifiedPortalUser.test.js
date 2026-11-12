const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { verifiedPortalUser } = require('../utils/verifiedPortalUser');
const token = jwt.sign({ sub:'user', session_id:'session' }, 'test-only');
test('verified signature still requires current database session and authority', async () => {
  let active = true;
  const db = { auth: { getUser: async () => ({data:{user:{id:'user',user_metadata:{role:'super_admin'}}}}) }, rpc: async (name,args) => {
    assert.equal(name,'resolve_portal_identity'); assert.deepEqual(args,{p_user_id:'user',p_session_id:'session'}); return {data:active ? {id:'user',role:'patient'} : null};
  } };
  assert.equal((await verifiedPortalUser(db,token)).role,'patient'); active=false; assert.equal(await verifiedPortalUser(db,token),null);
});
test('unverified or mismatched JWT cannot reach authority lookup', async () => {
  const db={auth:{getUser:async()=>({data:{user:{id:'different'}}})},rpc:()=>assert.fail('must not lookup')};
  assert.equal(await verifiedPortalUser(db,token),null);
  db.auth.getUser=async()=>({error:new Error('invalid')}); assert.equal(await verifiedPortalUser(db,token),null);
});
