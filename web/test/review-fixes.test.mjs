// Regression tests for defects found in the October 2026 five-perspective review.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {startServer} from './server.mjs';

const KEY = 'pqc-buyer-workbook:v1';
let BASE, server, browser;
before(async () => { server = await startServer(); BASE = server.url; browser = await chromium.launch({headless:true}); });
after(async () => { await browser.close(); await server.close(); });

const assessment = (extra = {}) => ({schemaVersion:3, createdAt:'2026-10-09T00:00:00.000Z', updatedAt:'2026-10-09T00:00:00.000Z',
  buyer:{product:'Sample Gateway', version:'2.4.1', configuration:'Edge TLS', setting:'Commercial / campus'},
  survey:{}, crypto:[], boms:[], evidence:[], tests:{}, customTests:[], controls:{}, actions:[], licensing:{}, licenses:[], ...extra});
const proof = (id, linkedIds, extra = {}) => ({id, linkedIds, type:'Test trace', artifact:'Lab trace', issuer:'Buyer lab', date:'2026-10-09',
  productMatch:'Yes', pathMatch:'Yes', location:'https://example.test/trace', result:'Accepted', ...extra});
const fullUse = {id:'CU-001', protected:'Admin access', function:'Key establishment', path:'Browser to edge', current:'X25519MLKEM768', component:'TLS 4', coverage:'Edge only'};

async function open(state, init) {
  const context = await browser.newContext({acceptDownloads:true});
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  if (state) await page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); }
  }, [KEY, JSON.stringify(state)]);
  await page.goto(BASE);
  return {context, page};
}
async function download(page, action, timeout = 5000) {
  const [file] = await Promise.all([page.waitForEvent('download', {timeout}), action()]);
  return fs.readFile(await file.path(), 'utf8');
}
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
const go = (page, route) => page.locator(`nav [data-route="${route}"]`).click();

test('typing in a control owner or rationale keeps focus and every character', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'controls');
    for (const field of ['rationale', 'ownerTeam']) {
      const box = page.locator(`[data-control="C01"][data-field="${field}"]`);
      await box.click();
      await page.keyboard.type('abc');
      assert.equal(await box.inputValue(), 'abc', field);
    }
  } finally { await context.close(); }
});

const unnamedControls = page => page.evaluate(() => [...document.querySelectorAll('#view input, #view select, #view textarea, #record-dialog[open] input, #record-dialog[open] select, #record-dialog[open] textarea')]
  .filter(el => el.type !== 'hidden' && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
  .map(el => el.dataset.field || el.name || el.id || el.type));

test('every form control in the work sections and record dialogs has an accessible name', async () => {
  const {context, page} = await open();
  try {
    for (const route of ['overview', 'survey', 'tests', 'controls', 'licensing']) {
      await go(page, route);
      assert.deepEqual(await unnamedControls(page), [], route);
    }
    for (const [route, kind] of [['crypto', 'crypto'], ['crypto', 'boms'], ['evidence', 'evidence'], ['actions', 'actions'], ['licensing', 'licenses'], ['tests', 'customTests']]) {
      await go(page, route);
      await page.locator(`[data-add="${kind}"]`).click();
      assert.deepEqual(await unnamedControls(page), [], kind);
      await page.locator('#dialog-close').click();
    }
  } finally { await context.close(); }
});

test('an unreadable saved assessment is kept for download instead of being overwritten', async () => {
  const {context, page} = await open();
  try {
    await page.evaluate(key => localStorage.setItem(key, '{not json'), KEY);
    await page.reload();
    await page.locator('[data-buyer="product"]').fill('New work');
    assert.equal(await page.evaluate(() => localStorage.getItem('pqc-buyer-workbook:unreadable')), '{not json');
    const text = await download(page, () => page.locator('[data-action="download-unreadable"]').click({timeout:3000}));
    assert.equal(text, '{not json');
  } finally { await context.close(); }
});

test('a change saved in another tab appears without a reload', async () => {
  const context = await browser.newContext();
  try {
    const first = await context.newPage(), second = await context.newPage();
    await first.goto(BASE); await second.goto(BASE);
    await first.locator('[data-buyer="product"]').fill('Tab one');
    await second.waitForFunction(() => document.querySelector('[data-buyer="product"]')?.value === 'Tab one', null, {timeout:5000});
  } finally { await context.close(); }
});

test('a deleted record id is never reissued and links to it are removed', async () => {
  const {context, page} = await open(assessment({
    crypto:[{...fullUse}, {...fullUse, id:'CU-002', protected:'Origin leg'}],
    evidence:[proof('EV-001', ['CU-002', 'Q01'])], tests:{T01:{cryptoUseId:'CU-002'}}
  }));
  try {
    page.on('dialog', dialog => dialog.accept());
    await go(page, 'crypto');
    await page.locator('[data-delete="crypto"][data-id="CU-002"]').click();
    await page.locator('[data-add="crypto"]').click();
    assert.equal(await page.locator('#record-form [name="id"]').inputValue(), 'CU-003');
    await page.locator('#dialog-close').click();
    const state = await saved(page);
    assert.deepEqual(state.evidence[0].linkedIds, ['Q01']);
    assert.equal(state.tests.T01.cryptoUseId, '');
  } finally { await context.close(); }
});

test('proof that links to an unknown id is flagged', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'evidence');
    await page.locator('[data-add="evidence"]').click();
    await page.locator('#record-form [name="artifact"]').fill('Report');
    await page.locator('#record-form [name="linkedIds"]').fill('Q01, CU-404');
    await page.locator('#record-form button[type="submit"]').click();
    await page.locator('.integrity-warning').waitFor({timeout:5000});
    assert.match(await page.locator('.integrity-warning').textContent(), /CU-404/);
  } finally { await context.close(); }
});

