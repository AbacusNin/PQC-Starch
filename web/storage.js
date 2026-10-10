import {containsSecret} from './secrets.js';
import {SHARE_CATEGORIES, redactForShare} from './share-copy.js';

export const SCHEMA_VERSION = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 45 * 1024 * 1024;
export const KEY = 'pqc-buyer-workbook:v1'; // Keep the storage key so existing local assessments migrate in place.
export const UNREADABLE_KEY = 'pqc-buyer-workbook:unreadable';
export const PRODUCERS = ['Supplier','Buyer','Independent third party','Validation authority','Unknown'];
const DB_NAME = 'pqc-buyer-workbook';
const STORE = 'attachments';
const SAFE_TYPES = new Set([
  'application/pdf', 'application/json', 'text/plain', 'text/csv',
  'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const EXTENSION_TYPES = {
  pdf:'application/pdf', json:'application/json', txt:'text/plain', csv:'text/csv',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const FIELDS = {
  buyer:['organization','product','version','configuration','vendor','reviewer','setting','dataLife','targetDate','policyRef','assessmentDate','decision','verified','unknown','conditions','trigger'],
  survey:['answer','detail','review','followup'],
  tests:['productBuild','toolVersion','cryptoUseId','controlIds','result','observed','negative','limits','reviewerDate','requiredForProcurement','procurementBasis','blocked','blockerDetail','blockerDecision','dependencies','dependencyDetail','ownerTeam','partnerTeams','approvalOwner','plannedDate','environment','testMethod','acceptanceRule','replaySource'],
  controls:['applies','result','gapAction','ownerTeam','rationale'],
  crypto:['id','product','protected','path','sourceNode','destinationNode','trustBoundary','function','current','parameter','component','componentPurl','sbomRef','cbomRef','assetType','usageStatus','protocolVersion','cipherSuite','keyLifecycle','owner','dataLife','target','coverage'],
  evidence:['id','linkedIds','type','producer','artifact','issuer','date','productMatch','pathMatch','location','result','sensitivity','note','attachmentName','attachmentType','attachmentSize','originQuestion','supplierAnswer','supplierDetail'],
  actions:['id','linked','gap','task','owner','status','targetDate','milestone','closureProof','riskApprover','riskScope','riskExpiry','note'],
  licensing:['licenseModel','pqcEntitlement','supportTerm','migrationRights','thirdPartyTerms','proofId','reviewNote'],
  licenses:['id','name','appliesTo','licenseId','sourceUrl','rights','conditions','proofId','reviewNote'],
  boms:['id','kind','serial','version','target','release','supplier','author','created','lifecycle','tool','source','validation','signature','composition','services','dependencies','distribution','reviewer','notes','graph'],
  customTests:['id','title','expected','path','sources']
};
const LIMITS = {crypto:500, evidence:500, actions:500, boms:100, licenses:100, customTests:100};
const TOP = ['schemaVersion','createdAt','updatedAt','lastExportedAt','counters','buyer','survey','crypto','boms','evidence','tests','customTests','controls','actions','licensing','licenses','pqcmm'];
const CRITERION_STATUSES = ['Not assessed','Met','Partial','Not met'];

const text = (value, limit = 12000) => typeof value === 'string' ? value.slice(0, limit) : '';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value, limit = 500) => Array.isArray(value) ? value.slice(0, limit) : [];
// Every saved and imported assessment passes through here, so IDs are held to the characters an ID can
// contain. The page builds HTML from them in many places; this keeps a hostile file from adding markup.
const ids = (value) => list(value, 100).map(v => text(v, 60).trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '')).filter(Boolean);
const upper = value => text(value, 60).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
// Reference fields also accept free text such as a URL, so only ID-shaped values are canonicalized.
const ref = value => { const raw = text(value); return /^[A-Za-z]{1,4}-\d{1,6}$/.test(raw.trim()) ? raw.trim().toUpperCase() : raw; };

export function inferProducer(type) {
  return ({'Vendor statement':'Supplier','Product documentation':'Supplier','Release note':'Supplier',
    'CAVP certificate':'Validation authority','CMVP certificate':'Validation authority','Independent test':'Independent third party'})[type] || 'Unknown';
}

export function blankAssessment() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastExportedAt: '', counters: {},
    buyer: {}, survey: {}, crypto: [], boms: [], evidence: [], tests: {}, customTests: [], controls: {}, actions: [], licensing: {}, licenses: [],
    pqcmm: {source: {}, criteria: [], reviews: {}}
  };
}

