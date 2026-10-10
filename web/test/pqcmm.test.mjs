// Maturity criteria import: the bundled PKI Consortium PQCMM release and buyer-supplied criteria lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import bundled from '../data/pqcmm-1.0.1.js';
import {criteriaFromModel, criteriaFromRows, levelSummary, parseLevel} from '../pqcmm.js';
import {createValidator} from '../json-schema.js';

test('the bundled PQCMM data matches the verified release file', async () => {
  const yaml = await fs.readFile(new URL('../../tools/pqcmm/source/pqcmm-model-1.0.1.yaml', import.meta.url));
  assert.equal(bundled.provenance.sha256, crypto.createHash('sha256').update(yaml).digest('hex'));
  assert.equal(bundled.provenance.license, 'MIT');
});

test('PQCMM criteria keep their level, level name, tags, and source page', () => {
  const {source, criteria} = criteriaFromModel(bundled.model, {validate:createValidator(bundled.schema), provenance:bundled.provenance});
  assert.equal(criteria.length, 22);
  assert.equal(source.name, 'PQC Maturity Model');
  assert.equal(source.version, '1.0.1');
  assert.equal(source.publisher, 'PKI Consortium');
  const item = criteria.find(entry => entry.key === 'PQCMM-2.1.3');
  assert.equal(item.level, 2);
  assert.equal(item.levelName, 'Foundational');
  assert.deepEqual(item.tags, ['PQCMM 1.0.1', 'Level 2 Foundational']);
  assert.equal(item.source, 'https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/');
  assert.match(item.text, /evidence/i);
  assert.deepEqual([...new Set(criteria.map(entry => entry.level))], [0, 1, 2, 3, 4, 5]);
});

test('a model that fails its schema is refused', () => {
  const broken = structuredClone(bundled.model);
  delete broken.levels[2].criteria;
  assert.throws(() => criteriaFromModel(broken, {validate:createValidator(bundled.schema)}), /does not match the PQCMM model schema/);
});

test('a buyer criteria list keeps stated levels, tags, and web sources, and never invents a level', () => {
  const rows = [
    {id:'2.1.1', level:'Level 2', levelName:'Foundational', text:'Quantum-safe algorithms in core production functionality', tags:'production; algorithms', source:'https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/'},
    {id:'ORG-7', level:'L4', text:'CBOM refreshed every release', tags:'cbom, internal', source:'javascript:alert(1)'},
    {id:'X-1', text:'Supplier names a PQC migration owner', tags:''},
    {id:'X-2', level:'3', text:'Inventory covers firmware'}
  ];
  const {criteria} = criteriaFromRows(rows, 'org-criteria.csv');
  assert.deepEqual(criteria.map(item => item.key), ['CRIT-2.1.1', 'ORG-7', 'X-1', 'X-2']);
  assert.deepEqual(criteria.map(item => item.level), [2, 4, null, 3]);
  assert.deepEqual(criteria[0].tags, ['production', 'algorithms']);
  assert.deepEqual(criteria[1].tags, ['cbom', 'internal']);
  assert.equal(criteria[1].source, '', 'only web addresses are kept as sources');
  assert.equal(criteria[2].levelName, '');
});

test('level text is read only when it names a level', () => {
  assert.equal(parseLevel('Level 3'), 3);
  assert.equal(parseLevel('L2'), 2);
  assert.equal(parseLevel(4), 4);
  assert.equal(parseLevel('Advanced'), null);
  assert.equal(parseLevel(''), null);
  assert.equal(parseLevel('Level 99'), null);
});

test('criteria lists refuse duplicates, private keys, and oversize input', () => {
  assert.throws(() => criteriaFromRows([{id:'A-1', text:'x'}, {id:'a-1', text:'y'}], 'dup.csv'), /appears twice/);
  assert.throws(() => criteriaFromRows([{id:'A-1', text:'-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----'}], 'key.csv'), /secret key material/);
  assert.throws(() => criteriaFromRows(Array.from({length:301}, (_, index) => ({id:`A-${index}`, text:'x'})), 'big.csv'), /at most 300/);
  assert.throws(() => criteriaFromRows([{id:'', text:'no id'}], 'blank.csv'), /needs an ID and criterion text/);
});

test('the level summary counts review results per stated level without assigning an overall level', () => {
  const {criteria} = criteriaFromModel(bundled.model, {validate:createValidator(bundled.schema)});
  const reviews = {'PQCMM-1.1.1':{status:'Met'}, 'PQCMM-1.1.2':{status:'Partial'}, 'PQCMM-1.1.3':{status:'Not met'}};
  const summary = levelSummary(criteria, reviews);
  assert.deepEqual(summary.find(item => item.level === 1), {level:1, name:'Initial', total:3, met:1, partial:1, notMet:1, notAssessed:0});
  assert.equal(summary.find(item => item.level === 5).notAssessed, 4);
  assert.ok(!('achievedLevel' in summary), 'no overall level is computed');
});