test('proof linked to BOM, action, and license records is shown on those records', async () => {
  const {context, page} = await open(assessment({
    boms:[{id:'BM-001', kind:'SBOM', target:'Sample Gateway'}], actions:[{id:'AC-001', gap:'Missing trace', status:'Open'}],
    licenses:[{id:'LI-001', name:'Evaluation agreement'}],
    evidence:[{id:'EV-001', artifact:'Notice', linkedIds:['BM-001', 'AC-001', 'LI-001'], result:'Not reviewed'}]
  }));
  try {
    await go(page, 'crypto');
    assert.match(await page.locator('.section').filter({hasText:'SBOM and CBOM register'}).textContent(), /EV-001/);
    await go(page, 'actions');
    assert.match(await page.locator('.record').first().textContent(), /EV-001/);
    await go(page, 'licensing');
    assert.match(await page.locator('.section').filter({hasText:'License register'}).textContent(), /EV-001/);
  } finally { await context.close(); }
});

test('control proof says whether it was linked directly or through a question', async () => {
  const {context, page} = await open(assessment({evidence:[proof('EV-001', ['C01']), proof('EV-002', ['Q02'])]}));
  try {
    await go(page, 'controls');
    const pills = await page.locator('.record.control .linked-list .pill').allTextContents();
    assert.ok(pills.some(text => /EV-001.*direct/i.test(text)), pills.join(' | '));
    assert.ok(pills.some(text => /EV-002.*via Q02/i.test(text)), pills.join(' | '));
  } finally { await context.close(); }
});

test('clearing a survey answer removes its untouched supplier statement', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'survey');
    await page.locator('[data-survey="Q01"][data-field="answer"]').selectOption('Yes');
    assert.equal((await saved(page)).evidence.length, 1);
    await page.locator('[data-survey="Q01"][data-field="answer"]').selectOption('');
    assert.equal((await saved(page)).evidence.length, 0);
  } finally { await context.close(); }
});

