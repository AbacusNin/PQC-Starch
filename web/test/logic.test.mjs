import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {survey, controls, tests, sources} from '../content.js';
import {controlTests} from '../control-links.js';
import * as scorecard from '../scorecard.js';
import * as attestation from '../attestation.js';
import * as storage from '../storage.js';
import * as recordImport from '../record-import.js';
import * as sealed from '../crypto-export.js';
import * as replay from '../replay-format.js';
import * as compare from '../compare.js';

const web = fileURLToPath(new URL('..', import.meta.url));
const proof = (id, linkedIds, extra = {}) => ({id, linkedIds, type:'Product documentation', artifact:'Release guide', issuer:'Vendor', date:'2026-10-09',
  productMatch:'Yes', pathMatch:'Yes', location:'https://example.test/trace', result:'Accepted', producer:'Supplier', ...extra});
const base = (extra = {}) => ({buyer:{product:'Gateway', version:'2.4', configuration:'Edge', setting:'Commercial / campus'},
  survey:{}, crypto:[], boms:[], evidence:[], tests:{}, customTests:[], controls:{}, actions:[], licensing:{}, licenses:[], ...extra});
const observedTest = {productBuild:'2.4', toolVersion:'probe 1', cryptoUseId:'CU-001', observed:'X25519MLKEM768 selected', negative:'classical rejected',
  limits:'edge only', reviewerDate:'Buyer 2026-10-09', result:'Observed'};
const use = {id:'CU-001', function:'Key establishment', path:'Browser to edge', current:'X25519MLKEM768', component:'TLS 4', coverage:'edge only'};

test('supported yes answers are counted against yes answers, not every question', () => {
  const s = scorecard.buildScorecard(base({
    survey:{Q01:{answer:'Yes', review:'Accepted'}, Q02:{answer:'No', review:'Accepted'}, Q03:{answer:'Partial', review:'Clarify'}},
    evidence:[proof('EV-001', ['Q01'])]
  }), survey, controls, tests);
  assert.equal(s.supportedAnswers, 1);
  assert.equal(s.yesAnswers, 1);
});

test('rejected wrong-scope proof is counted as counter-evidence, not accepted proof needing rework', () => {
  const s = scorecard.buildScorecard(base({evidence:[
    proof('EV-001', ['Q01'], {productMatch:'No', pathMatch:'No'}),
    proof('EV-002', ['Q01'], {productMatch:'No', pathMatch:'No', result:'Rejected'})
  ]}), survey, controls, tests);
  assert.equal(s.mismatchedProof, 1);
  assert.equal(s.counterProof, 1);
});

test('not-applicable controls and tests leave the denominators', () => {
  const s = scorecard.buildScorecard(base({controls:{C10:{result:'N/A'}, C11:{applies:'No'}}, tests:{T21:{result:'N/A'}}}), survey, controls, tests);
  assert.equal(s.applicableControls, 24);
  assert.equal(s.applicableTests, 32);
});

test('an observed test needs buyer or independent proof to count as supported', () => {
  const run = producer => scorecard.buildScorecard(base({crypto:[use], tests:{T01:observedTest},
    evidence:[proof('EV-001', ['T01'], {type:'Test trace', producer})]}), survey, controls, tests).supportedTests;
  assert.equal(run('Supplier'), 0);
  assert.equal(run('Unknown'), 0);
  assert.equal(run('Buyer'), 1);
  assert.equal(run('Independent third party'), 1);
});

test('qualified proof is broken down by who produced it', () => {
  const s = scorecard.buildScorecard(base({evidence:[proof('EV-001', ['Q01']), proof('EV-002', ['Q02']),
    proof('EV-003', ['Q03'], {producer:'Buyer'}), proof('EV-004', ['Q04'], {result:'Clarify', producer:'Buyer'})]}), survey, controls, tests);
  assert.deepEqual(s.qualifiedByProducer, {Supplier:2, Buyer:1});
});

test('accepted risk without a named approver or expiry is flagged', () => {
  const s = scorecard.buildScorecard(base({actions:[
    {id:'AC-001', status:'Accepted risk', riskApprover:'CISO', riskExpiry:'2027-01-01'},
    {id:'AC-002', status:'Accepted risk'}
  ]}), survey, controls, tests);
  assert.equal(s.acceptedRisks, 2);
  assert.equal(s.incompleteRisks, 1);
});

