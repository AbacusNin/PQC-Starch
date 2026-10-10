// GRC export packages: each platform gets the files and column headings its importers document.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {buildGrcPackage, PLATFORMS, csv} from '../grc-export.js';
import {buildXlsx} from '../xlsx-write.js';

const state = {
  schemaVersion:5, buyer:{product:'Sample Gateway', version:'2.4.1', configuration:'Edge TLS', vendor:'Example Supplier', reviewer:'Pat Reviewer', assessmentDate:'2026-10-05', decision:'Proceed with conditions'},
  survey:{Q01:{answer:'Yes', detail:'=HYPERLINK("http://evil.example","click")', review:'Accepted'}},
  crypto:[{id:'CU-001', protected:'Admin sessions', path:'Browser to edge', function:'Key establishment', current:'X25519MLKEM768'}],
  boms:[], customTests:[], licensing:{}, licenses:[],
  evidence:[{id:'EV-001', linkedIds:['C05', 'T01'], type:'Test trace', producer:'Buyer', artifact:'Lab trace | capture', issuer:'Buyer lab', date:'2026-10-01',
    productMatch:'Yes', pathMatch:'Yes', location:'https://intranet.example/trace', result:'Accepted', attachmentName:'trace.txt', attachmentType:'text/plain', attachmentSize:11}],
  tests:{T01:{result:'Observed', observed:'Hybrid group selected', productBuild:'2.4.1', reviewerDate:'Pat 2026-10-01'}, T02:{result:'Failed', observed:'Classical-only client accepted'}},
  controls:{C05:{applies:'Yes', result:'Accepted', ownerTeam:'Network team', rationale:'Trace matches'}, C10:{applies:'Yes', result:'Gap', rationale:'No CAVP certificate'}},
  actions:[
    {id:'AC-001', linked:'C10', gap:'No CAVP certificate for ML-KEM', task:'Ask for certificate number', owner:'Alex', status:'Open', targetDate:'2099-01-15'},
    {id:'AC-002', linked:'T02', gap:'Classical fallback allowed', task:'Pilot only', owner:'Casey', status:'Accepted risk', riskApprover:'Casey Approver', riskScope:'Pilot site', riskExpiry:'2027-03-31'},
    {id:'AC-003', linked:'C05', gap:'Old trace', task:'Recapture', status:'Done', targetDate:'2026-09-01'}
  ],
  pqcmm:{source:{name:'PQC Maturity Model', version:'1.0.1'}, criteria:[{key:'PQCMM-2.1.3', id:'2.1.3', level:2, levelName:'Foundational', text:'Hands-on validation', tags:['PQCMM 1.0.1'], source:'https://pkic.org/'}],
    reviews:{'PQCMM-2.1.3':{status:'Partial', note:'Interop only'}}}
};
const attachments = [{id:'EV-001', name:'trace.txt', bytes:new TextEncoder().encode('trace bytes')}];

async function unpack(platform, options = {}) {
  const zip = await JSZip.loadAsync(await buildGrcPackage(state, platform, {JSZip, attachments, today:'2026-10-10', ...options}));
  const files = Object.fromEntries(await Promise.all(Object.values(zip.files).filter(entry => !entry.dir).map(async entry => [entry.name, await entry.async('uint8array')])));
  const text = name => new TextDecoder().decode(files[name]);
  const rows = name => text(name).trim().split('\r\n').map(line => line.match(/"(?:[^"]|"")*"/g).map(cell => cell.slice(1, -1).replace(/""/g, '"')));
  async function sheet(name, sheetName) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(files[name]);
    const found = book.getWorksheet(sheetName);
    assert.ok(found, `${name} has sheet ${sheetName}`);
    const values = [];
    found.eachRow(row => values.push(row.values.slice(1).map(value => value ?? '')));
    return values;
  }
  return {files, text, rows, sheet};
}

test('every platform package carries a README, the full review as JSON, and the attached files with hashes', async () => {
  assert.deepEqual(Object.keys(PLATFORMS), ['archer', 'servicenow', 'vanta', 'drata', 'scrut']);
  for (const platform of Object.keys(PLATFORMS)) {
    const {files, text} = await unpack(platform);
    assert.ok(files['README.md'], platform);
    assert.match(text('README.md'), /Check each file against the current template in your own tenant/);
    assert.equal(JSON.parse(text('pqc-review.json')).buyer.product, 'Sample Gateway', platform);
    assert.equal(text('evidence/EV-001-trace.txt'), 'trace bytes', platform);
    assert.ok(Object.keys(files).some(name => /evidence-(manifest|index)\.csv$/.test(name)), platform);
  }
});

