// Run: node test-clinic-account-ui.mjs. Browser fixtures never change real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(root, '.account-ui-'));
fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="./main.jsx"></script>');
fs.writeFileSync(path.join(dir, 'auth.js'), 'export const useAuth = () => ({ user: window.fixtureUser, updateUser() {} });');
fs.writeFileSync(path.join(dir, 'database.js'), 'export default { get: async () => window.fixtureClinics };');
fs.writeFileSync(path.join(dir, 'supabase.js'), 'export const supabase = { auth: {getSession: async () => ({data:{session:{access_token:"fixture-token"}}})} };');
fs.writeFileSync(path.join(dir, 'empty.jsx'), 'export default function Empty() { return null; }');
fs.writeFileSync(path.join(dir, 'main.jsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
import ProfileModal from '../src/components/layout/ProfileModal';
import ClinicManagement from '../src/components/admin/ClinicManagement';
import '../src/index.css';
const params = new URLSearchParams(location.search);
const dimensions = params.get('type') === 'partner' ? 'width="700" height="200"' : 'width="200" height="700"';
const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" '+dimensions+'><rect width="100%" height="100%" fill="teal"/></svg>');
window.fixtureUser = {role: params.get('role') || 'clinic_admin', name:'Test User', clinicName:'Test Clinic', clinicType: params.get('type') || 'clinic', avatar:params.has('missing') ? '' : params.has('broken') ? '/missing-avatar.png' : avatar};
window.fixtureClinics = [{id:'12345678-1234-4234-8234-123456789abc', name:'Test Clinic', email:'test@example.com', isActive:true, clinicType:'clinic'}, {id:'22345678-1234-4234-8234-123456789abc',name:'Removed Clinic',deletedAt:'2026-01-01'}];
function App() { const [open,setOpen] = React.useState(true); return params.has('management') ? <MemoryRouter><ClinicManagement/></MemoryRouter> : <><button onClick={()=>setOpen(true)}>Open profile</button><ProfileModal isOpen={open} onClose={()=>setOpen(false)}/></>; }
createRoot(document.getElementById('root')).render(<App/>);
`);
let server, browser;
try {
  server = await createServer({root,configFile:false,cacheDir:path.join(dir,'.vite'),optimizeDeps:{entries:[path.join(dir,'index.html')]},plugins:[{
    name:'account-test-fixtures',enforce:'pre',resolveId(source) {
      if(source.endsWith('/contexts/AuthContext')) return path.join(dir,'auth.js');
      if(source.endsWith('/services/databaseService')) return path.join(dir,'database.js');
      if(source.endsWith('/lib/supabaseClient')) return path.join(dir,'supabase.js');
      if(source.endsWith('/PendingClinicsNotification') || source.endsWith('/AdminAssignmentModal')) return path.join(dir,'empty.jsx');
    }
  },react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/${path.basename(dir)}/index.html`;
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for(const type of ['clinic','partner']) {
    await page.goto(base+'?type='+type);
    const view=page.getByRole('button',{name:'View profile picture'});
    await view.click();
    const dialog=page.getByRole('dialog',{name:'Profile picture'});
    assert.equal(await dialog.isVisible(),true);
    await view.evaluate(el=>el.focus());
    assert.equal(await view.evaluate(el=>el===document.activeElement),false, 'background controls are inert while the viewer is open');
    assert.equal(await dialog.locator('img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(),false);
    assert.equal(await view.evaluate(el=>el===document.activeElement),true);
    await view.click(); await page.getByRole('button',{name:'Close profile picture'}).click();
    assert.equal(await page.getByText('Profile Settings',{exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'Close profile settings'}).click();
    await page.getByRole('button',{name:'Open profile',exact:true}).click();
    assert.equal(await dialog.isVisible(),false);
  }
  await page.setViewportSize({width:390,height:844}); await page.goto(base);
  await page.getByRole('button',{name:'View profile picture'}).click();
  const bounds=await page.getByRole('dialog').boundingBox();
  assert.ok(bounds.width<=390 && bounds.height<=844);
  for(const flag of ['missing','broken']) {
    await page.goto(base+'?'+flag);
    if(flag==='broken') await page.waitForFunction(()=>!document.querySelector('img[alt="Profile"]'));
    assert.equal(await page.getByRole('button',{name:'View profile picture'}).count(),0);
  }
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:900}); await page.goto(base+'?management&role=super_admin');
    const remove=page.getByRole('button',{name:'Delete account for Test Clinic'}).filter({visible:true});
    await remove.waitFor();
    assert.equal(await page.getByText('Removed Clinic',{exact:true}).count(),0);
    let requests=0;
    await page.route('**/api/admin/clinics/*',async route=>{requests++;await route.fulfill({status:500,contentType:'application/json',body:'{"message":"Test failure"}'});});
    page.once('dialog',d=>d.dismiss());await remove.click();assert.equal(requests,0);
    page.once('dialog',d=>d.accept());await remove.click();
    await page.waitForFunction(()=>!document.querySelector('button[title="Delete Account"]').disabled);
    assert.equal(requests,1);assert.equal(await remove.isVisible(),true);
    await page.unroute('**/api/admin/clinics/*');
    await page.route('**/api/admin/clinics/*',async route=>{requests++;await page.evaluate(()=>{window.fixtureClinics=[];});await route.fulfill({contentType:'application/json',body:'{"success":true}'});});
    page.once('dialog',d=>d.accept());await remove.click();await remove.waitFor({state:'hidden'});assert.equal(requests,2);
    await page.unroute('**/api/admin/clinics/*');
  }
  await page.goto(base+'?management&role=clinic_admin');
  await page.getByText('Clinic/Partner Management',{exact:true}).waitFor();
  assert.equal(await page.locator('button[title="Delete Account"]').count(),0);
  console.log('Profile viewer and clinic removal UI checks passed');
} finally {await browser?.close();await server?.close();fs.rmSync(dir,{recursive:true,force:true});}
