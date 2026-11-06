const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('profile save keeps clinic and contact names separate and preserves displayed data on failed writes', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/contexts/AuthContext.jsx'), 'utf8');
  const start = source.indexOf('  const updateUser = async');
  const end = source.indexOf('\n  // Memoized', start);
  let patch, fail = false, displayed;
  const user = { id: 'clinic-id', role: 'clinic_admin', name: 'Contact', clinicName: 'Clinic' };
  const context = { user, setLoading() {}, setUser(value) { displayed = value; },
    localStorage: {getItem: () => JSON.stringify(user),setItem() {},removeItem() {}},
    DatabaseService: { async update(table, id, data) { assert.equal(table, 'clinics'); assert.equal(id,user.id); patch = data; if(fail) throw Error('Save failed'); } },
    toast: {success() {},error() {}}, console: {error() {}}, getFriendlyErrorMessage: e => e.message,
  };
  vm.runInNewContext(source.slice(start,end) + '\nglobalThis.save = updateUser;', context);
  assert.equal((await context.save({name:'New Contact',clinicName:'New Clinic',avatar:'https://example.test/photo.png',phone:'123',address:'New Address'})).success,true);
  assert.equal(patch.name,'New Clinic'); assert.equal(patch.contact_person,'New Contact');
  assert.equal(patch.logo_url,'https://example.test/photo.png'); assert.equal(patch.phone,'123');
  assert.equal(patch.address,'New Address'); assert.equal('avatar' in patch,false); assert.equal('clinicName' in patch,false);
  assert.equal((await context.save({name:'Contact Only'})).success,true);
  assert.equal(patch.contact_person,'Contact Only'); assert.equal('name' in patch,false);
  const beforeFailure = displayed;
  fail=true;
  assert.equal((await context.save({name:'Unsaved'})).success,false);
  assert.equal(displayed,beforeFailure);
});
