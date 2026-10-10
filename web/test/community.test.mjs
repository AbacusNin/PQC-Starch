// Tests for the community release: GitHub Pages hosting, share copies, BOM checks, CBOM, PQCMM, and GRC exports.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';

const KEY = 'pqc-buyer-workbook:v1';
let BASE, server, browser;
before(async () => { server = await startServer(); BASE = server.url; browser = await chromium.launch({headless:true}); });
after(async () => { await browser.close(); await server.close(); });

const assessment = (extra = {}) => ({schemaVersion:5, createdAt:'2026-10-10T00:00:00.000Z', updatedAt:'2026-10-10T00:00:00.000Z',
  buyer:{product:'Sample Gateway', version:'2.4.1', configuration:'Edge TLS', setting:'Commercial / campus'},
  survey:{}, crypto:[], boms:[], evidence:[], tests:{}, customTests:[], controls:{}, actions:[], licensing:{}, licenses:[], ...extra});

async function open(state) {
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  if (state) await page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); }
  }, [KEY, JSON.stringify(state)]);
  await page.goto(BASE);
  return {context, page};
}
async function download(page, action, timeout = 5000) {
  const [file] = await Promise.all([page.waitForEvent('download', {timeout}), action()]);
  return {name:file.suggestedFilename(), bytes:await fs.readFile(await file.path())};
}
const go = (page, route) => page.locator(`nav [data-route="${route}"]`).click();

test('the Terms table shows each term as text, not as an extra keyboard stop', async () => {
  const {context, page} = await open();
  try {
    await go(page, 'sources');
    await page.locator('summary', {hasText:'Terms'}).click();
    const result = await page.evaluate(() => {
      const table = [...document.querySelectorAll('.source-table')].find(item => item.querySelector('th')?.textContent === 'Term');
      return {stops:table.querySelectorAll('[tabindex="0"]').length, firstTerm:table.querySelector('tbody td')?.textContent.trim()};
    });
    assert.equal(result.stops, 0);
    assert.ok(result.firstTerm, 'terms are still listed');
  } finally { await context.close(); }
});

test('the workbook refuses to run inside another site\'s frame', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`<iframe src="${BASE}" width="900" height="600"></iframe>`);
    const frame = page.frames().find(item => item.url().startsWith(BASE));
    await frame.waitForLoadState('load');
    await frame.getByText('opened inside another page').waitFor({timeout:3000});
    assert.equal(await frame.locator('#export-button').count(), 0);
    assert.equal(await frame.locator('#view').count(), 0);
  } finally { await context.close(); }
});

const sensitive = assessment({
  buyer:{product:'Sample Gateway', version:'2.4.1', configuration:'Edge TLS', reviewer:'Pat Reviewer'},
  evidence:[{id:'EV-001', linkedIds:['Q01'], type:'Test trace', producer:'Buyer', artifact:'Lab trace', issuer:'Buyer lab', date:'2026-10-09',
    productMatch:'Yes', pathMatch:'Yes', location:'https://intranet.example/secret-trace', result:'Accepted', note:'Internal note about the lab'}],
  actions:[{id:'AC-001', linked:'C05', gap:'Missing proof', task:'Ask vendor', owner:'Alex Owner', status:'Accepted risk',
    riskApprover:'Casey Approver', riskScope:'Pilot only', riskExpiry:'2027-01-01', note:'Escalation note'}],
  tests:{T01:{result:'Observed', reviewerDate:'Pat Reviewer 2026-10-09', ownerTeam:'Network Team Lead Jo', observed:'Hybrid group selected'}},
  controls:{C01:{result:'Met', ownerTeam:'Jo Control Owner', rationale:'Checked trace'}},
  crypto:[{id:'CU-001', protected:'Admin access', owner:'Sam Crypto Owner', path:'Browser to edge'}],
  boms:[{id:'BM-001', kind:'CBOM', target:'Gateway', reviewer:'Riley BOM Reviewer', source:'https://intranet.example/bom.json', notes:'BOM review note'}]
});
const removed = ['Pat Reviewer', 'intranet.example', 'Internal note about the lab', 'Alex Owner', 'Casey Approver', 'Escalation note',
  'Network Team Lead Jo', 'Jo Control Owner', 'Sam Crypto Owner', 'Riley BOM Reviewer', 'BOM review note', 'lab-trace.txt'];

async function attachFile(page) {
  await go(page, 'evidence');
  await page.locator('[data-edit="evidence"][data-id="EV-001"]').click();
  await page.locator('#evidence-file').setInputFiles({name:'lab-trace.txt', mimeType:'text/plain', buffer:Buffer.from('trace bytes')});
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator('#record-dialog').waitFor({state:'hidden'});
}