// Imported maturity criteria and the reviewer's status for each. Levels stay as the publisher stated them.
function normalizePqcmm(value) {
  const input = record(value);
  const criteria = list(input.criteria, 300).map(raw => {
    const item = record(raw);
    const level = Number.isInteger(item.level) && item.level >= 0 && item.level <= 9 ? item.level : null;
    return {key:text(item.key, 60).toUpperCase(), id:text(item.id, 40), level, levelName:text(item.levelName, 60), text:text(item.text, 4000),
      tags:list(item.tags, 20).map(tag => text(tag, 60)).filter(Boolean), source:/^https?:\/\/\S+$/i.test(text(item.source, 500)) ? text(item.source, 500) : ''};
  }).filter((item, index, all) => /^[A-Z][A-Z0-9.-]{0,59}$/.test(item.key) && item.text && all.findIndex(other => other.key === item.key) === index);
  const keys = new Set(criteria.map(item => item.key));
  const reviews = Object.fromEntries(Object.entries(record(input.reviews)).map(([key, entry]) => [key.toUpperCase(), record(entry)])
    .filter(([key]) => keys.has(key)).map(([key, entry]) => [key, {status:CRITERION_STATUSES.includes(entry.status) ? entry.status : 'Not assessed', note:text(entry.note)}]));
  return {source:sanitizeRow(input.source, ['name','version','publisher','url','license','release','importedAt'], 500), criteria, reviews};
}

function sanitizeRow(raw, fields, max = 12000) {
  const source = record(raw);
  return Object.fromEntries(fields.map(field => [field, text(source[field], max)]));
}

// Ids are reissued from a counter so a deleted record's id never points at a new record.
export function allocateId(state, prefix, items) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = items.reduce((largest, item) => Math.max(largest, Number(String(item.id).match(pattern)?.[1] || 0)), 0);
  const next = Math.max(max, Number(state.counters?.[prefix]) || 0) + 1;
  state.counters = {...(state.counters || {}), [prefix]: next};
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

const PREFIXES = {CU:'crypto', EV:'evidence', BM:'boms', AC:'actions', LI:'licenses', XT:'customTests'};
// Raise each counter to the highest id present, so ids that arrived by import or seed are never reissued.
export function syncCounters(state) {
  const counters = {...(state.counters || {})};
  for (const [prefix, section] of Object.entries(PREFIXES)) {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    const max = (state[section] || []).reduce((largest, item) => Math.max(largest, Number(String(item.id).match(pattern)?.[1] || 0)), 0);
    if (max > (counters[prefix] || 0)) counters[prefix] = max;
  }
  state.counters = counters;
  return state;
}

// A BOM's dependency graph, as kept by bom-check.js. Every value is text or a list of text, capped.
function graphNodes(value) {
  const refs = list => Array.isArray(list) ? list.slice(0, 100).map(ref => text(ref, 300)).filter(Boolean) : [];
  return list(value, 500).map(node => {
    const item = record(node);
    return {ref:text(item.ref, 300), name:text(item.name, 200), type:text(item.type, 40), version:text(item.version, 80), dependsOn:refs(item.dependsOn), provides:refs(item.provides)};
  }).filter(node => node.ref);
}

export function normalizeAssessment(raw) {
  const input = record(raw);
  if (![1,2,3,4,SCHEMA_VERSION].includes(input.schemaVersion)) throw new Error('This file uses an unsupported assessment version.');
  const cleanMap = (value, fields, pattern=/^[A-Z][0-9]{2}$/) => Object.fromEntries(Object.entries(record(value)).slice(0, 200)
    .map(([key, entry]) => [key.toUpperCase(), entry]).filter(([key]) => pattern.test(key)).map(([key, entry]) => [key, sanitizeRow(entry, fields)]));
  const withId = (item, fields) => ({...sanitizeRow(item, fields), id: upper(item?.id)});
  const tests = cleanMap(input.tests, FIELDS.tests, /^(?:T\d{2}|XT-\d{3})$/);
  for (const entry of Object.values(tests)) entry.cryptoUseId = ref(entry.cryptoUseId);
  const evidence = list(input.evidence, LIMITS.evidence).map(item => {
    const row = withId(item, FIELDS.evidence);
    row.linkedIds = ids(item?.linkedIds);
    row.attachmentSize = Number.isFinite(Number(item?.attachmentSize)) ? Math.max(0, Math.min(MAX_FILE_BYTES, Number(item.attachmentSize))) : 0;
    if (!PRODUCERS.includes(row.producer)) row.producer = inferProducer(row.type);
    return row;
  });
  const licensing = sanitizeRow(input.licensing, FIELDS.licensing);
  licensing.proofId = ref(licensing.proofId);
  return syncCounters({
    schemaVersion: SCHEMA_VERSION,
    createdAt: text(input.createdAt, 40) || new Date().toISOString(),
    updatedAt: text(input.updatedAt, 40) || new Date().toISOString(),
    lastExportedAt: text(input.lastExportedAt, 40),
    counters: Object.fromEntries(Object.entries(record(input.counters)).filter(([key, value]) => /^[A-Z]{2}$/.test(key) && Number.isInteger(value) && value >= 0 && value < 1e6)),
    buyer: sanitizeRow(input.buyer, FIELDS.buyer),
    survey: cleanMap(input.survey, FIELDS.survey),
    crypto: list(input.crypto, LIMITS.crypto).map(item => withId(item, FIELDS.crypto)),
    boms: list(input.boms, LIMITS.boms).map(item => { const row = withId(item, FIELDS.boms); row.source = ref(row.source); row.graph = graphNodes(item?.graph); return row; }),
    evidence,
    tests,
    customTests: list(input.customTests, LIMITS.customTests).map(item => withId(item, FIELDS.customTests)).filter(item => /^XT-\d{3}$/.test(item.id)),
    controls: cleanMap(input.controls, FIELDS.controls),
    actions: list(input.actions, LIMITS.actions).map(item => { const row = withId(item, FIELDS.actions); row.closureProof = ref(row.closureProof); return row; }),
    licensing,
    licenses: list(input.licenses, LIMITS.licenses).map(item => { const row = withId(item, FIELDS.licenses); row.proofId = ref(row.proofId); return row; }),
    pqcmm: normalizePqcmm(input.pqcmm)
  });
}