test('a package can leave out attached files', async () => {
  const {files} = await unpack('vanta', {attachments:[]});
  assert.ok(!Object.keys(files).some(name => name.startsWith('evidence/')));
});

test('CSV cells are quoted, and a value that starts like a formula is neutralized', () => {
  assert.equal(csv(['A', 'B'], [['=1+1', 'say "hi"'], ['-cmd', '@x']]), '"A","B"\r\n"\'=1+1","say ""hi"""\r\n"\'-cmd","\'@x"\r\n');
});

test('Archer files use its documented field names, MM/DD/YYYY dates, and no pipe characters in values', async () => {
  const {rows, text} = await unpack('archer');
  assert.deepEqual(rows('1-third-party-profile.csv')[0].slice(0, 1), ['Third Party Name']);
  assert.deepEqual(rows('3-control-standards.csv')[0].slice(0, 3), ['Standard ID', 'Standard Name', 'Statement']);
  const findings = rows('4-findings.csv');
  assert.ok(findings[0].includes('Date Opened') && findings[0].includes('Root Cause'));
  assert.ok(findings.slice(1).some(row => row[0].endsWith('C10')), 'gap control becomes a finding');
  const plans = rows('5-remediation-plans.csv');
  const status = plans[0].indexOf('Status');
  assert.equal(plans.find(row => row[0].endsWith('AC-001'))[status], 'Not Started');
  assert.equal(plans.find(row => row[0].endsWith('AC-003'))[status], 'Closed');
  assert.ok(!plans.some(row => row[0].endsWith('AC-002')), 'accepted risk goes to exception requests');
  const exceptions = rows('6-exception-requests.csv');
  assert.ok(exceptions.some(row => row.includes('03/31/2027')));
  assert.ok(!text('9-evidence-manifest.csv').includes('Lab trace | capture'));
  assert.match(text('9-evidence-manifest.csv'), /Lab trace capture/);
  assert.match(text('9-evidence-manifest.csv'), /[0-9a-f]{64}/);
});

test('ServiceNow sheets map results to documented choices and carry a coalesce key on every row', async () => {
  const {sheet} = await unpack('servicenow');
  const controls = await sheet('pqc-review-servicenow.xlsx', 'controls');
  const head = controls[0];
  assert.equal(head[0], 'External ID');
  const status = head.indexOf('Status');
  assert.equal(controls.find(row => String(row[0]).endsWith('C05'))[status], 'Compliant');
  assert.equal(controls.find(row => String(row[0]).endsWith('C10'))[status], 'Non-compliant');
  const tests = await sheet('pqc-review-servicenow.xlsx', 'control_tests');
  const effect = tests[0].indexOf('Operating effectiveness');
  assert.equal(tests.find(row => String(row[0]).endsWith('T01'))[effect], 'Effective');
  assert.equal(tests.find(row => String(row[0]).endsWith('T02'))[effect], 'Ineffective');
  const issues = await sheet('pqc-review-servicenow.xlsx', 'issues');
  assert.equal(issues.find(row => String(row[0]).endsWith('AC-003'))[issues[0].indexOf('State')], 'Closed Complete');
  const exceptions = await sheet('pqc-review-servicenow.xlsx', 'exceptions');
  assert.equal(exceptions[1][exceptions[0].indexOf('Valid to')], '2027-03-31');
  const questions = await sheet('pqc-review-servicenow.xlsx', 'questionnaire');
  assert.deepEqual(questions[0], ['Serial number', 'Category', 'Question', 'Order', 'Data type']);
  for (const table of [controls, tests, issues]) for (const row of table.slice(1)) assert.match(String(row[0]), /^SAMPLE-GATEWAY-2-4-1:/);
});