test('a share copy removes proof locations, notes, names, and attached files by default', async () => {
  const {context, page} = await open(sensitive);
  try {
    await attachFile(page);
    await page.locator('#export-button').click();
    for (const id of ['share-locations', 'share-notes', 'share-names', 'share-files']) assert.equal(await page.locator(`#${id}`).isChecked(), true, id);
    const file = await download(page, () => page.locator('[data-export="share"]').click());
    const text = file.bytes.toString('utf8');
    for (const value of removed) assert.ok(!text.includes(value), `share copy still contains ${value}`);
    const payload = JSON.parse(text);
    assert.equal(payload.attachments.length, 0);
    assert.deepEqual(payload.shareCopy.removed, ['locations', 'notes', 'names', 'files']);
    assert.match(file.name, /share-copy/);
    // The reviewed outcome survives, so the recipient still sees what was checked.
    assert.equal(payload.assessment.evidence[0].result, 'Accepted');
    assert.equal(payload.assessment.controls.C01.rationale, 'Checked trace');
  } finally { await context.close(); }
});

test('a share copy keeps any category the sender unchecks, and a full backup keeps everything', async () => {
  const {context, page} = await open(sensitive);
  try {
    await attachFile(page);
    await page.locator('#export-button').click();
    await page.locator('#share-notes').uncheck();
    const share = JSON.parse((await download(page, () => page.locator('[data-export="share"]').click())).bytes.toString('utf8'));
    assert.equal(share.assessment.evidence[0].note, 'Internal note about the lab');
    assert.deepEqual(share.shareCopy.removed, ['locations', 'names', 'files']);
    await page.locator('#export-button').click();
    const full = (await download(page, () => page.locator('[data-export="all"]').click())).bytes.toString('utf8');
    for (const value of ['Pat Reviewer', 'intranet.example', 'Alex Owner', 'lab-trace.txt']) assert.ok(full.includes(value), value);
    assert.equal(JSON.parse(full).attachments.length, 1);
  } finally { await context.close(); }
});

test('importing a share copy says what the sender removed', async () => {
  const {context, page} = await open(sensitive);
  try {
    await page.locator('#export-button').click();
    const file = await download(page, () => page.locator('[data-export="share"]').click());
    const path = `${await fs.mkdtemp(`${process.env.TEMP || '/tmp'}/share-`)}/copy.json`;
    await fs.writeFile(path, file.bytes);
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles(path);
    await page.getByText(/share copy/i).first().waitFor({timeout:3000});
    assert.match(await page.locator('#transfer-body').textContent(), /proof locations.*notes.*names.*attached files/s);
  } finally { await context.close(); }
});

// ---- CycloneDX BOM import checks ----
import {signBom} from './sign-bom.mjs';
const sampleBom = JSON.parse(await fs.readFile(new URL('./fixtures/sample-bom.json', import.meta.url), 'utf8'));

async function importBom(page, doc, name = 'supplier-bom.json') {
  const file = `${await fs.mkdtemp(`${process.env.TEMP || '/tmp'}/bom-`)}/${name}`;
  await fs.writeFile(file, JSON.stringify(doc));
  await go(page, 'crypto');
  await page.locator('[data-import-records="boms"]').click();
  await page.locator('#record-import-file').setInputFiles(file);
  await page.locator('[data-apply-record-import]').waitFor();
  return page.locator('#transfer-body').textContent();
}

test('importing a signed CycloneDX BOM checks its schema and signature and keeps its dependency graph', async () => {
  const {context, page} = await open(assessment({crypto:[{id:'CU-001', protected:'Admin sessions', current:'ML-KEM-768', cbomRef:'crypto-mlkem768'}]}));
  try {
    const preview = await importBom(page, signBom(sampleBom, 'ES256'));
    assert.match(preview, /Passes the CycloneDX 1.7 schema/);
    assert.match(preview, /Signature valid with the key embedded in the BOM/);
    await page.locator('[data-apply-record-import]').click();
    const card = page.locator('.record').filter({has:page.locator('h3', {hasText:/^BM-001/})});
    assert.match(await card.textContent(), /Passes the CycloneDX 1.7 schema/);
    assert.match(await card.textContent(), /key thumbprint [A-Za-z0-9_-]{43}/);
    await card.locator('summary', {hasText:'Dependency graph'}).click();
    assert.match(await card.textContent(), /openssl 3\.5\.7.*provides ML-KEM-768, X25519, TLS 1\.3/s);
    // The crypto use names the BOM components that bring in its asset.
    assert.match(await page.locator('.record').filter({has:page.locator('h3', {hasText:/^CU-001/})}).textContent(), /BM-001: provided by openssl 3\.5\.7/);
  } finally { await context.close(); }
});