test('claim drafts export where randomUUID is unavailable, as on a plain-HTTP host', async () => {
  const {context, page} = await open(assessment({crypto:[fullUse], evidence:[proof('EV-001', ['CU-001'])]}),
    () => Object.defineProperty(Crypto.prototype, 'randomUUID', {value:undefined, configurable:true}));
  try {
    await go(page, 'attestations');
    const text = await download(page, async () => {
      await page.locator('[data-export-claims]').click();
      await page.locator('[data-confirm-claims]').click({timeout:3000});
    });
    assert.match(JSON.parse(text).serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally { await context.close(); }
});

test('claim draft export can leave out proof locations', async () => {
  const {context, page} = await open(assessment({crypto:[fullUse], evidence:[proof('EV-001', ['CU-001'], {location:'https://example.test/secret-path'})]}));
  try {
    await go(page, 'attestations');
    const text = await download(page, async () => {
      await page.locator('[data-export-claims]').click();
      await page.locator('#claims-omit-locations').check({timeout:3000});
      await page.locator('[data-confirm-claims]').click();
    });
    assert.doesNotMatch(text, /secret-path/);
  } finally { await context.close(); }
});

test('a whole-assessment import offers to export current work first and names dropped fields', async () => {
  const {context, page} = await open();
  try {
    await page.locator('[data-buyer="product"]').fill('Current work');
    const incoming = {format:'pqc-buyer-workbook', exportedAt:'2026-10-09T00:00:00Z',
      assessment:assessment({buyer:{product:'Incoming'}, evidence:[{id:'EV-001', artifact:'Report', mystery:'field'}]}), attachments:[]};
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles({name:'incoming.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(incoming))});
    await page.locator('[data-import-choice="replace"]').waitFor({timeout:5000});
    assert.match(await page.locator('#transfer-body').textContent(), /mystery/);
    assert.equal(await page.locator('[data-import-choice="export"]').count(), 1);
    await page.locator('[data-import-choice="replace"]').click();
    await page.getByText('Assessment imported and saved locally.').waitFor();
    assert.equal(await page.locator('[data-buyer="product"]').inputValue(), 'Incoming');
  } finally { await context.close(); }
});

test('clearing the assessment offers to export it first', async () => {
  const {context, page} = await open(assessment());
  try {
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-reset-choice="export"]').waitFor({timeout:3000});
    await page.locator('[data-reset-choice="clear"]').click();
    await page.getByText('Assessment cleared.').waitFor();
    assert.equal(await page.locator('[data-buyer="product"]').inputValue(), '');
  } finally { await context.close(); }
});

test('the header says when changes have not been exported', async () => {
  const {context, page} = await open();
  try {
    await page.locator('[data-buyer="product"]').fill('Gateway');
    assert.match(await page.locator('#export-status').textContent({timeout:3000}), /not exported/i);
    await download(page, async () => { await page.locator('#export-button').click(); await page.locator('[data-export="answers"]').click(); });
    const status = await page.locator('#export-status').textContent();
    assert.match(status, /exported/i);
    assert.doesNotMatch(status, /not exported/i);
  } finally { await context.close(); }
});

test('choosing Proceed with an unresolved buyer-required test shows a warning', async () => {
  const {context, page} = await open(assessment({tests:{T01:{requiredForProcurement:'Yes'}}}));
  try {
    await page.locator('[data-buyer="decision"]').selectOption('Proceed');
    await page.locator('.decision-warning').waitFor({timeout:3000});
    assert.match(await page.locator('.decision-warning').textContent(), /buyer-required/i);
  } finally { await context.close(); }
});

test('an encrypted export opens only with its passphrase', async () => {
  const {context, page} = await open();
  const second = await open();
  try {
    await page.locator('[data-buyer="product"]').fill('Secret Gateway');
    await page.locator('#export-button').click();
    await page.locator('#export-encrypt').check({timeout:3000});
    await page.locator('#export-passphrase').fill('correct horse battery');
    await page.locator('#export-passphrase-confirm').fill('correct horse battery');
    const text = await download(page, () => page.locator('[data-export="all"]').click(), 60000);
    assert.equal(JSON.parse(text).format, 'pqc-buyer-workbook-encrypted');
    assert.doesNotMatch(text, /Secret Gateway/);
    const p2 = second.page;
    await p2.locator('#import-button').click();
    await p2.locator('#import-file').setInputFiles({name:'encrypted.json', mimeType:'application/json', buffer:Buffer.from(text)});
    await p2.locator('#import-passphrase').fill('wrong passphrase');
    await p2.locator('[data-import-decrypt]').click();
    await p2.getByText(/passphrase did not open/i).waitFor({timeout:60000});
    await p2.locator('#import-passphrase').fill('correct horse battery');
    await p2.locator('[data-import-decrypt]').click();
    await p2.locator('[data-import-choice="replace"]').click({timeout:60000});
    await p2.getByText('Assessment imported and saved locally.').waitFor();
    assert.equal(await p2.locator('[data-buyer="product"]').inputValue(), 'Secret Gateway');
  } finally { await context.close(); await second.context.close(); }
});

test('private key text is refused in record dialogs, inline fields, and whole-assessment imports', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'evidence');
    await page.locator('[data-add="evidence"]').click();
    await page.locator('#record-form [name="artifact"]').fill('Key dump');
    await page.locator('#record-form [name="note"]').fill('-----BEGIN PRIVATE KEY-----\nMIIE');
    await page.locator('#record-form button[type="submit"]').click();
    await page.getByText(/Do not enter private keys/).waitFor({timeout:3000});
    assert.equal(await page.locator('#record-dialog').evaluate(node => node.open), true);
    await page.locator('#dialog-close').click();
    await go(page, 'overview');
    await page.locator('[data-buyer="product"]').fill('-----BEGIN PRIVATE KEY-----');
    assert.notEqual((await saved(page))?.buyer?.product, '-----BEGIN PRIVATE KEY-----');
    const bad = {format:'pqc-buyer-workbook', assessment:assessment({evidence:[{id:'EV-001', note:'-----BEGIN PRIVATE KEY-----'}]}), attachments:[]};
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles({name:'bad.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(bad))});
    await page.getByText(/secret key material/).waitFor({timeout:3000});
  } finally { await context.close(); }
});

test('an attachment whose bytes do not match its file type is refused', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'evidence');
    await page.locator('[data-add="evidence"]').click();
    await page.locator('#record-form [name="artifact"]').fill('Fake PDF');
    await page.locator('#evidence-file').setInputFiles({name:'report.pdf', mimeType:'application/pdf', buffer:Buffer.from('not really a pdf')});
    await page.locator('#record-form button[type="submit"]').click();
    await page.getByText(/do not match its type/).waitFor({timeout:3000});
    assert.equal((await saved(page))?.evidence?.length || 0, 0);
  } finally { await context.close(); }
});

