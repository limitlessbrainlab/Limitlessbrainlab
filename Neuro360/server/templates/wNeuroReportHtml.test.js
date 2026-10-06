const assert = require('assert');
const { renderWNeuroHtml } = require('./wNeuroReportHtml');

(async () => {
  const html = await renderWNeuroHtml(
    { name: 'Test Patient', dateOfBirth: '1 Jan 1984', age: 42 },
    { parameters: [] },
    { EC: { relative: { O1: { Delta: 12 }, O2: { Delta: 18 } } } },
  );
  assert.equal((html.match(/<section class="page/g) || []).length, 17, 'W Neuro should render all 17 pages');
  assert(html.includes('Test Patient') && html.includes('1 Jan 1984') && html.includes('42'), 'W Neuro should render patient details');
  assert(html.includes('<b>15%</b>'), 'W Neuro should render eyes-closed wave mix');
  assert(html.includes('Eyes closed') && html.includes('Eyes open'), 'W Neuro should render both brain-map sections');
  assert(html.includes('<header class="wide">'), 'W Neuro closing-page heading should reserve space for the logo');
  assert(html.includes('class="icon"'), 'W Neuro reference cards should retain their icons');
  assert(html.includes('Our philosophy of care'), 'W Neuro should retain the full closing plan page');
  assert(html.includes('If you have more questions, get in touch'), 'W Neuro should retain the closing contact panel');
  assert(html.includes('class="page detail-page"'), 'W Neuro detail pages should use the reference detail layout');
  assert(html.includes('class="eeg-trace'), 'W Neuro should include the 19-channel EEG illustration');
  assert(html.includes('Fp1') && html.includes('O2'), 'EEG illustration should label all recording channels');
  assert(html.includes('class="cover-footer"'), 'cover should use the reference footer band');
  assert(html.includes('eeg-noise'), 'raw EEG should use irregular trace paths');
  assert(html.includes('core-numbers') && html.includes('caution'), 'measurements should retain their reference hierarchy');
  assert(html.includes('holding-page'), 'good-news cards should retain their dedicated treatment');
  assert(html.includes('class="signature-lines"'), 'closing page should use printable signature rules');
  assert(html.includes('sleep-type slow waves are intruding into your waking day'), 'measurements should preserve the full reference explanation');
})().catch(error => { console.error(error); process.exit(1); });