// Lists what normalization would silently discard, so an import can say so before replacing work.
export function normalizationReport(raw) {
  const input = record(raw), dropped = new Set(), truncated = [];
  const check = (section, item) => Object.keys(record(item)).forEach(key => { if (!FIELDS[section].includes(key)) dropped.add(`${section}.${key}`); });
  for (const [section, limit] of Object.entries(LIMITS)) {
    const items = Array.isArray(input[section]) ? input[section] : [];
    if (items.length > limit) truncated.push({list:section, kept:limit, received:items.length});
    items.slice(0, limit).forEach(item => check(section, item));
  }
  for (const section of ['buyer','licensing']) check(section, input[section]);
  for (const section of ['survey','tests','controls']) Object.values(record(input[section])).forEach(entry => check(section, entry));
  Object.keys(input).forEach(key => { if (!TOP.includes(key)) dropped.add(key); });
  return {dropped:[...dropped], truncated};
}

export function loadAssessment() {
  const saved = localStorage.getItem(KEY);
  if (!saved) return blankAssessment();
  try { return normalizeAssessment(JSON.parse(saved)); }
  catch {
    // Keep the unreadable copy before anything can overwrite it; the app offers it for download.
    localStorage.setItem(UNREADABLE_KEY, saved);
    localStorage.removeItem(KEY);
    throw new Error('The saved assessment could not be read. A copy was kept so you can download it from Buyer record.');
  }
}

// Recording an export is bookkeeping, so it must not count as a new unexported change.
export function saveAssessment(state, {touch = true} = {}) {
  if (touch) state.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local attachments.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error || new Error('Attachment storage is unavailable.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function dbRequest(mode, operation) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('Attachment operation failed.'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Attachment storage failed.')); };
  }));
}

export function checkAttachment(file, currentTotal = 0) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  const type = SAFE_TYPES.has(file?.type) ? file.type : EXTENSION_TYPES[extension];
  if (!file || !type) throw new Error('Choose a PDF, text, CSV, JSON, PNG, JPEG, WebP, Word, or Excel file.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Each attachment must be 10 MB or less.');
  if (currentTotal + file.size > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('Attachments for one assessment must total 30 MB or less.');
  return type;
}

const startsWith = (bytes, signature, offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
// The declared type comes from the file name, so the leading bytes must agree before the file is stored.
export async function sniffAttachment(blob, type) {
  const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const zip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const ok = {
    'application/pdf': startsWith(bytes, [0x25, 0x50, 0x44, 0x46]),
    'image/png': startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
    'image/jpeg': startsWith(bytes, [0xff, 0xd8, 0xff]),
    'image/webp': startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': zip,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': zip
  }[type];
  if (ok !== undefined) {
    if (!ok) throw new Error('The file contents do not match its type. Choose the original document.');
    return;
  }
  // Text, CSV, and JSON must look like text: no NUL bytes in the first 4 KB.
  if (bytes.includes(0)) throw new Error('The file contents do not look like text. Choose the original document.');
}

export async function putAttachment(id, file, currentTotal = 0) {
  const type = checkAttachment(file, currentTotal);
  await sniffAttachment(file, type);
  const blob = file.type === type ? file : new Blob([file], {type});
  await dbRequest('readwrite', store => store.put(blob, id));
  return type;
}
export const getAttachment = id => dbRequest('readonly', store => store.get(id));
export const removeAttachment = id => dbRequest('readwrite', store => store.delete(id));
export const clearAttachments = () => dbRequest('readwrite', store => store.clear());
export async function renameAttachment(from, to) {
  const blob = await getAttachment(from);
  if (!blob) return;
  await dbRequest('readwrite', store => store.put(blob, to));
  await removeAttachment(from);
}

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read an attachment for export.'));
    reader.readAsDataURL(blob);
  });
}