test('a full export still downloads when one attachment is missing from browser storage', async () => {
  const {context, page} = await open(assessment({evidence:[{id:'EV-001', artifact:'Trace', attachmentName:'gone.txt', attachmentType:'text/plain', attachmentSize:5}]}));
  try {
    const text = await download(page, async () => { await page.locator('#export-button').click(); await page.locator('[data-export="all"]').click(); });
    const payload = JSON.parse(text);
    assert.equal(payload.attachments.length, 0);
    assert.match(payload.assessment.evidence[0].note, /missing/);
  } finally { await context.close(); }
});

test('test results are labeled as reviewer-recorded and inconclusive results are highlighted', async () => {
  const {context, page} = await open(assessment({tests:{T01:{result:'Inconclusive'}}}));
  try {
    await go(page, 'tests');
    assert.equal(await page.locator('[data-test="T01"][data-field="result"] option[value="Observed"]').textContent({timeout:3000}), 'Observed (reviewer-recorded)');
    assert.match(await page.locator('.record .record-top .pill').first().getAttribute('class'), /\bwarn\b/);
  } finally { await context.close(); }
});

test('help text and list headings meet WCAG AA contrast and small labels stay readable', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'survey');
    const result = await page.evaluate(() => {
      const rgb = value => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = color => { const c = rgb(color).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const background = el => { for (let node = el; node; node = node.parentElement) { const b = getComputedStyle(node).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return 'rgb(255,255,255)'; };
      const ratio = el => { const [a, b] = [lum(getComputedStyle(el).color), lum(background(el))].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
      return {help: ratio(document.querySelector('.help')), group: ratio(document.querySelector('.question-group')),
        pill: parseFloat(getComputedStyle(document.querySelector('.pill')).fontSize), groupSize: parseFloat(getComputedStyle(document.querySelector('.question-group')).fontSize)};
    });
    assert.ok(result.help >= 4.5, `help ${result.help}`);
    assert.ok(result.group >= 4.5, `group ${result.group}`);
    assert.ok(result.pill >= 11 && result.groupSize >= 11, JSON.stringify(result));
  } finally { await context.close(); }
});