test('uuid generation falls back to getRandomValues when randomUUID is unavailable', () => {
  const id = attestation.makeUuid({getRandomValues: bytes => globalThis.crypto.getRandomValues(bytes)});
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const draftState = () => base({
  crypto:[use, {id:'CU-002', function:'Key establishment', path:'Gateway to origin'}],
  evidence:[proof('EV-001', ['CU-001'], {type:'Test trace', producer:'Buyer'})]
});

test('CycloneDX export leaves out drafts that lack required detail', () => {
  const doc = attestation.buildCycloneDxDraft(draftState(), 'urn:uuid:00000000-0000-4000-8000-000000000001');
  assert.deepEqual(doc.declarations.claims.map(claim => claim['bom-ref']), ['claim-CU-001']);
});

test('CycloneDX export carries a machine-readable unsigned-draft marker', () => {
  const doc = attestation.buildCycloneDxDraft(draftState(), 'urn:uuid:00000000-0000-4000-8000-000000000001');
  const marker = (doc.metadata.properties || []).find(item => item.name === 'pqc-buyer-workbook:document-status');
  assert.ok(marker, 'missing document-status property');
  assert.match(marker.value, /unsigned draft/i);
});

test('CycloneDX export can omit proof locations before sharing', () => {
  const shared = attestation.buildCycloneDxDraft(draftState(), 'urn:uuid:00000000-0000-4000-8000-000000000001', {omitLocations:true});
  const full = attestation.buildCycloneDxDraft(draftState(), 'urn:uuid:00000000-0000-4000-8000-000000000001');
  assert.doesNotMatch(JSON.stringify(shared), /example\.test\/trace/);
  assert.match(JSON.stringify(full), /example\.test\/trace/);
});

test('CycloneDX export with the draft marker still passes the bundled official schema', async () => {
  const doc = attestation.buildCycloneDxDraft(draftState(), 'urn:uuid:00000000-0000-4000-8000-000000000001');
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'pqc-')), 'draft.json');
  await fs.writeFile(file, JSON.stringify(doc));
  const result = spawnSync('python', [path.join(web, 'test', 'schema-check.py'), file], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('record ids and every reference to them are canonicalized to upper case', () => {
  const a = storage.normalizeAssessment({schemaVersion:3, crypto:[{id:'cu-001'}], boms:[{id:'bm-001', source:'ev-001'}],
    evidence:[{id:'ev-001', linkedIds:['cu-001', 'q01', 'li-001']}], tests:{T01:{cryptoUseId:'cu-001'}},
    actions:[{id:'ac-001', closureProof:'ev-001'}], licensing:{proofId:'ev-001'}, licenses:[{id:'li-001', proofId:'ev-001'}]});
  assert.equal(a.crypto[0].id, 'CU-001');
  assert.equal(a.boms[0].id, 'BM-001');
  assert.equal(a.boms[0].source, 'EV-001');
  assert.equal(a.evidence[0].id, 'EV-001');
  assert.deepEqual(a.evidence[0].linkedIds, ['CU-001', 'Q01', 'LI-001']);
  assert.equal(a.tests.T01.cryptoUseId, 'CU-001');
  assert.equal(a.actions[0].id, 'AC-001');
  assert.equal(a.actions[0].closureProof, 'EV-001');
  assert.equal(a.licensing.proofId, 'EV-001');
  assert.equal(a.licenses[0].id, 'LI-001');
  assert.equal(a.licenses[0].proofId, 'EV-001');
});

test('evidence producer is inferred from the proof type for older records and kept when set', () => {
  const a = storage.normalizeAssessment({schemaVersion:3, evidence:[
    {id:'EV-001', type:'Vendor statement'}, {id:'EV-002', type:'CMVP certificate'}, {id:'EV-003', type:'Independent test'},
    {id:'EV-004', type:'Test trace'}, {id:'EV-005', type:'Test trace', producer:'Buyer'}]});
  assert.deepEqual(a.evidence.map(item => item.producer), ['Supplier', 'Validation authority', 'Independent third party', 'Unknown', 'Buyer']);
});

test('deleted ids are never reissued', () => {
  const state = {crypto:[{id:'CU-001'}], counters:{CU:2}};
  assert.equal(storage.allocateId(state, 'CU', state.crypto), 'CU-003');
  assert.equal(storage.allocateId(state, 'CU', state.crypto), 'CU-004');
  const legacy = {crypto:[{id:'CU-001'}, {id:'CU-007'}]};
  assert.equal(storage.allocateId(legacy, 'CU', legacy.crypto), 'CU-008');
});

test('id counters survive normalization', () => {
  const a = storage.normalizeAssessment({schemaVersion:4, counters:{CU:9, EV:'x', '<script>':3}});
  assert.deepEqual(a.counters, {CU:9});
});

test('normalization reports dropped fields and truncated lists', () => {
  const report = storage.normalizationReport({schemaVersion:3, evidence:[{id:'EV-001', mystery:1}], crypto:Array.from({length:501}, (_, i) => ({id:`CU-${i}`}))});
  assert.ok(report.dropped.includes('evidence.mystery'), JSON.stringify(report));
  assert.deepEqual(report.truncated, [{list:'crypto', kept:500, received:501}]);
});

test('schema versions 4 and 5 load as version 5, and unknown future versions are refused', () => {
  const upgraded = storage.normalizeAssessment({schemaVersion:4, boms:[{id:'BM-001', kind:'CBOM'}]});
  assert.equal(upgraded.schemaVersion, 5);
  assert.deepEqual(upgraded.pqcmm, {source:{name:'', version:'', publisher:'', url:'', license:'', release:'', importedAt:''}, criteria:[], reviews:{}});
  assert.deepEqual(upgraded.boms[0].graph, []);
  assert.equal(storage.normalizeAssessment({schemaVersion:5}).schemaVersion, 5);
  assert.throws(() => storage.normalizeAssessment({schemaVersion:6}), /unsupported/i);
});

test('stored maturity criteria keep only well-formed keys, stated levels, and web sources', () => {
  const a = storage.normalizeAssessment({schemaVersion:5, pqcmm:{criteria:[
    {key:'PQCMM-2.1.3', id:'2.1.3', level:2, levelName:'Foundational', text:'Hands-on validation', tags:['PQCMM 1.0.1'], source:'https://pkic.org/'},
    {key:'<script>', id:'x', level:1, text:'bad key'},
    {key:'ORG-1', id:'ORG-1', level:'3', text:'Level given as text is not a level', source:'javascript:alert(1)'},
    {key:'PQCMM-2.1.3', id:'dup', level:2, text:'Duplicate key'}],
    reviews:{'pqcmm-2.1.3':{status:'Met', note:'ok'}, 'ORG-1':{status:'Certified'}, 'GONE-1':{status:'Met'}}}});
  assert.deepEqual(a.pqcmm.criteria.map(item => item.key), ['PQCMM-2.1.3', 'ORG-1']);
  assert.equal(a.pqcmm.criteria[1].level, null);
  assert.equal(a.pqcmm.criteria[1].source, '');
  assert.deepEqual(a.pqcmm.reviews, {'PQCMM-2.1.3':{status:'Met', note:'ok'}, 'ORG-1':{status:'Not assessed', note:''}});
});

test('accepted-risk details and the last export time survive normalization', () => {
  const a = storage.normalizeAssessment({schemaVersion:4, lastExportedAt:'2026-10-09T12:00:00.000Z',
    actions:[{id:'AC-001', status:'Accepted risk', riskApprover:'CISO', riskScope:'Lab only', riskExpiry:'2027-01-01'}]});
  assert.equal(a.lastExportedAt, '2026-10-09T12:00:00.000Z');
  assert.equal(a.actions[0].riskApprover, 'CISO');
  assert.equal(a.actions[0].riskScope, 'Lab only');
  assert.equal(a.actions[0].riskExpiry, '2027-01-01');
});

test('secret detection catches PEM blocks, private JWKs, and key-named fields but not public material', () => {
  assert.equal(recordImport.containsSecret('-----BEGIN PRIVATE KEY-----\nabc'), true);
  assert.equal(recordImport.containsSecret('-----BEGIN OPENSSH PRIVATE KEY-----'), true);
  assert.equal(recordImport.containsSecret({kty:'EC', crv:'P-256', x:'a', y:'b', d:'c'}), true);
  assert.equal(recordImport.containsSecret([{nested:{kty:'RSA', n:'a', e:'AQAB', p:'x'}}]), true);
  assert.equal(recordImport.containsSecret({privateKey:'abc'}), true);
  assert.equal(recordImport.containsSecret({kty:'EC', crv:'P-256', x:'a', y:'b'}), false);
  assert.equal(recordImport.containsSecret('ML-KEM-768 public key size 1184 bytes'), false);
  assert.equal(recordImport.containsSecret('-----BEGIN CERTIFICATE-----'), false);
});

test('Excel date serials become ISO dates and other values pass through', () => {
  assert.equal(recordImport.excelSerialToIso('46304'), '2026-10-09');
  assert.equal(recordImport.excelSerialToIso('46304.75'), '2026-10-09');
  assert.equal(recordImport.excelSerialToIso('2026-10-09'), '2026-10-09');
  assert.equal(recordImport.excelSerialToIso('Q3 2026'), 'Q3 2026');
  assert.equal(recordImport.excelSerialToIso('12'), '12');
});

test('section imports keep valid ids above 999 and reassign only collisions or malformed ids', () => {
  const rows = recordImport.prepareImportedRows({kind:'crypto', fileName:'uses.json', existingIds:['CU-001'],
    rows:[{id:'CU-1000', current:'X25519MLKEM768'}, {id:'CU-001', current:'X25519'}, {id:'bad', current:'P-256'}]});
  assert.deepEqual(rows.map(row => row.id), ['CU-1000', 'CU-002', 'CU-003']);
  assert.ok(rows.every(row => row.usageStatus === 'Vendor claim'));
});

test('imported evidence starts unreviewed with Excel dates converted', () => {
  const [row] = recordImport.prepareImportedRows({kind:'evidence', fileName:'proof.xlsx', existingIds:[],
    rows:[{id:'EV-001', artifact:'Report', date:'46304', result:'Accepted', productMatch:'Yes', pathMatch:'Yes', linkedIds:'q01; cu-001'}]});
  assert.equal(row.date, '2026-10-09');
  assert.equal(row.result, 'Not reviewed');
  assert.equal(row.productMatch, 'Unsure');
  assert.deepEqual(row.linkedIds, ['Q01', 'CU-001']);
});

test('every control and test source id resolves to a listed source', () => {
  const ids = new Set(sources.map(source => source[0]));
  const cited = [...controls.map(c => c[2]), ...tests.map(t => t[4])].flatMap(value => value.split(';').map(id => id.trim()));
  assert.deepEqual(cited.filter(id => !ids.has(id)), []);
});

test('every suggested control test exists in the test catalog', () => {
  const ids = new Set(tests.map(t => t[0]));
  assert.deepEqual(Object.values(controlTests).flat().filter(id => !ids.has(id)), []);
});

test('id counters never fall below the highest id already in use', () => {
  const a = storage.normalizeAssessment({schemaVersion:3, crypto:[{id:'CU-007'}], evidence:[{id:'EV-012'}], counters:{CU:3}});
  assert.deepEqual(a.counters, {CU:7, EV:12});
});

test('an encrypted export opens only with the right passphrase and hides its contents', async () => {
  const payload = await sealed.encryptExport('{"format":"pqc-buyer-workbook","product":"Gateway"}', 'correct horse battery');
  assert.equal(payload.format, 'pqc-buyer-workbook-encrypted');
  assert.doesNotMatch(JSON.stringify(payload), /Gateway/);
  assert.equal((await sealed.decryptExport(payload, 'correct horse battery')).product, 'Gateway');
  await assert.rejects(sealed.decryptExport(payload, 'wrong passphrase'), /passphrase did not open/);
});

test('a tampered encrypted export is refused', async () => {
  const payload = await sealed.encryptExport('{"a":1}', 'correct horse battery');
  const bytes = Buffer.from(payload.data, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(sealed.decryptExport({...payload, data:bytes.toString('base64')}, 'correct horse battery'), /passphrase did not open/);
});

test('an encrypted export with weakened key derivation is refused before decryption', async () => {
  const payload = await sealed.encryptExport('{"a":1}', 'correct horse battery');
  await assert.rejects(sealed.decryptExport({...payload, kdf:{...payload.kdf, iterations:1000}}, 'correct horse battery'), /unsupported/i);
});

test('the Excel workbook builds from the shared content without any private build tool', async () => {
  const {buildWorkbook} = await import('../../build_workbook.mjs');
  const workbook = await buildWorkbook();
  const ids = (sheet, column, first, count) => Array.from({length:count}, (_, i) => workbook.getWorksheet(sheet).getCell(`${column}${first + i}`).value);
  assert.deepEqual(ids('Vendor Survey', 'A', 6, survey.length), survey.map((_, i) => `Q${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(ids('Control Proof', 'A', 6, controls.length), controls.map(c => c[0]));
  assert.deepEqual(ids('Tests', 'A', 6, tests.length), tests.map(t => t[0]));
  assert.equal(workbook.getWorksheet('Terms & Sources').getCell('D6').value !== null, true);
});

const replayPacket = (kind = 'authorized-target', scenarios) => ({format:'pqc-replay-packet', version:1, generatedAt:'2026-10-09T00:00:00Z',
  harness:{name:'pqc-replay-harness', version:'1.0.0', node:'v24.19.0', openssl:'3.5.7'},
  subject:{kind, host:'lab.example.test', port:443, servername:'lab.example.test', build:'4.2.0-demo'},
  policy:{expectGroup:'X25519MLKEM768', requireHybrid:true},
  scenarios:scenarios || [
    {id:'hybrid-offer', testIds:['T01'], title:'Hybrid and classical offered', offered:'X25519MLKEM768:X25519', expected:{group:'X25519MLKEM768'}, observed:{group:'X25519MLKEM768'}, outcome:'matched', detail:'Selected X25519MLKEM768.'},
    {id:'classical-only', testIds:['T02', 'T15'], title:'Classical only offered', offered:'X25519', expected:{rejected:true}, observed:{rejected:true}, outcome:'matched', detail:'Handshake rejected.'},
    {id:'wrong-name', testIds:['T04'], title:'Wrong server name', offered:'X25519MLKEM768:X25519', expected:{rejected:true}, observed:{error:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}, outcome:'inconclusive', detail:'Chain not trusted.'},
    {id:'resumption', testIds:['T11'], title:'Resumed session', offered:'X25519MLKEM768:X25519', expected:null, observed:{reused:true}, outcome:'recorded', detail:'Session resumed.'}
  ], limits:'One target, one client.', digest:''});

test('a replay packet from the harness self-test is refused as product evidence', () => {
  assert.throws(() => replay.planReplayImport(replayPacket('local-fixture'), base()), /calibrat/i);
});

test('an authorized-target packet becomes unreviewed buyer evidence and machine-recorded results', () => {
  const plan = replay.planReplayImport(replayPacket(), base(), {digestVerified:true, evidenceId:'EV-007'});
  assert.equal(plan.evidence.id, 'EV-007');
  assert.equal(plan.evidence.producer, 'Buyer');
  assert.equal(plan.evidence.type, 'Test trace');
  assert.equal(plan.evidence.result, 'Not reviewed');
  assert.equal(plan.evidence.productMatch, 'Unsure');
  assert.deepEqual(plan.evidence.linkedIds, ['T01', 'T02', 'T15', 'T04', 'T11']);
  assert.deepEqual(Object.fromEntries(plan.updates.map(u => [u.testId, u.fields.result])), {T01:'Observed', T02:'Observed', T15:'Observed', T04:'Inconclusive', T11:'Observed'});
  const t01 = plan.updates.find(u => u.testId === 'T01').fields;
  assert.match(t01.toolVersion, /pqc-replay-harness 1\.0\.0/);
  assert.match(t01.replaySource, /lab\.example\.test:443/);
  assert.match(t01.observed, /X25519MLKEM768/);
});

test('a contradicted scenario is recorded as a failed test', () => {
  const plan = replay.planReplayImport(replayPacket('authorized-target', [{id:'hybrid-offer', testIds:['T01'], title:'t', offered:'x', expected:{group:'X25519MLKEM768'}, observed:{group:'X25519'}, outcome:'contradicted', detail:'Selected X25519.'}]), base());
  assert.equal(plan.updates[0].fields.result, 'Failed');
});

test('a packet never overwrites a result a reviewer already recorded', () => {
  const plan = replay.planReplayImport(replayPacket(), base({tests:{T01:{result:'Failed'}}}));
  assert.equal(plan.updates.some(u => u.testId === 'T01'), false);
  assert.deepEqual(plan.skipped, ['T01']);
});

test('a malformed or unknown-version packet is refused', () => {
  assert.throws(() => replay.planReplayImport({...replayPacket(), version:2}, base()), /not a supported replay packet/i);
  assert.throws(() => replay.planReplayImport({...replayPacket(), scenarios:'x'}, base()), /not a supported replay packet/i);
  assert.throws(() => replay.planReplayImport(replayPacket('authorized-target', [{id:'x', testIds:['T99'], outcome:'matched'}]), base()), /unknown test/i);
});

test('the digest input does not depend on key order', () => {
  const packet = replayPacket();
  const reordered = Object.fromEntries(Object.entries(packet).reverse());
  assert.equal(replay.packetDigestInput(packet), replay.packetDigestInput(reordered));
  assert.doesNotMatch(replay.packetDigestInput(packet), /"digest"/);
});

test('comparing two assessments lists scope, record, and review changes', () => {
  const before = storage.normalizeAssessment({schemaVersion:4, buyer:{product:'Gateway', version:'4.2'},
    crypto:[{id:'CU-001', current:'X25519'}, {id:'CU-003', current:'P-256'}], evidence:[{id:'EV-001', result:'Not reviewed'}],
    survey:{Q14:{answer:'Partial'}}, tests:{T01:{result:'Inconclusive'}}, controls:{C05:{result:'Clarify'}}, actions:[{id:'AC-001', status:'Open'}]});
  const after = storage.normalizeAssessment({schemaVersion:4, buyer:{product:'Gateway', version:'4.3'},
    crypto:[{id:'CU-001', current:'X25519MLKEM768'}, {id:'CU-002', current:'ML-DSA-65'}], evidence:[{id:'EV-001', result:'Accepted'}],
    survey:{Q14:{answer:'Yes'}}, tests:{T01:{result:'Observed'}}, controls:{C05:{result:'Accepted'}}, actions:[{id:'AC-001', status:'Closed'}]});
  const lines = compare.compareAssessments(before, after).map(c => `${c.area} ${c.id} ${c.change}${c.field ? ` ${c.field} ${c.from} -> ${c.to}` : ''}`);
  for (const expected of ['Scope version changed', 'Crypto use CU-001 changed current X25519 -> X25519MLKEM768', 'Crypto use CU-002 added', 'Crypto use CU-003 removed',
    'Evidence EV-001 changed result Not reviewed -> Accepted', 'Survey Q14 changed answer Partial -> Yes', 'Test T01 changed result Inconclusive -> Observed',
    'Control C05 changed result Clarify -> Accepted', 'Action AC-001 changed status Open -> Closed'])
    assert.ok(lines.some(line => line.startsWith(expected)), `${expected}\n${lines.join('\n')}`);
});

test('comparing an assessment with itself reports no changes', () => {
  const a = storage.normalizeAssessment({schemaVersion:4, buyer:{product:'Gateway'}, crypto:[{id:'CU-001', current:'X25519'}]});
  assert.deepEqual(compare.compareAssessments(a, structuredClone(a)), []);
});

test('a claim statement reads cleanly when the configuration ends with a period', () => {
  const [draft] = attestation.buildClaimDrafts(base({buyer:{product:'Gateway', version:'2.4', configuration:'Lab bench only. No fleet tested.'}, crypto:[use]}));
  assert.doesNotMatch(draft.statement, /\.,|\.\s*,/);
  assert.match(draft.statement, /in Lab bench only\. No fleet tested, the buyer record reports/);
});