test('a BOM edited after signing or broken against the schema is flagged on import', async () => {
  const {context, page} = await open();
  try {
    const tampered = signBom(sampleBom, 'Ed25519');
    tampered.components[2].name = 'ML-KEM-512';
    assert.match(await importBom(page, tampered), /Signature does not match the BOM contents/);
    await page.locator('#transfer-close').click();
    const broken = structuredClone(sampleBom);
    broken.components[0].type = 'not-a-type';
    const preview = await importBom(page, broken, 'broken-bom.json');
    assert.match(preview, /Fails the CycloneDX 1.7 schema/);
    assert.match(preview, /No signature on the BOM document/);
  } finally { await context.close(); }
});

// ---- CBOM draft from the manual crypto map ----
import {spawnSync} from 'node:child_process';

const mapped = assessment({crypto:[
  {id:'CU-001', protected:'Admin sessions', path:'Browser to edge', sourceNode:'Admin browser', destinationNode:'Edge gateway', function:'Key establishment',
    current:'X25519MLKEM768', assetType:'protocol', protocolVersion:'TLS 1.3', cipherSuite:'TLS_AES_256_GCM_SHA384', component:'openssl 3.5.7',
    componentPurl:'pkg:generic/openssl@3.5.7', cbomRef:'crypto-tls13', usageStatus:'Observed', coverage:'Edge listener only', owner:'Sam Crypto Owner'},
  {id:'CU-002', protected:'Firmware updates', path:'Vendor to device', function:'Digital signature', current:'ML-DSA-65', assetType:'algorithm',
    parameter:'65', component:'example-signer 2.0', usageStatus:'Vendor claim'},
  {id:'CU-003', protected:'Backups', function:'Encryption', current:'', usageStatus:'Unknown'}
]});

test('the crypto map exports a CBOM draft marked unsigned that passes the CycloneDX 1.7 schema', async () => {
  const {context, page} = await open(mapped);
  try {
    await go(page, 'crypto');
    const file = await download(page, () => page.locator('[data-export-cbom]').click());
    assert.match(file.name, /cbom-draft\.json$/);
    const cbom = JSON.parse(file.bytes.toString('utf8'));
    const props = Object.fromEntries(cbom.metadata.properties.map(item => [item.name, item.value]));
    assert.match(props['pqc-buyer-workbook:document-status'], /^Unsigned draft for human review/);
    assert.equal(props['pqc-buyer-workbook:signed'], 'false');
    assert.match(props['pqc-buyer-workbook:source'], /manual crypto map/i);
    assert.equal(cbom.signature, undefined);
    const assets = cbom.components.filter(item => item.type === 'cryptographic-asset');
    const tls = assets.find(item => item['bom-ref'] === 'crypto-tls13');
    assert.equal(tls.name, 'X25519MLKEM768');
    assert.equal(tls.cryptoProperties.assetType, 'protocol');
    assert.equal(tls.cryptoProperties.protocolProperties.type, 'tls');
    const tlsProps = Object.fromEntries(tls.properties.map(item => [item.name, item.value]));
    assert.equal(tlsProps['pqc-buyer-workbook:path'], 'Browser to edge');
    assert.equal(tlsProps['pqc-buyer-workbook:usage-status'], 'Observed');
    assert.ok(!JSON.stringify(cbom).includes('Sam Crypto Owner'), 'owner names stay out of the CBOM');
    assert.equal(assets.length, 2, 'a use with no method is left out');
    assert.deepEqual(cbom.dependencies.find(item => item.provides?.includes('crypto-tls13')).provides, ['crypto-tls13']);
    const path = `${await fs.mkdtemp(`${process.env.TEMP || '/tmp'}/cbom-`)}/cbom.json`;
    await fs.writeFile(path, file.bytes);
    const check = spawnSync('python', [new URL('./schema-check.py', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), path], {encoding:'utf8'});
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.match(await page.locator('#toast').textContent(), /left out CU-003/);
  } finally { await context.close(); }
});

// ---- Maturity criteria (PQCMM and buyer lists) ----
const criterionCard = (page, key) => page.locator('.criterion').filter({has:page.locator('h3', {hasText:new RegExp(`^${key.replace(/\./g, '\.')} `)})});