// One missing blob should not block a backup of everything else; the gap is recorded in the copy.
// shareRemoved lists share-copy categories to strip; a share copy never carries attachment bytes it was told to remove.
export async function exportAssessment(state, includeAttachments, {shareRemoved} = {}) {
  const payload = {format:'pqc-buyer-workbook', exportedAt:new Date().toISOString(), assessment:normalizeAssessment(state), attachments:[]};
  if (shareRemoved) {
    const removed = SHARE_CATEGORIES.filter(category => shareRemoved.includes(category));
    payload.shareCopy = {removed};
    redactForShare(payload.assessment, removed);
    if (removed.includes('files')) return {blob:new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), missing:[]};
  }
  const missing = [];
  for (const item of payload.assessment.evidence) {
    if (!item.attachmentName) continue;
    const blob = includeAttachments ? await getAttachment(item.id) : null;
    if (blob) {
      payload.attachments.push({id:item.id,name:item.attachmentName,type:blob.type,size:blob.size,dataUrl:await asDataUrl(blob)});
      continue;
    }
    if (includeAttachments) missing.push(item.id);
    item.note = `${item.note ? `${item.note}\n` : ''}${includeAttachments ? `Attachment ${item.attachmentName} was missing from browser storage at export.` : 'Attachment omitted from this answers-only export.'}`;
    item.attachmentName = ''; item.attachmentType = ''; item.attachmentSize = 0;
  }
  return {blob:new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), missing};
}

function blobFromDataUrl(value, declaredType) {
  if (typeof value !== 'string' || !value.startsWith(`data:${declaredType};base64,`)) throw new Error('An attachment in the import has an invalid format.');
  const encoded = value.slice(value.indexOf(',') + 1);
  if (encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8) throw new Error('An attachment is too large.');
  let binary;
  try { binary = atob(encoded); } catch { throw new Error('An attachment in the import has invalid data.'); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {type:declaredType});
}

export async function parseImport(file, decrypt) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('The import must be 45 MB or less.');
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('Choose a valid assessment JSON file.'); }
  if (raw?.format === 'pqc-buyer-workbook-encrypted') {
    if (!decrypt) throw new Error('This export is encrypted. Enter its passphrase to import it.');
    raw = await decrypt(raw);
  }
  if (raw?.format !== 'pqc-buyer-workbook') throw new Error('This is not a PQC Buyer Workbook export.');
  if (containsSecret(raw.assessment)) throw new Error('This file appears to contain secret key material. Remove it before importing.');
  const assessment = normalizeAssessment(raw.assessment);
  const report = normalizationReport(raw.assessment);
  const evidenceIds = assessment.evidence.map(item => item.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error('Evidence IDs in the import must be unique.');
  const attachments = [];
  let total = 0;
  const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  if (rawAttachments.length > LIMITS.evidence) throw new Error('The import has more attachments than evidence records allow.');
  for (const item of rawAttachments) {
    const id = text(item?.id, 60).trim().toUpperCase();
    const type = text(item?.type, 150);
    const matching = assessment.evidence.find(e => e.id === id);
    if (!id || !matching || !SAFE_TYPES.has(type)) throw new Error('An attachment does not match a safe evidence record.');
    if (attachments.some(entry=>entry.id===id)) throw new Error('An attachment ID is duplicated.');
    if (matching.attachmentName !== text(item?.name, 180) || matching.attachmentType !== type) throw new Error('Attachment details do not match the evidence record.');
    const blob = blobFromDataUrl(item.dataUrl, type);
    checkAttachment(blob, total);
    await sniffAttachment(blob, type);
    if (Number(item.size) !== blob.size) throw new Error(`Attachment ${id} failed its size check.`);
    total += blob.size;
    attachments.push({id,blob});
  }
  const shareCopy = Array.isArray(raw.shareCopy?.removed) ? SHARE_CATEGORIES.filter(category => raw.shareCopy.removed.includes(category)) : null;
  return {assessment, attachments, report, shareCopy};
}

export async function replaceAssessment(imported) {
  const saved = JSON.stringify(imported.assessment);
  const previous = localStorage.getItem(KEY);
  localStorage.setItem(KEY, saved);
  try {
    const db = await openDb();
    await new Promise((resolve,reject) => {
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      store.clear();
      for(const {id,blob} of imported.attachments) store.put(blob,id);
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error||new Error('Import could not save attachments.'));};
      tx.onabort=()=>{db.close();reject(tx.error||new Error('Import was canceled.'));};
    });
  } catch(error) {
    if (previous === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, previous);
    throw error;
  }
}

export async function resetAssessment() {
  await clearAttachments();
  localStorage.removeItem(KEY);
}
