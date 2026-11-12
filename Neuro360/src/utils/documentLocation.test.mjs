import assert from 'node:assert/strict';
import {test} from 'node:test';
import {documentLocation} from './documentLocation.js';
test('historical public and expired signed references resolve to the same canonical owner key',()=>{
 for(const mode of ['public','sign','authenticated']) assert.deepEqual(documentLocation(`https://project.supabase.co/storage/v1/object/${mode}/neurosense-reports/reports/a%20b.pdf?token=old`),{bucket:'neurosense-reports',path:'reports/a b.pdf',origin:'https://project.supabase.co'});
});
test('bucket prefixes and raw keys retain exact object paths',()=>{
 assert.deepEqual(documentLocation('edf-files/clinic/patient/file.edf'),{bucket:'edf-files',path:'clinic/patient/file.edf',origin:null});
 assert.equal(documentLocation('a.pdf','patient-reports').path,'a.pdf');
});
test('malformed object paths fail closed, unrelated URLs remain distinct',()=>{
 for(const path of ['../x','a//b','a/../b','a\\b']) assert.throws(()=>documentLocation(path,'neurosense-reports'));
 assert.equal(documentLocation('https://example.com/report.pdf'),null);
});