test('the bundled PQCMM criteria load with their levels, tags, and sources, and take a review status', async () => {
  const {context, page} = await open(assessment({evidence:[{id:'EV-001', linkedIds:['PQCMM-1.1.1'], type:'Release note', producer:'Supplier', artifact:'Release notes 4.2',
    issuer:'Supplier', date:'2026-09-01', productMatch:'Yes', pathMatch:'Yes', location:'https://supplier.example/notes', result:'Accepted'}]}));
  try {
    await go(page, 'maturity');
    await page.locator('[data-load-pqcmm]').click();
    await page.locator('.criterion').first().waitFor();
    assert.equal(await page.locator('.criterion').count(), 22);
    assert.match(await page.locator('#view').textContent(), /PQC Maturity Model 1\.0\.1.*PKI Consortium/s);
    assert.match(await page.locator('#view').textContent(), /not a PQCMM certification/i);
    const card = criterionCard(page, 'PQCMM-2.1.3');
    assert.match(await card.textContent(), /Level 2 Foundational/);
    assert.equal(await card.locator('a', {hasText:'Source'}).getAttribute('href'), 'https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/');
    assert.match(await criterionCard(page, 'PQCMM-1.1.1').textContent(), /EV-001/);
    await criterionCard(page, 'PQCMM-1.1.1').locator('select[data-field="status"]').selectOption('Met');
    assert.match(await page.locator('.level-summary').textContent(), /Level 1 Initial\s*1 of 3 met/);
    await page.reload();
    await go(page, 'maturity');
    assert.equal(await criterionCard(page, 'PQCMM-1.1.1').locator('select[data-field="status"]').inputValue(), 'Met');
    // A proof record linked to a criterion is not a broken link.
    await go(page, 'evidence');
    assert.equal(await page.locator('.integrity-warning').count(), 0);
  } finally { await context.close(); }
});

test('a buyer criteria list imports from CSV with its own levels, tags, and sources', async () => {
  const {context, page} = await open();
  try {
    const csv = 'Note: internal list\nID,Level,Level name,Criterion,Tags,Source\n' +
      'ORG-1,Level 2,Baseline,"Supplier names a PQC owner, with a date",governance; owner,https://intranet.example/policy\n' +
      'ORG-2,,,"Firmware signing roadmap ""published""",firmware,\n';
    const file = `${await fs.mkdtemp(`${process.env.TEMP || '/tmp'}/crit-`)}/criteria.csv`;
    await fs.writeFile(file, csv);
    await go(page, 'maturity');
    await page.locator('#criteria-file').setInputFiles(file);
    await page.locator('[data-apply-criteria]').click();
    const first = criterionCard(page, 'ORG-1');
    assert.match(await first.textContent(), /Level 2 Baseline/);
    assert.match(await first.textContent(), /Supplier names a PQC owner, with a date/);
    assert.match(await first.textContent(), /governance.*owner/s);
    assert.match(await criterionCard(page, 'ORG-2').textContent(), /Firmware signing roadmap "published"/);
    assert.match(await page.locator('#view').textContent(), /No level stated/);
  } finally { await context.close(); }
});

// ---- GRC export dialog ----
import JSZip from 'jszip';

test('the scorecard exports a GRC package for the chosen platform, with attached files when asked', async () => {
  const {context, page} = await open(sensitive);
  try {
    await attachFile(page);
    await go(page, 'scorecard');
    await page.locator('[data-open-grc]').click();
    for (const value of ['archer', 'servicenow', 'vanta', 'drata', 'scrut']) assert.equal(await page.locator(`input[name="grc-platform"][value="${value}"]`).count(), 1, value);
    await page.locator('input[name="grc-platform"][value="drata"]').check();
    const file = await download(page, () => page.locator('[data-export-grc]').click());
    assert.match(file.name, /drata-grc-package\.zip$/);
    const zip = await JSZip.loadAsync(file.bytes);
    assert.ok(zip.file('README.md') && zip.file('risks.csv') && zip.file('review-results.xlsx'));
    assert.equal(await zip.file('evidence/EV-001-lab-trace.txt').async('string'), 'trace bytes');
    await page.locator('[data-open-grc]').click();
    await page.locator('input[name="grc-platform"][value="scrut"]').check();
    await page.locator('#grc-include-files').uncheck();
    const lean = await JSZip.loadAsync((await download(page, () => page.locator('[data-export-grc]').click())).bytes);
    assert.ok(lean.file('vendor-import.xlsx'));
    assert.ok(!Object.keys(lean.files).some(name => name.startsWith('evidence/')));
  } finally { await context.close(); }
});
