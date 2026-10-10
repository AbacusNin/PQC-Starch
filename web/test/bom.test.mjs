// BOM checks that run in the browser: schema validation, JSF signatures, and the dependency graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createValidator} from '../json-schema.js';
import {jcs, jwkThumbprint, verifyJsfSignature, dependencyGraph, checkCycloneDx} from '../bom-check.js';
import generated from '../schema/cyclonedx-1.7.js';
import {signBom} from './sign-bom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = async file => JSON.parse(await fs.readFile(path.join(here, file), 'utf8'));
const [schema, ...related] = await Promise.all(['bom-1.7', 'spdx', 'jsf-0.82', 'cryptography-defs'].map(name => readJson(`../schema/${name}.schema.json`)));
const validate = createValidator(schema, related);
const fixtures = await Promise.all(['fixtures/sample-bom.json', 'fixtures/small-cbom.json', 'fixtures/small-sbom.json'].map(readJson));

// A small seeded generator keeps the mutant corpus identical from run to run.
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}
function locations(value, at = []) {
  const found = [];
  if (Array.isArray(value)) value.forEach((item, index) => { found.push([...at, index]); found.push(...locations(item, [...at, index])); });
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { found.push([...at, key]); found.push(...locations(item, [...at, key])); }
  return found;
}
const parentOf = (doc, at) => at.slice(0, -1).reduce((node, part) => node[part], doc);
const MUTATIONS = [
  ['delete', (parent, key) => Array.isArray(parent) ? parent.splice(key, 1) : delete parent[key]],
  ['to number', (parent, key) => { parent[key] = 7; }],
  ['to string', (parent, key) => { parent[key] = 'text'; }],
  ['to empty string', (parent, key) => { parent[key] = ''; }],
  ['to object', (parent, key) => { parent[key] = {}; }],
  ['to array', (parent, key) => { parent[key] = []; }],
  ['to boolean', (parent, key) => { parent[key] = true; }],
  ['to null', (parent, key) => { parent[key] = null; }],
  ['to unknown word', (parent, key) => { parent[key] = 'not-a-listed-value'; }],
  ['to bad date', (parent, key) => { parent[key] = '2026-02-30'; }],
  ['to bad timestamp', (parent, key) => { parent[key] = '2026-10-01 25:00:00Z'; }],
  ['to good timestamp', (parent, key) => { parent[key] = '2026-10-01T08:30:00+02:00'; }],
  ['to address without at sign', (parent, key) => { parent[key] = 'nobody.example'; }],
  ['to negative number', (parent, key) => { parent[key] = -3; }],
  ['to fraction', (parent, key) => { parent[key] = 2.5; }],
  ['add unknown property beside', (parent) => { if (!Array.isArray(parent)) parent['zz-extra'] = 1; else parent.push({'zz-extra':1}); }],
  ['add a name beside', (parent) => { if (!Array.isArray(parent)) parent.name = 'Added name'; }],
  ['duplicate array item', (parent, key) => { if (Array.isArray(parent[key]) && parent[key].length) parent[key].push(structuredClone(parent[key][0])); else parent[key] = [1, 1]; }]
];