test('the selected question, test, and control are announced as current', async () => {
  const {context, page} = await open();
  try {
    for (const route of ['survey', 'tests', 'controls']) {
      await go(page, route);
      assert.equal(await page.locator('.question-item.active').getAttribute('aria-current'), 'true', route);
    }
  } finally { await context.close(); }
});

test('the printed record carries survey answers, evidence, and test limits', async () => {
  const {context, page} = await open(assessment({crypto:[fullUse], survey:{Q01:{answer:'Yes', review:'Accepted'}},
    evidence:[proof('EV-001', ['T01', 'CU-001'])],
    tests:{T01:{result:'Observed', cryptoUseId:'CU-001', negative:'classical client rejected', limits:'edge leg only'}}}),
    () => { window.print = () => {}; });
  try {
    await page.locator('#print-button').click();
    const text = await page.locator('#print-root').textContent();
    for (const expected of ['Survey answers', 'Evidence register', 'EV-001', 'classical client rejected', 'edge leg only']) assert.match(text, new RegExp(expected));
  } finally { await context.close(); }
});

test('topology treats node names that differ only in case or spacing as one system', async () => {
  const {context, page} = await open(assessment({crypto:[
    {...fullUse, sourceNode:'Gateway', destinationNode:'Origin'}, {...fullUse, id:'CU-002', sourceNode:'gateway ', destinationNode:'Broker'}]}));
  try {
    await go(page, 'crypto');
    assert.equal(await page.locator('.topology svg circle').count(), 3);
  } finally { await context.close(); }
});

test('a license source that is not a web address renders as text, not an empty link', async () => {
  const {context, page} = await open(assessment({licenses:[{id:'LI-001', name:'Evaluation agreement', sourceUrl:'internal wiki page'}]}));
  try {
    await go(page, 'licensing');
    assert.equal(await page.locator('a[href=""]').count(), 0);
    assert.match(await page.locator('.section').filter({hasText:'License register'}).textContent(), /internal wiki page/);
  } finally { await context.close(); }
});

test('a malformed save time never shows Invalid Date', async () => {
  const {context, page} = await open(assessment({updatedAt:'garbage'}));
  try { assert.doesNotMatch(await page.locator('#save-status').textContent(), /Invalid/); }
  finally { await context.close(); }
});

test('overview and print counts use the scorecard definitions, with accepted risk listed apart', async () => {
  const {context, page} = await open(assessment({
    evidence:[proof('EV-001', ['Q01'], {pathMatch:'No'})],
    actions:[{id:'AC-001', gap:'a', status:'Open'}, {id:'AC-002', gap:'b', status:'Blocked'}, {id:'AC-003', gap:'c', status:'In progress'},
      {id:'AC-004', gap:'d', status:'Accepted risk'}, {id:'AC-005', gap:'e', status:'Closed'}]
  }), () => { window.print = () => {}; });
  try {
    const stats = await page.locator('.stats').first().textContent();
    assert.match(stats, /1 accepted/);
    assert.match(stats, /0 qualif/);
    await page.locator('#print-button').click();
    const open = await page.locator('#print-root section').filter({hasText:'Open actions'}).textContent();
    assert.match(open, /AC-002/);
    assert.doesNotMatch(open, /AC-004|AC-005/);
    assert.match(await page.locator('#print-root section').filter({hasText:'Accepted risks'}).textContent(), /AC-004/);
  } finally { await context.close(); }
});

test('accepted-risk actions record an approver, scope, and expiry, and the scorecard flags gaps', async () => {
  const {context, page} = await open(assessment({actions:[{id:'AC-001', gap:'Classical broker leg', status:'Accepted risk'}]}));
  try {
    await go(page, 'actions');
    await page.locator('[data-add="actions"]').click();
    for (const name of ['riskApprover', 'riskScope', 'riskExpiry']) assert.equal(await page.locator(`#record-form [name="${name}"]`).count(), 1, name);
    await page.locator('#dialog-close').click();
    await go(page, 'scorecard');
    assert.match(await page.locator('.score-grid').textContent(), /1 accepted risk.*without an approver or expiry/i);
  } finally { await context.close(); }
});