test('Vanta payloads use only documented fields and enums', async () => {
  const {text, sheet} = await unpack('vanta');
  const vendor = JSON.parse(text('vendor.json'));
  assert.deepEqual(Object.keys(vendor).sort(), ['additionalNotes', 'name', 'servicesProvided', 'status']);
  assert.equal(vendor.status, 'IN_PROCUREMENT');
  const findings = JSON.parse(text('findings.json'));
  assert.ok(findings.every(item => ['ACCEPT', 'REMEDIATE', 'NONE'].includes(item.riskStatus) && item.content));
  assert.ok(findings.some(item => item.content.startsWith('C10') && item.riskStatus === 'REMEDIATE' && item.remediation.state === 'OPEN'));
  assert.ok(findings.some(item => item.content.startsWith('AC-002') && item.riskStatus === 'ACCEPT'));
  const risks = JSON.parse(text('risks.json'));
  assert.deepEqual(risks.map(item => item.treatment), ['Accept']);
  assert.match(risks[0].identificationDate, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  assert.match(text('risks.csv').split('\r\n')[0], /^"Risk Scenario"/);
  assert.deepEqual((await sheet('review-workbook.xlsx', 'Controls'))[0].slice(0, 3), ['Control', 'Statement', 'Applies']);
  assert.match(text('controls.csv').split('\r\n')[0], /"Control ID","Control Name","Control Description","Domain","Owner","Framework Code","Effective Date"/);
});

test('Drata files use its template headings, its enums, and no characters its importer bans', async () => {
  const {rows, text} = await unpack('drata');
  assert.deepEqual(rows('vendor.csv')[0].slice(0, 3), ['Name', 'Website URL', 'Privacy URL']);
  const risks = rows('risks.csv');
  const head = risks[0];
  assert.deepEqual(head.slice(0, 3), ['Risk ID', 'Title', 'Description']);
  const accepted = risks.find(row => row[head.indexOf('Title')].startsWith('Classical fallback'));
  assert.equal(accepted[head.indexOf('Treatment option')], 'Accept');
  assert.equal(accepted[head.indexOf('Risk status')], 'active');
  assert.equal(risks.find(row => row[head.indexOf('Title')].startsWith('Old trace'))[head.indexOf('Risk status')], 'closed');
  assert.match(accepted[head.indexOf('Risk ID')], /^[A-Z]+-\d+$/);
  const tasks = rows('tasks.csv');
  assert.deepEqual(tasks[0].slice(0, 3), ['Title', 'Description', 'Due Date']);
  assert.equal(tasks.length, 2, 'only open actions with a future due date become tasks');
  assert.equal(tasks[1][2], '2099-01-15');
  for (const name of Object.keys((await unpack('drata')).files).filter(file => file.endsWith('.csv'))) assert.ok(!/[<>\\]/.test(text(name)), name);
  const api = JSON.parse(text('drata-api.json'));
  assert.ok(['NOT_YET_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'].includes(api.securityReview.securityReviewStatus));
  assert.equal(api.securityReview.securityReviewType, 'SECURITY');
});

test('Scrut workbooks follow its vendor and questionnaire templates', async () => {
  const {sheet, rows} = await unpack('scrut');
  const vendor = await sheet('vendor-import.xlsx', 'Vendors');
  assert.deepEqual(vendor[0], ['Vendor Name', 'Vendor URL (Optional)', "Vendor's Category", 'Service Description (Optional)', 'Entities (Optional)', 'Assigned To (Optional)',
    'POC Name (Optional)', 'POC Email (Optional)', 'Assessment Status', 'Assessment Justification (Optional)', 'Last Assessment Date (Optional)', 'Last Assessed By (Optional)',
    'Recurrence (Optional)', 'Next Assessment Date (Optional)', 'Risk Impact (Optional)']);
  assert.equal(vendor[1][0], 'Example Supplier');
  assert.equal(vendor[1][2], 'Security');
  assert.equal(vendor[1][8], 'Assessed');
  assert.equal(vendor[1][10], '05 10 2026');
  const questions = await sheet('questionnaire-template.xlsx', 'Questions');
  assert.deepEqual(questions[0], ['Question number', 'Question', 'Condition for follow up question (If applicable)', 'Weightage (Optional)', 'Domain (Optional)', 'Attachment Mandatory']);
  assert.equal(questions[1][0], 'Q1');
  assert.equal(rows('risks.csv')[0][0], 'Risk Name');
});

test('the XLSX writer produces sheets Excel libraries can read, with text never treated as a formula', async () => {
  const bytes = await buildXlsx(JSZip, [{name:'Data: one/two', headers:['A', 'B'], rows:[['=1+1', 'x & <y>']]}, {name:'Data: one/two', headers:['C'], rows:[]}]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.deepEqual(book.worksheets.map(item => item.name), ['Data  one two', 'Data  one two 2']);
  const cell = book.worksheets[0].getCell('A2');
  assert.equal(cell.value, '=1+1');
  assert.equal(cell.formula, undefined);
  assert.equal(book.worksheets[0].getCell('B2').value, 'x & <y>');
});