// JSF signature shapes reach the jsf-0.82 schema, whose own "#/definitions" references and if/then rules must
// resolve inside that file rather than the main schema.
const SIGNATURES = {
  'EC signature': {algorithm:'ES256', publicKey:{kty:'EC', crv:'P-256', x:'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y:'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0'}, value:'c2lnbmF0dXJl'},
  'EC key without a curve': {algorithm:'ES256', publicKey:{kty:'EC', x:'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y:'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0'}, value:'c2lnbmF0dXJl'},
  'Ed25519 signature': {algorithm:'Ed25519', publicKey:{kty:'OKP', crv:'Ed25519', x:'11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'}, value:'c2lnbmF0dXJl'},
  'OKP key without x': {algorithm:'Ed25519', publicKey:{kty:'OKP', crv:'Ed25519'}, value:'c2lnbmF0dXJl'},
  'RSA key without exponent': {algorithm:'RS256', publicKey:{kty:'RSA', n:'sXchDaQebHnPiGvyDOAT4saGEUetSyo9MKLOoWFsueri23bOdgWp4Dy1WlUzewbgBHod5pcM9H95GQRV3JDXboIRROSBigeC5yjU1hGzHHyXss8UDprecbAYxknTcQkhslANGRUZmdTOQ5qTRsLAt6BTYuyvVRdhS8exSZEy_c4gs_7svlJJQ4H9_NxsiIoLwAEk7-Q3UXERGYw_75IDrGA84-lA_-Ct4eTlXHBIY2EaV7t7LjJaynVJCpkv4LKjTTAumiGUIuQhrNhZLuF_RJLqHpM2kgWFLU7-VTdL1VbC2tejvcI2BlMkEpk1BzBZI0KQB0GaDWFLN-aEAw3vRw'}, value:'c2lnbmF0dXJl'},
  'signature with an unknown property': {algorithm:'ES256', value:'c2lnbmF0dXJl', extra:true},
  'algorithm given as a URI': {algorithm:'https://example.test/alg/custom', value:'c2lnbmF0dXJl'},
  'algorithm that is neither listed nor a URI': {algorithm:'ES999', value:'c2lnbmF0dXJl'},
  'two signers': {signers:[{algorithm:'ES256', value:'YQ'}, {algorithm:'Ed25519', value:'Yg'}]}
};

// Random edits rarely land on the few fields that carry a date format or a one-of rule, so these are aimed.
function targeted() {
  const sample = fixtures[0];
  const edit = (label, change) => { const doc = structuredClone(sample); change(doc); return {label, doc}; };
  const patent = doc => doc.definitions.patents[0];
  return [
    edit('unknown property at the root', doc => { doc.extra = 1; }),
    edit('unknown property in metadata', doc => { doc.metadata.extra = 1; }),
    edit('unknown property in a component', doc => { doc.components[0].extra = 1; }),
    edit('unknown property in crypto properties', doc => { doc.components[2].cryptoProperties.extra = 1; }),
    edit('license with both id and name', doc => { doc.components[0].licenses[0].license.name = 'Apache License'; }),
    edit('license with neither id nor name', doc => { delete doc.components[0].licenses[0].license.id; }),
    edit('license id outside the SPDX list', doc => { doc.components[0].licenses[0].license.id = 'Not-A-License'; }),
    edit('impossible filing date', doc => { patent(doc).filingDate = '2020-02-30'; }),
    edit('month 13 grant date', doc => { patent(doc).grantDate = '2022-13-01'; }),
    edit('leap day filing date', doc => { patent(doc).filingDate = '2024-02-29'; }),
    edit('two-digit year date', doc => { patent(doc).filingDate = '0050-06-01'; }),
    edit('year zero date', doc => { patent(doc).filingDate = '0000-06-01'; }),
    edit('citation with one pointer', doc => { doc.citations = [{timestamp:'2026-10-01T12:00:00Z', attributedTo:'app-gateway', pointers:['/components/0']}]; }),
    edit('citation with an empty pointer list', doc => { doc.citations = [{timestamp:'2026-10-01T12:00:00Z', attributedTo:'app-gateway', pointers:[]}]; }),
    edit('citation with pointers and expressions', doc => { doc.citations = [{timestamp:'2026-10-01T12:00:00Z', attributedTo:'app-gateway', pointers:['/a'], expressions:['$.a']}]; }),
    edit('citation without a source', doc => { doc.citations = [{timestamp:'2026-10-01T12:00:00Z', pointers:['/a']}]; }),
    edit('component with version and version range', doc => { doc.components[0].versionRange = 'vers:generic/>=3.0'; }),
    edit('internal component with only a version range', doc => { delete doc.components[1].version; doc.components[1].isExternal = false; doc.components[1].versionRange = 'vers:generic/>=10'; }),
    edit('external component with only a version range', doc => { delete doc.components[1].version; doc.components[1].isExternal = true; doc.components[1].versionRange = 'vers:generic/>=10'; }),
    edit('author email without an at sign', doc => { doc.metadata.authors[0].email = 'build.supplier.example'; }),
    edit('timestamp with an offset', doc => { doc.metadata.timestamp = '2026-10-01T08:30:00.125-07:00'; }),
    edit('timestamp without a zone', doc => { doc.metadata.timestamp = '2026-10-01T08:30:00'; }),
    edit('unknown algorithm family', doc => { doc.components[2].cryptoProperties.algorithmProperties.algorithmFamily = 'NOT-A-FAMILY'; }),
    edit('listed algorithm family', doc => { doc.components[2].cryptoProperties.algorithmProperties.algorithmFamily = 'ML-KEM'; }),
    ...Object.entries(SIGNATURES).map(([label, signature]) => edit(label, doc => { doc.signature = signature; }))
  ];
}

function corpus(count) {
  const next = random(20261010);
  const documents = [...fixtures.map(item => ({label:'unchanged fixture', doc:item})), ...targeted()];
  while (documents.length < count) {
    const base = fixtures[Math.floor(next() * fixtures.length)];
    const doc = structuredClone(base);
    const spots = locations(doc);
    const at = spots[Math.floor(next() * spots.length)];
    const [name, mutate] = MUTATIONS[Math.floor(next() * MUTATIONS.length)];
    mutate(parentOf(doc, at), at.at(-1));
    documents.push({label:`${name} at /${at.join('/')}`, doc});
  }
  return documents;
}

async function pythonVerdicts(documents) {
  const file = path.join(os.tmpdir(), `bom-corpus-${process.pid}.json`);
  await fs.writeFile(file, JSON.stringify(documents));
  return JSON.parse(execFileSync('python', [path.join(here, 'schema-batch.py'), file], {encoding:'utf8', maxBuffer:64 * 1024 * 1024}));
}

test('the browser validator agrees with Python jsonschema on 600 valid and altered BOMs', async () => {
  const documents = corpus(600);
  const expected = await pythonVerdicts(documents.map(item => item.doc));
  const actual = documents.map(item => validate(item.doc).length === 0);
  const disagreements = documents.map((item, index) => ({label:item.label, python:expected[index], browser:actual[index], errors:validate(item.doc).slice(0, 2)}))
    .filter(item => item.python !== item.browser);
  assert.deepEqual(disagreements, []);
  // The corpus must exercise both outcomes, or agreement would prove little.
  assert.ok(expected.filter(Boolean).length > 50 && expected.filter(value => !value).length > 300, JSON.stringify({valid:expected.filter(Boolean).length}));
});

test('the validator names the path and reason for each problem', () => {
  const bad = structuredClone(fixtures[0]);
  delete bad.bomFormat;
  bad.components[0].type = 'not-a-type';
  const errors = validate(bad);
  assert.ok(errors.some(error => error.path === '/' && /bomFormat/.test(error.message)), JSON.stringify(errors));
  assert.ok(errors.some(error => error.path === '/components/0/type' || error.path === '/components/0'), JSON.stringify(errors));
});

test('the validator refuses a schema that points outside the bundled files', () => {
  const check = createValidator({$ref:'https://example.test/other.json'});
  assert.throws(() => check({}), /External schema reference/);
});

test('the browser schema module matches the official JSON files exactly', () => {
  assert.deepEqual(generated, {bom:schema, related});
});

test('canonical JSON matches the RFC 8785 examples', () => {
  // Built from code points so no editor or tool can reinterpret the escapes in the RFC's sample string.
  const sample = {numbers:[333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], string:String.fromCodePoint(0x20ac, 0x24, 0x0f, 0x0a, 0x41, 0x27, 0x42, 0x22, 0x5c, 0x5c, 0x22, 0x2f), literals:[null, true, false]};
  assert.equal(jcs(sample), String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`);
  const key = (...points) => String.fromCodePoint(...points);
  const keys = {[key(0x20ac)]:'Euro Sign', [key(0x0d)]:'Carriage Return', [key(0xfb33)]:'Hebrew Letter Dalet With Dagesh', '1':'One', [key(0x1f600)]:'Emoji: Grinning Face', [key(0x80)]:'Control', [key(0xf6)]:'Latin Small Letter O With Diaeresis'};
  // Read the order from the canonical text: an object read back would list the numeric key "1" first.
  const order = ['Carriage Return', 'One', 'Control', 'Latin Small Letter O With Diaeresis', 'Euro Sign', 'Emoji: Grinning Face', 'Hebrew Letter Dalet With Dagesh'].map(name => jcs(keys).indexOf(name));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every(index => index > 0));
});

test('the key thumbprint matches the RFC 7638 example', async () => {
  const jwk = {kty:'RSA', e:'AQAB', n:'0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw'};
  assert.equal(await jwkThumbprint(jwk), 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
});

for (const algorithm of ['ES256', 'ES384', 'Ed25519', 'RS256', 'PS256']) {
  test(`a BOM signed with ${algorithm} verifies, and any later edit is caught`, async () => {
    const signed = signBom(fixtures[0], algorithm);
    const good = await verifyJsfSignature(signed);
    assert.equal(good.status, 'valid', good.summary);
    assert.equal(good.thumbprint, await jwkThumbprint(signed.signature.publicKey));
    const edited = structuredClone(signed);
    edited.components[2].name = 'ML-KEM-512';
    assert.equal((await verifyJsfSignature(edited)).status, 'invalid');
    assert.deepEqual(validate(signed), [], 'the signed BOM still passes the schema');
  });
}

test('properties named in excludes may change without breaking the signature', async () => {
  const signed = signBom(fixtures[0], 'ES256', {excludes:['properties']});
  signed.properties = [{name:'note', value:'added after signing'}];
  const result = await verifyJsfSignature(signed);
  assert.equal(result.status, 'valid', result.summary);
  assert.match(result.summary, /left out of the signature: properties/);
  signed.components[0].name = 'changed';
  assert.equal((await verifyJsfSignature(signed)).status, 'invalid');
});

test('unsigned, multi-signer, keyless, and unsupported signatures are reported plainly', async () => {
  assert.equal((await verifyJsfSignature(fixtures[0])).status, 'unsigned');
  const multi = {...fixtures[0], signature:{signers:[{algorithm:'ES256', value:'YQ'}]}};
  assert.equal((await verifyJsfSignature(multi)).status, 'unsupported');
  const keyless = {...fixtures[0], signature:{algorithm:'ES256', keyId:'supplier-2026', value:'YQ'}};
  assert.match((await verifyJsfSignature(keyless)).summary, /no embedded public key/);
  const hmac = {...fixtures[0], signature:{algorithm:'HS256', value:'YQ'}};
  assert.equal((await verifyJsfSignature(hmac)).status, 'unsupported');
  const nested = structuredClone(fixtures[0]);
  nested.components[0].signature = {algorithm:'ES256', value:'YQ'};
  assert.match((await verifyJsfSignature(nested)).summary, /1 signature\(s\) inside components/);
});

test('the dependency graph keeps what each component depends on and provides', () => {
  const graph = dependencyGraph(fixtures[0]);
  const openssl = graph.nodes.find(node => node.ref === 'lib-openssl');
  assert.deepEqual(openssl.provides, ['crypto-mlkem768', 'crypto-x25519', 'crypto-tls13']);
  assert.equal(openssl.name, 'openssl');
  assert.deepEqual(graph.nodes.find(node => node.ref === 'app-gateway').dependsOn, ['lib-openssl', 'lib-ssh']);
  assert.equal(graph.nodes.find(node => node.ref === 'crypto-tls13').type, 'cryptographic-asset');
  assert.deepEqual(graph.unknownRefs, []);
  const dangling = structuredClone(fixtures[0]);
  dangling.dependencies.push({ref:'lib-missing', dependsOn:['also-missing']});
  assert.deepEqual(dependencyGraph(dangling).unknownRefs, ['lib-missing', 'also-missing']);
});

test('the combined check reports schema, signature, and graph together', async () => {
  const bad = structuredClone(fixtures[0]);
  bad.components[0].type = 'not-a-type';
  const result = await checkCycloneDx(bad, {validator:validate});
  assert.equal(result.schema.valid, false);
  assert.match(result.schema.summary, /Fails the CycloneDX 1.7 schema/);
  assert.equal(result.signature.status, 'unsigned');
  assert.ok(result.graph.nodes.length >= 4);
  const older = {...structuredClone(fixtures[0]), specVersion:'1.6'};
  assert.match((await checkCycloneDx(older, {validator:validate})).schema.summary, /declares version 1.6/);
});