test('scorecard remedies never ask to complete zero records', async () => {
  const {context, page} = await open(assessment({crypto:[{...fullUse, cbomRef:'cbom-mlkem'}]}));
  try {
    await go(page, 'scorecard');
    assert.doesNotMatch(await page.locator('.score-grid').textContent(), /Complete 0/);
  } finally { await context.close(); }
});

test('the scorecard keeps bars for completeness only and shows who produced the qualified proof', async () => {
  const {context, page} = await open(assessment({evidence:[proof('EV-001', ['Q01'], {producer:'Buyer'}), proof('EV-002', ['Q02'], {type:'Vendor statement'})]}));
  try {
    await go(page, 'scorecard');
    assert.equal(await page.locator('.score-bar').count(), 3);
    const text = await page.locator('#view').textContent();
    assert.match(text, /Qualified proof by producer/);
    assert.match(text, /Buyer: 1/);
    assert.match(text, /Supplier: 1/);
  } finally { await context.close(); }
});

test('untrusted text stays inert in the import preview, link warnings, and license sources', async () => {
  const payload = '<img src=x onerror="window.__xss=1">';
  const {context, page} = await open(assessment({evidence:[{id:'EV-001', artifact:'Report', linkedIds:[payload]}],
    licenses:[{id:'LI-001', name:'Agreement', sourceUrl:payload}]}));
  try {
    await go(page, 'evidence');
    await page.locator('.integrity-warning').waitFor({timeout:3000});
    await go(page, 'licensing');
    const incoming = {format:'pqc-buyer-workbook', assessment:{...assessment({buyer:{product:payload}}), [payload]:1}, attachments:[]};
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles({name:'x.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(incoming))});
    await page.locator('[data-import-choice="cancel"]').waitFor({timeout:3000});
    assert.equal(await page.locator('#transfer-body img, #view img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  } finally { await context.close(); }
});

async function xlsx(sheetName, sheetXml, sharedStrings) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  if (sharedStrings) zip.file('xl/sharedStrings.xml', sharedStrings);
  return zip.generateAsync({type:'nodebuffer', compression:'DEFLATE'});
}
const cellRow = (n, cells) => `<row r="${n}">${cells.join('')}</row>`;
const inline = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const sheet = rows => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;

test('Excel evidence dates stored as serial numbers import as calendar dates', async () => {
  const {context, page} = await open();
  try {
    const file = await xlsx('Evidence', sheet([cellRow(1, [inline('A1', 'Proof ID'), inline('B1', 'What is the artifact?'), inline('C1', 'Date')]),
      cellRow(2, [inline('A2', 'EV-001'), inline('B2', 'Lab report'), '<c r="C2"><v>46304</v></c>'])]));
    await go(page, 'evidence');
    await page.locator('[data-import-records="evidence"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'proof.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:file});
    await page.locator('[data-apply-record-import]').click();
    assert.match(await page.locator('.record').first().textContent(), /2026-10-09/);
  } finally { await context.close(); }
});

test('Excel phonetic reading text is not merged into imported cell values', async () => {
  const {context, page} = await open();
  try {
    const strings = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Use ID</t></si><si><t>What is protected or verified?</t></si><si><t>Current method</t></si><si><t>Firmware</t><rPh sb="0" eb="1"><t>FAAMU</t></rPh></si><si><t>ML-DSA-65</t></si></sst>';
    const s = (ref, index) => `<c r="${ref}" t="s"><v>${index}</v></c>`;
    const file = await xlsx('Crypto Map', sheet([cellRow(1, [s('A1', 0), s('B1', 1), s('C1', 2)]), cellRow(2, [inline('A2', 'CU-001'), s('B2', 3), s('C2', 4)])]), strings);
    await go(page, 'crypto');
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'uses.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:file});
    await page.locator('[data-apply-record-import]').click();
    const title = await page.locator('.record-list .record h3').last().textContent();
    assert.match(title, /Firmware/);
    assert.doesNotMatch(title, /FAAMU/);
  } finally { await context.close(); }
});

test('an Excel part whose zip header understates its size is stopped by the byte cap', async () => {
  const {context, page} = await open();
  try {
    const file = await xlsx('Crypto Map', sheet([' '.repeat(9 * 1024 * 1024)]));
    const name = Buffer.from('xl/worksheets/sheet1.xml');
    const local = file.indexOf(name), central = file.indexOf(name, local + 1);
    file.writeUInt32LE(100, local - 30 + 22);
    file.writeUInt32LE(100, central - 46 + 24);
    await go(page, 'crypto');
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'bomb.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:file});
    await page.getByText('An Excel part is too large.').waitFor({timeout:5000});
  } finally { await context.close(); }
});

test('a lowercase record id can still be linked to proof and claim drafts', async () => {
  const {context, page} = await open(assessment());
  try {
    await go(page, 'crypto');
    await page.locator('[data-add="crypto"]').click();
    await page.locator('#record-form [name="id"]').fill('cu-009');
    await page.locator('#record-form [name="function"]').selectOption('Key establishment');
    await page.locator('#record-form [name="path"]').fill('Browser to edge');
    await page.locator('#record-form [name="current"]').fill('X25519MLKEM768');
    await page.locator('#record-form button[type="submit"]').click();
    await go(page, 'evidence');
    await page.locator('[data-add="evidence"]').click();
    for (const [name, value] of [['artifact', 'Trace'], ['issuer', 'Lab'], ['date', '2026-10-09'], ['location', 'https://example.test/t'], ['linkedIds', 'cu-009']])
      await page.locator(`#record-form [name="${name}"]`).fill(value);
    for (const [name, value] of [['productMatch', 'Yes'], ['pathMatch', 'Yes'], ['result', 'Accepted']])
      await page.locator(`#record-form [name="${name}"]`).selectOption(value);
    await page.locator('#record-form button[type="submit"]').click();
    await go(page, 'attestations');
    assert.match(await page.locator('.claim-draft').first().textContent(), /Supporting proof: EV-001/);
  } finally { await context.close(); }
});

test('a filled crypto map and evidence sheet from the generated Excel workbook import intact', async () => {
  const {buildWorkbook} = await import('../../build_workbook.mjs');
  const workbook = await buildWorkbook();
  const fill = (name, values) => {
    const sheet = workbook.getWorksheet(name), headers = sheet.getRow(5).values;
    for (const [heading, value] of Object.entries(values)) {
      assert.ok(headers.includes(heading), `${name} lacks column ${heading}`);
      sheet.getRow(6).getCell(headers.indexOf(heading)).value = value;
    }
  };
  fill('Crypto Map', {'Use ID':'CU-001', 'What is protected or verified?':'Admin access', 'Source system':'Admin browser', 'Destination system':'Gateway', 'Current method':'X25519MLKEM768'});
  fill('Evidence', {'Proof ID':'EV-001', 'What is the artifact?':'Lab trace', 'Produced by':'Buyer', 'Date':new Date(Date.UTC(2026, 9, 9))});
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const {context, page} = await open();
  try {
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await go(page, 'crypto');
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'workbook.xlsx', mimeType:type, buffer});
    await page.locator('[data-apply-record-import]').click();
    assert.match(await page.locator('.topology-paths').textContent(), /Admin browser → Gateway/);
    await go(page, 'evidence');
    await page.locator('[data-import-records="evidence"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'workbook.xlsx', mimeType:type, buffer});
    await page.locator('[data-apply-record-import]').click();
    assert.match(await page.locator('.record').first().textContent(), /produced by Buyer.*2026-10-09/);
  } finally { await context.close(); }
});

async function targetPacket() {
  const {startFixture, probeTarget} = await import('../../tools/replay/replay.mjs');
  const fixture = await startFixture({groups:'X25519MLKEM768'});
  try { return await probeTarget({host:'127.0.0.1', port:fixture.port, servername:'localhost', ca:fixture.cert, requireHybrid:true, build:'4.2.0-demo lab'}); }
  finally { await fixture.close(); }
}
async function importReplay(page, packet) {
  await go(page, 'tests');
  await page.locator('[data-import-replay]').click();
  await page.locator('#replay-import-file').setInputFiles({name:'packet.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(packet))});
}

test('an authorized-target replay packet imports as unreviewed buyer evidence with harness results', async () => {
  const packet = await targetPacket();
  const {context, page} = await open(assessment());
  try {
    await importReplay(page, packet);
    await page.locator('[data-apply-replay]').waitFor({timeout:5000});
    assert.match(await page.locator('#transfer-body').textContent(), /Digest verified/);
    await page.locator('[data-apply-replay]').click();
    await page.getByText(/replay packet imported/i).waitFor();
    await page.locator('[data-select-test="T01"]').click();
    assert.equal(await page.locator('[data-test="T01"][data-field="result"]').inputValue(), 'Observed');
    assert.match(await page.locator('.record').first().textContent(), /recorded by the replay harness/);
    await go(page, 'evidence');
    const record = await page.locator('.record').first().textContent();
    assert.match(record, /produced by Buyer/);
    assert.match(record, /Not reviewed/);
    assert.equal(await page.locator('[data-download-attachment]').count(), 1);
  } finally { await context.close(); }
});

test('a harness self-test packet and an edited packet are both refused', async () => {
  const {runSelfTest} = await import('../../tools/replay/replay.mjs');
  const {context, page} = await open(assessment());
  try {
    await importReplay(page, await runSelfTest());
    await page.getByText(/calibrates the probes/).waitFor({timeout:5000});
    const edited = await targetPacket();
    edited.scenarios[0].outcome = 'matched';
    edited.scenarios[0].observed.group = 'X25519MLKEM1024';
    await importReplay(page, edited);
    await page.getByText(/digest does not match/i).waitFor({timeout:5000});
    assert.equal((await saved(page)).evidence.length, 0);
  } finally { await context.close(); }
});

test('comparing with an earlier export lists what changed since that review', async () => {
  const earlier = {format:'pqc-buyer-workbook', exportedAt:'2026-09-01T00:00:00Z', attachments:[],
    assessment:assessment({buyer:{product:'Sample Gateway', version:'2.4.0'}, crypto:[{...fullUse, current:'X25519'}]})};
  const {context, page} = await open(assessment({crypto:[fullUse, {...fullUse, id:'CU-002', protected:'Origin leg'}]}));
  try {
    await go(page, 'scorecard');
    await page.locator('[data-compare]').click();
    await page.locator('#compare-file').setInputFiles({name:'earlier.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(earlier))});
    await page.locator('.compare-list').waitFor({timeout:5000});
    const text = await page.locator('#transfer-body').textContent();
    assert.match(text, /CU-002.*added/);
    assert.match(text, /version.*2\.4\.0.*2\.4\.1/);
    assert.match(text, /CU-001.*X25519.*X25519MLKEM768/);
  } finally { await context.close(); }
});

test('the fictional example builds, imports through the real dialog, and keeps its review outcomes', async () => {
  const {spawnSync} = await import('node:child_process');
  const os = await import('node:os'), path = await import('node:path');
  const kit = new URL('../../', import.meta.url);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'pqc-example-'));
  const build = spawnSync('node', ['examples/build_fictional_example.mjs', out], {cwd:kit, encoding:'utf8'});
  assert.equal(build.status, 0, build.stderr);
  const {context, page} = await open();
  try {
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles(path.join(out, 'PQC_FICTIONAL_HarborLink_Complete_Example_Import.json'));
    await page.locator('[data-import-choice="replace"]').click();
    await page.getByText('Assessment imported and saved locally.').waitFor();
    await go(page, 'scorecard');
    const score = await page.locator('#view').textContent();
    assert.match(score, /7 of 14 yes answers supported/);
    assert.match(score, /6 \/ 23 applicable controls; 16 \/ 30 applicable tests supported/);
    assert.match(score, /Supplier: 5 · Buyer: 9/);
    await go(page, 'attestations');
    assert.match(await page.locator('.claim-draft').first().textContent(), /Counter-evidence needs review[\s\S]*EV-118/);
    await go(page, 'evidence');
    assert.equal(await page.locator('[data-download-attachment]').count(), 15);
  } finally { await context.close(); }
});
