import './frame-guard.js';
import './theme.js';
import {survey, controls, tests, terms, sources} from './content.js';
import {resources} from './resources.js';
import {fieldHelp} from './field-help.js';
import {buildScorecard, qualifyingEvidence} from './scorecard.js';
import {buildClaimDrafts, buildCycloneDxDraft, makeUuid} from './attestation.js';
import {parseRecordImport, prepareImportedRows, readCriteriaFile} from './record-import.js';
import {containsSecret} from './secrets.js';
import {relatedTestsForControl} from './control-links.js';
import {encryptExport, decryptExport, encryptionAvailable, FORMAT as ENCRYPTED_FORMAT, MIN_PASSPHRASE} from './crypto-export.js';
import {planReplayImport, packetDigestInput} from './replay-format.js';
import {compareAssessments} from './compare.js';
import {SHARE_CATEGORIES, SHARE_LABELS, REMOVED} from './share-copy.js';
import {graphSummary} from './bom-check.js';
import {buildCbomDraft} from './cbom-export.js';
import {STATUSES, criteriaFromModel, criteriaFromRows, levelSummary, criterionHtml} from './pqcmm.js';
import {createValidator} from './json-schema.js';
import {buildGrcPackage, PLATFORMS} from './grc-export.js';
import {
  KEY, UNREADABLE_KEY, PRODUCERS, MAX_IMPORT_BYTES,
  blankAssessment, loadAssessment, saveAssessment, normalizeAssessment, allocateId, syncCounters, inferProducer,
  putAttachment, getAttachment, removeAttachment, renameAttachment,
  exportAssessment, parseImport, replaceAssessment, resetAssessment
} from './storage.js';

const $ = selector => document.querySelector(selector);
const view = $('#view');
const recordDialog = $('#record-dialog');
const transferDialog = $('#transfer-dialog');
const glossary = Object.fromEntries(terms.map(([word, meaning]) => [word.toUpperCase(), meaning]));
const glossaryPattern = /\b(FIPS 203|FIPS 204|FIPS 205|CNSA 2\.0|ML-KEM|ML-DSA|SLH-DSA|PQCMM|CBOM|SBOM|CAVP|CMVP|PQC|NSS|TLS|hybrid|authentication|digital signature|crypto agility|negative control)\b/gi;
const SECRET_WARNING = 'Do not enter private keys in the workbook. Keep only identifiers and custody references.';
let state;
let storageError = '';
const rawSaved = localStorage.getItem(KEY);
try { state = loadAssessment(); }
catch (error) { storageError = error.message; state = blankAssessment(); }
let route = location.hash.slice(1) || 'overview';
let selectedQuestion = 'Q01';
let selectedTest = 'T01';
let selectedControl = 'C01';
let surveyFilter = 'all';
let surveySearch = '';
let resourceSearch = '';
let resourceGroup = 'All';
let resourceExpanded = false;
let dialogType = '';
let pendingCriteria = null;
let editingId = '';
let toastTimer;
let recordImportType='';
let pendingRecordImport=null;
let pendingImport=null;
let pendingImportFile=null;
let pendingReplay=null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const safeUrl = value => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
// An address that is not http(s) stays visible as text instead of becoming a link back to this page.
const link = (url, label) => safeUrl(url) ? `<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
const fieldValue = (value) => escapeHtml(value ?? '');
const answer = id => state.survey[id] || {};
const controlAnswer = id => state.controls[id] || {};
const testAnswer = id => state.tests[id] || {};
const allTests = () => [...tests, ...(state.customTests || []).map(item => [item.id,item.title,item.expected,item.path,item.sources])];
const evidenceFor = id => state.evidence.filter(item => item.linkedIds?.includes(id));
const short = (value, size=120) => value?.length > size ? `${value.slice(0,size-1)}…` : (value || '');
const listJoin = items => items.length < 2 ? (items[0] || '') : `${items.slice(0,-1).join(', ')}${items.length > 2 ? ',' : ''} and ${items.at(-1)}`;
const dateLabel = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : 'Not saved';
const fileBase = () => (state.buyer.product||'pqc-assessment').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45) || 'pqc-assessment';
const today = () => new Date().toISOString().slice(0,10);
const statusPill = (value, fallback='Not reviewed') => {
  const label = value || fallback;
  const kind = /^(Accepted|Observed|Closed|Yes|Proceed|Ready for human review|Met)$/.test(label) ? 'good'
    : /^(Gap|Reject|Rejected|Failed|No|Pause|Blocked|Not met)$/.test(label) ? 'bad'
    : /^(Clarify|Partial|Open|In progress|Conditional|Counter-evidence needs review|Insufficient detail|Proof needed|Inconclusive|Accepted risk|Undecided)$/.test(label) ? 'warn' : 'unknown';
  return `<span class="pill ${kind}">${escapeHtml(label)}</span>`;
};

function glossaryHtml(value) {
  return escapeHtml(value).replace(glossaryPattern, match => {
    const meaning = glossary[match.toUpperCase()] || glossary[match === 'digital signature' ? 'DIGITAL SIGNATURE' : match.toUpperCase()];
    return meaning ? `<abbr class="term" data-definition="${escapeHtml(meaning)}" aria-describedby="term-tooltip" tabindex="0">${match}</abbr>` : match;
  });
}
function helpLabel(label) {
  const meaning = fieldHelp[label];
  return meaning ? `<abbr class="term field-term" data-definition="${escapeHtml(meaning)}" aria-describedby="term-tooltip" tabindex="0">${escapeHtml(label)}</abbr>` : glossaryHtml(label);
}

const tooltip = $('#term-tooltip');
let activeTerm = null;
function showTerm(term) {
  if (!term?.dataset.definition) return;
  activeTerm = term;
  const dialog = term.closest('dialog[open]');
  (dialog || document.body).append(tooltip);
  tooltip.textContent = term.dataset.definition;
  tooltip.hidden = false;
  const rect = term.getBoundingClientRect();
  const width = tooltip.getBoundingClientRect().width;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const above = rect.bottom + tooltip.offsetHeight + 12 > window.innerHeight && rect.top > tooltip.offsetHeight + 12;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${above ? rect.top - tooltip.offsetHeight - 8 : rect.bottom + 8}px`;
}
function hideTerm(term) {
  if (term && activeTerm !== term) return;
  tooltip.hidden = true;
  activeTerm = null;
  if (tooltip.parentElement !== document.body) document.body.append(tooltip);
}
document.addEventListener('pointerover', event => { const term = event.target.closest?.('.term'); if (term) showTerm(term); });
document.addEventListener('pointerout', event => {
  const term = event.target.closest?.('.term');
  if (term && !term.contains(event.relatedTarget)) hideTerm(term);
});
document.addEventListener('focusin', event => { const term = event.target.closest?.('.term'); if (term) showTerm(term); });
document.addEventListener('focusout', event => { const term = event.target.closest?.('.term'); if (term) hideTerm(term); });
window.addEventListener('scroll', () => hideTerm(), {passive:true});
window.addEventListener('resize', () => hideTerm());

function showToast(message, error=false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = '', 4500);
}

// Attachments are keyed by evidence id; move any blob stored under a lower-case id to its canonical id.
function migrateAttachmentKeys(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || 'null'); } catch { return; } // Unreadable data is kept and offered for download instead.
  for (const item of Array.isArray(parsed?.evidence) ? parsed.evidence : []) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (item?.attachmentName && id && id !== id.toUpperCase()) renameAttachment(id, id.toUpperCase()).catch(error => showToast(`Attachment for ${id} could not be moved: ${error.message}`, true));
  }
}
migrateAttachmentKeys(rawSaved);

function unreadableCopy() {
  try { return localStorage.getItem(UNREADABLE_KEY); }
  catch { return null; } // Storage itself is unavailable, so there is no kept copy to offer.
}

function exportStatus() {
  const exported = Date.parse(state.lastExportedAt), updated = Date.parse(state.updatedAt);
  if (!exported) return 'Not exported yet';
  if (updated > exported) return `Changes not exported since ${dateLabel(state.lastExportedAt)}`;
  return `Exported ${dateLabel(state.lastExportedAt)}`;
}

function persist() {
  try {
    saveAssessment(state);
    storageError = '';
  } catch {
    storageError = 'Browser storage is full or unavailable. Export JSON now to keep this work.';
    showToast(storageError, true);
  }
  updateHeader();
}

function updateHeader() {
  const label = [state.buyer.product, state.buyer.version].filter(Boolean).join(' · ');
  $('#product-line').textContent = label || 'Untitled assessment';
  $('#survey-nav-count').textContent = `${countSurvey()}/${survey.length}`;
  $('#save-status').textContent = storageError ? 'Save failed' : `Saved locally ${dateLabel(state.updatedAt)}`;
  $('#export-status').textContent = exportStatus();
}

function countSurvey() { return survey.filter((_,index) => ['Yes','No','Partial','Unknown','N/A'].includes(answer(qid(index)).answer)).length; }
function qid(index) { return `Q${String(index+1).padStart(2,'0')}`; }
// The auto-created statement records the supplier's answer; it is never treated as reviewed proof.
function syncSurveyEvidence(id) {
  const response=answer(id);
  const index=state.evidence.findIndex(entry=>entry.originQuestion===id);
  if(!response.answer) {
    if(index<0) return;
    const item=state.evidence[index];
    if(item.result==='Not reviewed' && !item.attachmentName && (item.linkedIds||[]).every(link=>link===id)) state.evidence.splice(index,1);
    else { item.supplierAnswer=''; item.note=[item.note,'The supplier answer was withdrawn.'].filter(Boolean).join(' '); }
    return;
  }
  let item=state.evidence[index];
  if(!item) {
    item={id:allocateId(state,'EV',state.evidence),type:'Vendor statement',producer:'Supplier',artifact:`Supplier answer to ${id}`,issuer:state.buyer.vendor||'',date:'',productMatch:'Unsure',pathMatch:'Unsure',location:'',result:'Not reviewed',sensitivity:'Customer confidential',linkedIds:[id],note:'Proof requested; buyer has not reviewed an artifact.',originQuestion:id};
    state.evidence.push(item);
  }
  item.supplierAnswer=response.answer;
  item.supplierDetail=response.detail||'';
  if(!item.linkedIds.includes(id)) item.linkedIds.push(id);
}
function metrics() {
  const s=buildScorecard(state,survey,controls,allTests());
  return {
    answered:s.answered, crypto:state.crypto.length, describedUses:s.mappedUses,
    accepted:state.evidence.filter(item => item.result === 'Accepted').length, qualified:s.qualifiedProof,
    openActions:s.openActions, acceptedControls:s.acceptedControls, applicableControls:s.applicableControls,
    needsReview:controls.filter(item => ['Clarify','Gap'].includes(controlAnswer(item[0]).result)).length,
    observedTests:s.observedTests, supportedTests:s.supportedTests
  };
}

function knownIds() {
  return new Set([...survey.map((_,index)=>qid(index)), ...allTests().map(item=>item[0]), ...controls.map(item=>item[0]),
    ...['crypto','evidence','boms','actions','licenses'].flatMap(kind=>state[kind].map(item=>item.id)), ...state.pqcmm.criteria.map(item=>item.key)]);
}
// Structured links that point at nothing: typos, or records deleted elsewhere.
function brokenLinks() {
  const known=knownIds(), evidenceIds=new Set(state.evidence.map(item=>item.id)), uses=new Set(state.crypto.map(item=>item.id));
  const broken=[];
  for (const item of state.evidence) for (const id of item.linkedIds||[]) if (!known.has(id)) broken.push(`${item.id} links to ${id}`);
  for (const [id,test] of Object.entries(state.tests)) if (test.cryptoUseId && !uses.has(test.cryptoUseId)) broken.push(`${id} names crypto use ${test.cryptoUseId}`);
  for (const action of state.actions) if (action.closureProof && !evidenceIds.has(action.closureProof)) broken.push(`${action.id} closure proof ${action.closureProof}`);
  for (const license of state.licenses) if (license.proofId && !evidenceIds.has(license.proofId)) broken.push(`${license.id} proof ${license.proofId}`);
  if (state.licensing?.proofId && !evidenceIds.has(state.licensing.proofId)) broken.push(`License terms proof ${state.licensing.proofId}`);
  for (const bom of state.boms) if (/^[A-Z]{1,4}-\d{1,6}$/.test(bom.source||'') && !evidenceIds.has(bom.source)) broken.push(`${bom.id} source ${bom.source}`);
  return broken;
}
const inboundLine = id => {
  const linked=evidenceFor(id);
  return linked.length ? `<p>Linked proof: ${linked.map(item=>`${escapeHtml(item.id)} (${escapeHtml(item.result||'Not reviewed')})`).join(', ')}</p>` : '';
};

function pageHead(step,title,description,actions='') {
  return `<div class="page-head"><div><p class="eyebrow">${step}</p><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
function field(label,key,value,type='text',help='',options=[],scope='buyer') {
  const id = `${scope}-${key}`;
  const data = `data-${scope}="${key}"`;
  const control = type === 'select'
    ? `<select id="${id}" ${data}><option value="">Choose one</option>${options.map(option => `<option${value === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`
    : type === 'textarea'
      ? `<textarea id="${id}" ${data} rows="3">${fieldValue(value)}</textarea>`
      : `<input id="${id}" ${data} type="${type}" value="${fieldValue(value)}">`;
  return `<div class="field"><label for="${id}">${helpLabel(label)}</label>${control}${help ? `<small>${glossaryHtml(help)}</small>` : ''}</div>`;
}

function decisionWarning() {
  if (state.buyer.decision !== 'Proceed') return '';
  const s=buildScorecard(state,survey,controls,allTests());
  const counter=buildClaimDrafts(state).filter(draft=>draft.status==='Counter-evidence needs review').length;
  const parts=[s.unresolvedRequiredTests&&`${s.unresolvedRequiredTests} buyer-required test(s) lack a supported result`,s.openActions&&`${s.openActions} action(s) are open or blocked`,counter&&`${counter} claim draft(s) have counter-evidence`].filter(Boolean);
  return parts.length ? `<div class="field full"><div class="warning decision-warning">Proceed is recorded while ${parts.join(', ')}. The buyer can still proceed; record why in Conditions before purchase.</div></div>` : '';
}

function renderOverview() {
  const b = state.buyer, m=metrics();
  const product = b.product ? escapeHtml(b.product) : 'Name the product you are reviewing';
  const attention = controls.filter(item => {
    const result = controlAnswer(item[0]).result;
    return result === 'Gap' || result === 'Clarify';
  }).slice(0,5);
  return `${pageHead('01 / Buyer record','Define this purchase','Record the exact release and deployment you may buy. Assign an owner before reviewing claims or proof.')}
    ${unreadableCopy() ? `<div class="warning">A saved assessment in this browser could not be read, so the app started a new one and kept the old data unchanged. <button type="button" class="quiet-button" data-action="download-unreadable">Download unreadable saved data</button> <button type="button" class="danger-button" data-action="discard-unreadable">Discard it</button></div>` : storageError ? `<div class="warning">${escapeHtml(storageError)}</div>` : ''}
    <div class="lead-record"><p class="eyebrow">Product under review</p><h2>${product}</h2><p>${b.version ? `Version ${escapeHtml(b.version)}` : 'Version needed'}${b.configuration ? ` · ${escapeHtml(short(b.configuration,95))}` : ' · Deployment setup needed'}</p><p>${b.vendor?`Supplier: ${escapeHtml(b.vendor)}`:'Supplier needed'} · ${b.setting?escapeHtml(b.setting):'Buyer setting needed'}</p></div>
    <div class="stats"><div class="stat"><strong>${m.answered} / ${survey.length}</strong><span>Vendor questions answered</span></div><div class="stat"><strong>${m.crypto}</strong><span>Cryptographic uses recorded, ${m.describedUses} fully described</span></div><div class="stat"><strong>${m.accepted} accepted</strong><span>Proof items, ${m.qualified} qualify under the scorecard rules</span></div><div class="stat"><strong>${m.openActions}</strong><span>Open or blocked actions</span></div></div>
    <section class="section"><div class="section-head"><div><h2>Product and buyer</h2><p>One assessment covers one offered build and setup.</p></div></div><div class="section-body field-grid">
    ${field('Organization / buyer','organization',b.organization)}
    ${field('Product or service','product',b.product)}
    ${field('Version, edition, SKU','version',b.version)}
    ${field('Deployment and configuration','configuration',b.configuration)}
    ${field('Vendor','vendor',b.vendor)}
    ${field('Review owner','reviewer',b.reviewer)}
    ${field('Buyer setting','setting',b.setting,'select','The applicable policy depends on the actual buyer and system.',['Commercial / campus','US civilian federal','National Security System','Defense supplier','Other / unsure'])}
    ${field('Data protection life','dataLife',b.dataLife,'text','How long must the information remain secret or trustworthy?')}
    ${field('Target decision date','targetDate',b.targetDate,'date')}
    ${field('Policy or contract reference','policyRef',b.policyRef,'text','Record the exact rule and version that applies. Do not assume one 2030 deadline covers every system.')}
    ${field('Assessment date','assessmentDate',b.assessmentDate,'date')}
    </div></section>
    <section class="section"><div class="section-head"><div><h2>Buyer conclusion</h2><p>Write this after reviewing the claims and proof. Leave unknowns visible.</p></div></div><div class="section-body field-grid">
    ${field('Decision','decision',b.decision,'select','A decision is made by the buyer, not calculated from counts.',['Proceed','Conditional','Pause','No decision'])}
    ${field('Next review trigger','trigger',b.trigger,'text','For example: a major version, library, setup, or policy change.')}
    ${decisionWarning()}
    <div class="field full">${field('What was verified','verified',b.verified,'textarea','State the exact function and path that were checked.')}</div>
    <div class="field full">${field('What remains unknown','unknown',b.unknown,'textarea','Name missing proof and untested paths.')}</div>
    <div class="field full">${field('Conditions before purchase','conditions',b.conditions,'textarea','Link open action IDs and acceptance tests.')}</div>
    </div></section>
    <section class="section"><div class="section-head"><div><h2>Work path</h2><p>Each step builds the buyer record.</p></div></div><div class="section-body"><ol class="flow-list">
      <li><b>1</b><span>Ask the vendor ${survey.length} short questions about this version. Link each answer to proof.</span></li>
      <li><b>2</b><span>Map where the product uses cryptography and what discovery may have missed.</span></li>
      <li><b>3</b><span>Register evidence, then record tests and their limits.</span></li>
      <li><b>4</b><span>Review controls against the linked answers and proof. Assign gaps.</span></li>
      <li><b>5</b><span>Return here to state the buyer decision and open conditions.</span></li>
    </ol><p class="note-line">A buyer or procurement lead can complete the scope, survey, licensing, and decision. A technical reviewer should check the crypto map, the evidence, and every test result before the buyer relies on them.</p><button type="button" class="quiet-button" data-route="process">Open process flow</button></div></section>
    ${attention.length ? `<section class="section"><div class="section-head"><h2>Needs attention</h2></div><div class="section-body record-list">${attention.map(item => `<div class="record"><div class="record-top"><h3>${item[0]} · ${glossaryHtml(item[1])}</h3>${statusPill(controlAnswer(item[0]).result)}</div><p>${escapeHtml(controlAnswer(item[0]).gapAction || 'Add an action or request more proof.')}</p></div>`).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>Local data</h2></div><div class="section-body"><p class="note-line">This browser saves answers on this device. Export JSON to keep a portable copy. Attached evidence is stored in this browser and is included only when you choose that export option.</p><button type="button" class="danger-button" data-action="reset">Clear this assessment</button></div></section>`;
}

function surveyItems() {
  const filtered = survey.map((item,index)=>({item,id:qid(index)})).filter(({item,id}) => {
    const a=answer(id);
    if (surveyFilter === 'unanswered' && a.answer) return false;
    if (surveyFilter === 'review' && !['Clarify','Reject'].includes(a.review)) return false;
    return `${id} ${item[0]} ${item[1]}`.toLowerCase().includes(surveySearch.toLowerCase());
  });
  let group='';
  return filtered.length ? filtered.map(({item,id}) => {
    const groupLabel = item[0] !== group ? `<div class="question-group">${escapeHtml(item[0])}</div>` : '';
    group=item[0];
    return `${groupLabel}<button type="button" class="question-item ${selectedQuestion === id ? 'active' : ''}" aria-current="${selectedQuestion === id}" data-question="${id}"><span class="qid">${id}</span><span>${escapeHtml(item[1])}</span><i class="status-dot ${answer(id).answer ? 'done' : ''}" aria-hidden="true"></i></button>`;
  }).join('') : '<div class="empty">No questions match this view.</div>';
}

function evidenceChoices(claimId) {
  return state.evidence.length ? `<div class="linked-list">${state.evidence.map(item => `<label><input type="checkbox" data-link-evidence="${escapeHtml(item.id)}" data-claim="${claimId}" ${item.linkedIds?.includes(claimId) ? 'checked' : ''}><span>${escapeHtml(item.id)} · ${escapeHtml(short(item.artifact || item.type,34))}</span></label>`).join('')}</div>` : '<p class="help">No evidence yet. Add it in Evidence, then return to link it here.</p>';
}

function surveyCard() {
  const index = Number(selectedQuestion.slice(1))-1;
  const question=survey[index] || survey[0], id=qid(index < 0 ? 0 : index), a=answer(id);
  const select = (fieldName,options,placeholder) => `<select id="survey-${fieldName}" data-survey="${id}" data-field="${fieldName}"><option value="">${placeholder}</option>${options.map(option=>`<option${a[fieldName]===option?' selected':''}>${option}</option>`).join('')}</select>`;
  return `<article class="question-card"><div class="question-header"><p class="eyebrow">${id} / ${escapeHtml(question[0])}</p><h2>${glossaryHtml(question[1])}</h2></div><div class="question-body">
    <div class="proof-request"><strong>${helpLabel('Proof to request')}</strong>${glossaryHtml(question[2])}</div>
    <div class="field-grid"><div class="field"><label for="survey-answer">${helpLabel('Vendor answer')}</label>${select('answer',['Yes','No','Partial','Unknown','N/A'],'Choose an answer')}</div><div class="field"><label for="survey-review">${helpLabel('Buyer review')}</label>${select('review',['Accepted','Clarify','Reject','Not reviewed'],'Not reviewed')}</div></div>
    <div class="field"><label for="survey-detail">${helpLabel('Vendor detail')}</label><textarea id="survey-detail" data-survey="${id}" data-field="detail" placeholder="What does the vendor say about this exact product version?">${fieldValue(a.detail)}</textarea></div>
    <div class="field"><span class="field-label">${helpLabel('Linked proof')}</span><p class="help">Choosing an answer creates an unreviewed supplier statement in Evidence. Add the actual document or test trace separately, then review its scope.</p>${evidenceChoices(id)}</div>
    <div class="field"><label for="survey-followup">${helpLabel('Follow-up')}</label><textarea id="survey-followup" data-survey="${id}" data-field="followup" placeholder="Who needs to provide what, and by when?">${fieldValue(a.followup)}</textarea></div>
    <div class="record-meta">${statusPill(a.answer,'No answer')} ${statusPill(a.review,'Not reviewed')} <span>${evidenceFor(id).length} proof item(s) linked</span></div>
    </div></article>`;
}

function renderSurvey() {
  const m=metrics();
  return `${pageHead('03 / Vendor survey','Ask for proof','These questions cover the exact product and configuration. A yes or a roadmap needs a proof record.')}
    <div class="toolbar"><div class="toolbar-left"><input class="searchbox" id="survey-search" type="search" placeholder="Find a question" value="${fieldValue(surveySearch)}" aria-label="Find a question"></div><div class="toolbar-right"><span class="pill">${m.answered} of ${survey.length} answered</span><div class="segmented"><button type="button" data-survey-filter="all" class="${surveyFilter==='all'?'active':''}">All</button><button type="button" data-survey-filter="unanswered" class="${surveyFilter==='unanswered'?'active':''}">Unanswered</button><button type="button" data-survey-filter="review" class="${surveyFilter==='review'?'active':''}">Needs review</button></div></div></div>
    <div class="survey-layout"><div class="question-list" aria-label="Vendor questions">${surveyItems()}</div>${surveyCard()}</div>`;
}

// Node names are matched without regard to case or surrounding spaces, so one system draws once.
const nodeKey = name => String(name).trim().toLowerCase();
function renderTopology() {
  const drawable=state.crypto.filter(item=>String(item.sourceNode||'').trim() && String(item.destinationNode||'').trim());
  const uses=drawable.slice(0,40);
  const labels=new Map();
  for (const item of uses) for (const name of [item.sourceNode,item.destinationNode]) if (!labels.has(nodeKey(name))) labels.set(nodeKey(name),String(name).trim());
  const nodes=[...labels.keys()];
  const positions=new Map(nodes.map((name,index)=>{
    const angle=2*Math.PI*index/Math.max(nodes.length,1)-Math.PI/2;
    return [name,{x:460+330*Math.cos(angle),y:230+165*Math.sin(angle)}];
  }));
  const edges=uses.map(item=>{
    const from=positions.get(nodeKey(item.sourceNode)), to=positions.get(nodeKey(item.destinationNode));
    // Colors come from the stylesheet, so the diagram follows the chosen style.
    const edge=item.usageStatus==='Observed'?'edge-observed':item.usageStatus==='Configured'?'edge-configured':'edge-other';
    if (nodeKey(item.sourceNode)===nodeKey(item.destinationNode)) return `<g><path d="M ${from.x+24} ${from.y-24} C ${from.x+95} ${from.y-110}, ${from.x-95} ${from.y-110}, ${from.x-24} ${from.y-24}" class="${edge}" fill="none" stroke-width="2.5" marker-end="url(#arrow)"/><title>${escapeHtml(`${item.id}: cryptography used within ${item.sourceNode}`)}</title></g>`;
    const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1;
    return `<g><line x1="${from.x+35*dx/length}" y1="${from.y+35*dy/length}" x2="${to.x-39*dx/length}" y2="${to.y-39*dy/length}" class="${edge}" stroke-width="2.5" marker-end="url(#arrow)"/><title>${escapeHtml(`${item.id}: ${item.sourceNode} to ${item.destinationNode}; ${item.function||'function unknown'}; ${item.usageStatus||'status unknown'}`)}</title></g>`;
  }).join('');
  const circles=nodes.map(key=>{const {x,y}=positions.get(key), name=labels.get(key);return `<g><circle class="node" cx="${x}" cy="${y}" r="34" stroke-width="1.5"/><text class="node-label" x="${x}" y="${y+47}" text-anchor="middle" font-size="12">${escapeHtml(short(name,23))}</text><title>${escapeHtml(name)}</title></g>`;}).join('');
  return `<section class="section topology"><div class="section-head"><div><h2>${helpLabel('Path topology')}</h2><p>Manual diagram from the source and destination you enter for each crypto use.</p></div></div><div class="section-body">${uses.length?`<div class="topology-scroll"><svg role="img" aria-label="Manual cryptographic path topology" viewBox="0 0 920 500"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="arrowhead" d="M0,0 L6,3 L0,6"/></marker></defs>${edges}${circles}</svg></div><p class="help topology-legend"><span class="swatch edge-observed" aria-hidden="true"></span>Observed <span class="swatch edge-configured" aria-hidden="true"></span>Configured <span class="swatch edge-other" aria-hidden="true"></span>Listed, claimed, or unknown. An arrow records a path entered by the reviewer; it does not prove traffic or security.</p><ul class="topology-paths">${uses.map(item=>`<li><b>${escapeHtml(item.id)}</b> ${escapeHtml(item.sourceNode)} → ${escapeHtml(item.destinationNode)} · ${escapeHtml(item.current||'method unknown')} · ${escapeHtml(item.usageStatus||'status unknown')}</li>`).join('')}</ul>`:'<p class="note-line">Add a crypto use with source and destination to draw a path.</p>'}${drawable.length>40?'<p class="help">Diagram shows the first 40 paths. All records remain below.</p>':''}</div></section>`;
}

function renderBomRegister() {
  return `<section class="section"><div class="section-head"><div><h2>${helpLabel('SBOM and CBOM register')}</h2><p>Record each supplied inventory for this exact release. Link its evidence ID and individual bom-ref values to crypto uses.</p></div><div class="page-actions"><button type="button" class="quiet-button" data-import-records="boms">Import JSON or Excel</button><button type="button" class="quiet-button" data-add="boms">Add BOM record</button></div></div><div class="section-body record-list">${state.boms.length?state.boms.map(item=>`<article class="record"><div class="record-top"><div><h3>${escapeHtml(item.id)} · ${escapeHtml(item.kind||'BOM type needed')} · ${escapeHtml(item.target||'Target needed')}</h3><p>Release ${escapeHtml(item.release||'unknown')} · Lifecycle ${escapeHtml(item.lifecycle||'unknown')} · Completeness ${escapeHtml(item.composition||'unknown')}</p></div><div class="record-actions"><button type="button" data-edit="boms" data-id="${escapeHtml(item.id)}">Edit</button><button type="button" class="delete" data-delete="boms" data-id="${escapeHtml(item.id)}">Delete</button></div></div><p>Schema check: ${escapeHtml(item.validation||'not recorded')}</p><p>Signature check: ${escapeHtml(item.signature||'not recorded')}</p><p>Distribution: ${escapeHtml(item.distribution||'not recorded')}.</p>${bomGraphHtml(item)}${inboundLine(item.id)}</article>`).join(''):'<p class="note-line">No SBOM or CBOM recorded. Ask for the file, release scope, completeness statement, and how it was generated.</p>'}<p class="help">Importing a CycloneDX JSON BOM checks it against the official 1.7 schema, verifies a single JSF signature with the key embedded in the file, and keeps its dependency graph. A valid signature shows the file is unchanged since signing; compare the key thumbprint with the supplier's published key. A library that provides an algorithm has not necessarily used it in the deployed path.</p></div></section>`;
}

const graphName = (bom, ref) => { const node = (bom.graph||[]).find(entry=>entry.ref===ref); return node?.name ? [node.name,node.version].filter(Boolean).join(' ') : ref; };
function bomGraphHtml(bom) {
  if(!bom.graph?.length) return '';
  const rows=bom.graph.filter(node=>node.dependsOn.length||node.provides.length).map(node=>`<li><b>${escapeHtml(graphName(bom,node.ref))}</b>${node.type?` (${escapeHtml(node.type)})`:''}${node.dependsOn.length?` depends on ${escapeHtml(node.dependsOn.map(ref=>graphName(bom,ref)).join(', '))}`:''}${node.dependsOn.length&&node.provides.length?';':''}${node.provides.length?` provides ${escapeHtml(node.provides.map(ref=>graphName(bom,ref)).join(', '))}`:''}</li>`);
  return `<details class="bom-graph"><summary>Dependency graph: ${bom.graph.length} entries</summary><ul>${rows.join('')}</ul><p class="help">${escapeHtml(bom.dependencies||'')}</p></details>`;
}

// Names the BOM components that depend on or provide a crypto use's CBOM asset.
function bomProvenance(item) {
  if(!item.cbomRef) return '';
  const found=state.boms.flatMap(bom=>{
    const providers=(bom.graph||[]).filter(node=>node.provides.includes(item.cbomRef)).map(node=>graphName(bom,node.ref));
    const users=(bom.graph||[]).filter(node=>node.dependsOn.includes(item.cbomRef)).map(node=>graphName(bom,node.ref));
    if(!providers.length&&!users.length) return [];
    return [`${bom.id}: ${[providers.length&&`provided by ${providers.join(', ')}`,users.length&&`used by ${users.join(', ')}`].filter(Boolean).join('; ')}`];
  });
  return found.length?` · In BOM ${found.join(' · ')}`:'';
}

function renderRecords(type) {
  const config = {
    crypto:{step:'04 / Crypto map',title:'Where is cryptography used?',description:'Record current methods and future plans separately. One product may have many uses and paths.',button:'Add crypto use',items:state.crypto,empty:'Start with one connection, signature, or stored-data use. Include known blind spots.'},
    evidence:{step:'05 / Evidence',title:'Proof register',description:'Keep each proof item once, then link it to questions, controls, tests, or crypto uses.',button:'Add proof',items:state.evidence,empty:'Add a document, test trace, report, certificate, or inventory record. Sensitive files stay local.'},
    actions:{step:'09 / Actions',title:'Close the gaps',description:'Each missing proof or unresolved risk needs an owner, date, and closure record.',button:'Add action',items:state.actions,empty:'No actions recorded. Add an action for a gap, missing proof, or planned acceptance test.'}
  }[type];
  const broken = type==='evidence' ? brokenLinks() : [];
  const cards=config.items.map(item => {
    const title = type==='crypto' ? (item.protected || item.function || 'Unnamed use') : type==='evidence' ? (item.artifact || item.type || 'Unnamed proof') : (item.gap || item.task || 'Unnamed action');
    const subtitle = type==='crypto' ? [item.path,item.current,item.component].filter(Boolean).join(' · ') : type==='evidence' ? [item.type,item.producer&&`produced by ${item.producer}`,item.issuer,item.date].filter(Boolean).join(' · ') : [item.owner,item.targetDate,item.linked].filter(Boolean).join(' · ');
    const badge = type==='evidence' ? statusPill(item.result) : type==='actions' ? statusPill(item.status,'Open') : statusPill(item.function,'Unspecified');
    const risk = item.status==='Accepted risk' ? ` · Risk accepted by ${item.riskApprover || 'nobody named'}, scope ${item.riskScope || 'not recorded'}, expires ${item.riskExpiry || 'never recorded'}` : '';
    const detail = type==='crypto' ? `Target: ${item.target || 'Not set'} · Coverage: ${item.coverage || 'Not recorded'}${bomProvenance(item)}` : type==='evidence' ? `${item.originQuestion ? `Survey answer ${item.supplierAnswer||'withdrawn'}: ${item.supplierDetail||'No detail yet'} · Buyer proof remains unreviewed · ` : ''}Linked to: ${(item.linkedIds||[]).join(', ') || 'nothing yet'}${item.attachmentName ? ` · Attachment: ${item.attachmentName}` : ''}` : `Next: ${item.task || 'Not recorded'}${item.closureProof ? ` · Closure proof: ${item.closureProof}` : ''}${risk}`;
    return `<article class="record"><div class="record-top"><div><h3>${escapeHtml(item.id)} · ${glossaryHtml(title)}</h3><div class="record-meta"><span>${escapeHtml(subtitle || 'Details needed')}</span>${badge}</div></div><div class="record-actions"><button type="button" data-edit="${type}" data-id="${escapeHtml(item.id)}">Edit</button>${type==='evidence' && item.attachmentName ? `<button type="button" data-download-attachment="${escapeHtml(item.id)}">Download file</button>` : ''}<button type="button" class="delete" data-delete="${type}" data-id="${escapeHtml(item.id)}">Delete</button></div></div><p>${escapeHtml(detail)}</p>${type==='actions'?inboundLine(item.id):''}</article>`;
  }).join('');
  return `${pageHead(config.step,config.title,config.description,`${type==='crypto'&&state.crypto.length?'<button type="button" class="quiet-button" data-export-cbom>Export CBOM draft</button>':''}${type!=='actions'?`<button type="button" class="quiet-button" data-import-records="${type}">Import JSON or Excel</button>`:''}<button type="button" class="primary-button" data-add="${type}">${config.button}</button>`)}
    ${type==='crypto'?renderTopology()+renderBomRegister():''}
    ${type==='crypto' ? '<div class="warning">A manual map helps with intake. It is not a complete CycloneDX CBOM. Record the discovery method and what it missed.</div>' : ''}
    ${type==='evidence' ? '<p class="note-line">Accepted means a reviewer checked the source and its fit to the offered product, version, and path. The app does not validate a certificate automatically. Record who produced each item: a supplier document restates the claim, while buyer or independent proof checks it.</p>' : ''}
    ${broken.length ? `<div class="warning integrity-warning"><strong>Links to check:</strong> ${broken.map(escapeHtml).join('; ')}.</div>` : ''}
    <div class="record-list">${cards || `<div class="empty">${config.empty}</div>`}</div>`;
}

function questionRefs(value) {
  const found = new Set();
  const parts = String(value).split(';').map(part=>part.trim());
  for (const part of parts) {
    const range = part.match(/^(Q\d{2})-(Q\d{2})$/);
    if (range) { for (let n=Number(range[1].slice(1));n<=Number(range[2].slice(1));n++) found.add(`Q${String(n).padStart(2,'0')}`); }
    else if (/^Q\d{2}$/.test(part)) found.add(part);
  }
  return [...found];
}

function controlPrompt(control) {
  const ids=questionRefs(control[3]);
  const answered=ids.filter(id => answer(id).answer).length;
  const linked=state.evidence.filter(item => item.linkedIds?.some(id=>id===control[0] || ids.includes(id)));
  const accepted=linked.filter(qualifyingEvidence).length;
  if (!answered) return 'Waiting for vendor answers';
  if (!linked.length) return 'Request proof';
  if (!accepted) return 'Proof needs scope and provenance review';
  if (relatedTestsForControl(control[0],state).some(id=>testAnswer(id).requiredForProcurement==='Yes' && (testAnswer(id).blocked==='Yes' || testAnswer(id).result!=='Observed'))) return 'Buyer-required test unresolved';
  return 'Proof available for buyer review';
}

function renderControls() {
  const m=metrics();
  return `${pageHead('07 / Control proof','Review each expectation','The app shows linked answers and proof. A reviewer decides whether the evidence supports each expectation.')}
    <p class="note-line">These ${controls.length} buyer checks summarize the sources linked in each card. They are not a one-to-one copy of agency controls. One check may need several survey answers, proof items, and conditional tests. The same artifact can support several checks when its product and path match. A failed or blocked buyer-required test needs a decision before accepting its linked check. Proof marked "via" was linked to one of the check's questions rather than to the check itself.</p>
    <div class="stats"><div class="stat"><strong>${m.acceptedControls} / ${m.applicableControls}</strong><span>Applicable checks accepted</span></div><div class="stat"><strong>${m.needsReview}</strong><span>Clarify or gap</span></div><div class="stat"><strong>${state.evidence.length}</strong><span>Proof records</span></div><div class="stat"><strong>${m.openActions}</strong><span>Open actions</span></div></div>
    <div class="survey-layout"><div class="question-list" aria-label="Control list">${controls.map(c=>`<button type="button" class="question-item ${selectedControl===c[0]?'active':''}" aria-current="${selectedControl===c[0]}" data-select-control="${c[0]}"><span class="qid">${c[0]}</span><span>${escapeHtml(c[1])}</span><i class="status-dot ${controlAnswer(c[0]).result?'done':''}" aria-hidden="true"></i></button>`).join('')}</div><div class="record-list">${controls.filter(c=>c[0]===selectedControl).map(c => {
      const a=controlAnswer(c[0]), ids=questionRefs(c[3]), linkedTests=relatedTestsForControl(c[0],state);
      const linked=state.evidence.filter(item=>item.linkedIds?.some(id=>id===c[0] || ids.includes(id)));
      const route=item=>item.linkedIds.includes(c[0]) ? 'direct' : `via ${item.linkedIds.filter(id=>ids.includes(id)).join(', ')}`;
      const fieldId=name=>`control-${c[0]}-${name}`;
      return `<article class="record control"><div class="control-main"><p class="eyebrow">${c[0]} · ${helpLabel('Source IDs')}: ${String(c[2]).split(';').map(id=>{const source=allSourceIds.find(item=>item[0]===id.trim());return source?link(source[2],id.trim()):escapeHtml(id.trim());}).join(' · ')}</p><h3><abbr class="term" data-definition="${escapeHtml(`Check this expectation against questions ${c[3]} and the original sources ${c[2]}. The reviewer decides whether linked proof is enough.`)}" aria-describedby="term-tooltip" tabindex="0">${escapeHtml(c[1])}</abbr></h3><div class="record-meta"><span>${ids.map(id => `${id}: ${answer(id).answer || 'no answer'}`).join(' · ')}</span></div><div class="linked-list">${linked.length ? linked.map(item=>`<span class="pill ${qualifyingEvidence(item)?'good':'warn'}">${escapeHtml(item.id)}: ${escapeHtml(qualifyingEvidence(item)?'Matching proof':item.result==='Accepted'?'Scope or provenance check needed':item.result||'Not reviewed')} (${escapeHtml(route(item))})</span>`).join('') : '<span class="help">No proof linked</span>'}</div><p class="help">Suggested related tests: ${linkedTests.length?linkedTests.map(id=>`<button type="button" class="quiet-button" data-open-test="${id}">${id}: ${escapeHtml(testAnswer(id).result||'not run')}${testAnswer(id).blocked==='Yes'?' (blocked)':''}${testAnswer(id).requiredForProcurement==='Yes'?' (buyer required)':''}</button>`).join(' '):'Document review; no fixed test is mapped.'}</p><div class="record-meta">${statusPill(controlPrompt(c))}${statusPill(a.result)}</div></div>
      <div class="control-side"><div class="field"><label for="${fieldId('applies')}">${helpLabel('Applies?')}</label><select id="${fieldId('applies')}" data-control="${c[0]}" data-field="applies"><option value="">Choose</option>${['Yes','No','Unsure'].map(v=>`<option${a.applies===v?' selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="${fieldId('result')}">${helpLabel('Buyer result')}</label><select id="${fieldId('result')}" data-control="${c[0]}" data-field="result"><option value="">Not reviewed</option>${['Accepted','Clarify','Gap','N/A'].map(v=>`<option${a.result===v?' selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label for="${fieldId('ownerTeam')}">${helpLabel('Control owner or team')}</label><input id="${fieldId('ownerTeam')}" data-control="${c[0]}" data-field="ownerTeam" value="${fieldValue(a.ownerTeam)}"></div><div class="field"><label for="${fieldId('rationale')}">${helpLabel('Review rationale')}</label><textarea id="${fieldId('rationale')}" data-control="${c[0]}" data-field="rationale" rows="2">${fieldValue(a.rationale)}</textarea></div><div class="field"><label for="${fieldId('gapAction')}">${helpLabel('Gap or action ID')}</label><input id="${fieldId('gapAction')}" data-control="${c[0]}" data-field="gapAction" value="${fieldValue(a.gapAction)}" placeholder="AC-001"></div><span class="mini">Questions: ${escapeHtml(c[3])}. Test links are suggestions; mark procurement needs in Tests.</span></div></article>`;
    }).join('')}</div></div>`;
}

const RESULT_OPTIONS = [['Observed','Observed (reviewer-recorded)'],['Failed','Failed'],['Inconclusive','Inconclusive'],['N/A','N/A']];
function renderTests() {
  const cases=allTests();
  if (!cases.some(item=>item[0]===selectedTest)) selectedTest='T01';
  return `${pageHead('06 / Tests','Record what happened','A result applies only to the product build, path, and conditions written here.', '<button type="button" class="quiet-button" data-import-replay>Import replay packet</button><button type="button" class="primary-button" data-add="customTests">Add product-specific test</button>')}
    <div class="warning">The ${tests.length} starting tests are conditional examples, not a complete requirement list. The buyer sets procurement requirements for this product. Run tests only on authorized systems. A handshake does not prove certificate authentication, internal traffic, or FIPS validation. This app does not run tests: every result here is recorded by a reviewer, and an observed result counts in the scorecard only when buyer or independent proof backs it.</div>
    <div class="survey-layout records-spaced"><div class="question-list" aria-label="Test list">${cases.map(t=>`<button type="button" class="question-item ${selectedTest===t[0]?'active':''}" aria-current="${selectedTest===t[0]}" data-select-test="${t[0]}"><span class="qid">${t[0]}</span><span>${escapeHtml(t[1])}</span><i class="status-dot ${testAnswer(t[0]).result?'done':''}" aria-hidden="true"></i></button>`).join('')}</div><div class="record-list">${cases.filter(t=>t[0]===selectedTest).map(t => {
      const a=testAnswer(t[0]);
      const id=name=>`test-${t[0]}-${name}`;
      const label=(name,text)=>`<label for="${id(name)}">${helpLabel(text)}</label>`;
      const select=(name,options,placeholder='Choose')=>`<select id="${id(name)}" data-test="${t[0]}" data-field="${name}"><option value="">${placeholder}</option>${options.map(option=>`<option${a[name]===option?' selected':''}>${option}</option>`).join('')}</select>`;
      const input=(name,extra='')=>`<input id="${id(name)}" data-test="${t[0]}" data-field="${name}" value="${fieldValue(a[name])}" ${extra}>`;
      const area=name=>`<textarea id="${id(name)}" data-test="${t[0]}" data-field="${name}" rows="2">${fieldValue(a[name])}</textarea>`;
      return `<article class="record"><div class="record-top"><div><p class="eyebrow">${t[0]} · ${escapeHtml(t[3])}</p><h3>${glossaryHtml(t[1])}</h3><p>Expected proof: ${glossaryHtml(t[2])}</p></div>${statusPill(a.result,'Not run')}</div>
        ${t[0].startsWith('XT-')?`<div class="record-actions"><button type="button" class="button" data-edit="customTests" data-id="${escapeHtml(t[0])}">Edit test</button><button type="button" class="button" data-delete="customTests" data-id="${escapeHtml(t[0])}">Delete test</button></div>`:''}
        ${a.replaySource?`<p class="help">Result recorded by the replay harness (${escapeHtml(a.replaySource)}). It counts only after a reviewer confirms in Evidence that the target was the offered build and path, links the tested crypto use, and signs below.</p>`:''}
        <p>${helpLabel('Test sources')}: ${String(t[4]||'').split(';').map(source=>{const known=sources.find(item=>item[0]===source.trim());return known?link(known[2],known[0]):link(source.trim(),source.trim());}).join(' · ')}</p>
        <div class="field-grid three">
          <div class="field">${label('requiredForProcurement','Required for procurement?')}${select('requiredForProcurement',['Yes','No','Undecided'])}</div>
          <div class="field">${label('procurementBasis','Procurement requirement or rationale')}${input('procurementBasis','placeholder="Policy, contract clause, or buyer decision"')}</div>
          <div class="field">${label('blocked','Blocked?')}${select('blocked',['Yes','No'])}</div>
          <div class="field">${label('dependencies','Has dependencies?')}${select('dependencies',['Yes','No','Unknown'])}</div>
          <div class="field">${label('productBuild','Product build')}${input('productBuild')}</div>
          <div class="field">${label('toolVersion','Tool and version')}${input('toolVersion')}</div>
          <div class="field">${label('cryptoUseId','Tested crypto use')}<select id="${id('cryptoUseId')}" data-test="${t[0]}" data-field="cryptoUseId"><option value="">Choose a mapped use</option>${state.crypto.map(use=>`<option value="${escapeHtml(use.id)}"${a.cryptoUseId===use.id?' selected':''}>${escapeHtml(use.id)} · ${escapeHtml(short(use.path||use.function,48))}</option>`).join('')}</select></div>
          <div class="field">${label('controlIds','Related control IDs')}${input('controlIds','placeholder="C05, C07"')}</div>
          <div class="field">${label('result','Result')}<select id="${id('result')}" data-test="${t[0]}" data-field="result"><option value="">Not run</option>${RESULT_OPTIONS.map(([value,text])=>`<option value="${value}"${a.result===value?' selected':''}>${text}</option>`).join('')}</select></div>
          <div class="field full">${label('observed','What was observed?')}${area('observed')}</div>
          <div class="field">${label('negative','Negative control')}${area('negative')}</div>
          <div class="field">${label('limits','Limits and untested areas')}${area('limits')}</div>
          <div class="field">${label('reviewerDate','Reviewer and date')}${input('reviewerDate')}</div>
        </div><details class="test-plan" ${['Yes'].includes(a.requiredForProcurement)||a.blocked==='Yes'||a.dependencies==='Yes'?'open':''}><summary>Team, blockers, and pass rule</summary><div class="field-grid three">
          <div class="field">${label('ownerTeam','Lead team or tester')}${input('ownerTeam')}</div>
          <div class="field">${label('partnerTeams','Other teams needed')}${input('partnerTeams')}</div>
          <div class="field">${label('approvalOwner','Decision owner')}${input('approvalOwner')}</div>
          <div class="field">${label('plannedDate','Planned date')}${input('plannedDate','type="date"')}</div>
          <div class="field">${label('environment','Test setting')}${input('environment','placeholder="Lab, staging, or approved production window"')}</div>
          <div class="field">${label('blockerDetail','Blocking issue and owner')}${input('blockerDetail')}</div>
          <div class="field">${label('blockerDecision','Blocked-test decision')}${select('blockerDecision',['Pending','Reschedule','Use alternate proof','Accept risk','Waive with approval'])}</div>
          <div class="field full">${label('dependencyDetail','Dependencies and prerequisite IDs')}${area('dependencyDetail')}</div>
          <div class="field full">${label('testMethod','Test method')}${area('testMethod')}</div>
          <div class="field full">${label('acceptanceRule','Acceptance rule')}${area('acceptanceRule')}</div>
        </div></details><div class="record-meta">Linked proof: ${escapeHtml(evidenceFor(t[0]).map(item=>`${item.id} (${item.producer||'Unknown'})`).join(', ') || 'none yet')}</div></article>`;
    }).join('')}</div></div>`;
}

function renderProcess() {
  const s=buildScorecard(state,survey,controls,allTests());
  const steps=[
    ['overview','Define the exact purchase','Name the product, version, deployment setup, buyer setting, and review owner.',s.missingScope.length?'Scope still needs detail':'Scope fields recorded'],
    ['survey','Ask the supplier','Record the vendor response to each question and request specific proof.',`${s.answered} of ${s.totalQuestions} answered`],
    ['crypto','Map cryptographic uses','List each connection, signature, or stored-data use and the blind spots.',s.totalUses?`${s.mappedUses} of ${s.totalUses} uses fully described`:'No uses entered'],
    ['crypto','Reconcile SBOM and CBOM','Check each supplied inventory against the offered release; link component and crypto asset references to mapped uses.',`${s.totalBoms} BOM records; ${s.usesWithBomRef} of ${s.totalUses} uses name a BOM reference`],
    ['evidence','Check the proof','Link artifacts to IDs and check the exact product, path, issuer, date, and who produced each item.',s.totalProof?`${s.qualifiedProof} of ${s.totalProof} proof records meet the review fields`:'No proof entered'],
    ['tests','Record observations','Write the tested build, method, negative control, limits, and linked proof.',s.observedTests?`${s.supportedTests} of ${s.observedTests} observed tests backed by buyer or independent proof`:'No tests observed'],
    ['controls','Review expectations','Decide which controls apply and whether matching proof supports them.',s.acceptedControls?`${s.supportedControls} of ${s.acceptedControls} accepted controls have matching proof`:'No controls accepted'],
    ['maturity','Review maturity criteria','Load the PQC Maturity Model or your own criteria and record whether proof meets each one.',state.pqcmm.criteria.length?`${state.pqcmm.criteria.filter(item=>state.pqcmm.reviews[item.key]?.status==='Met').length} of ${state.pqcmm.criteria.length} criteria marked met`:'Optional; no criteria loaded'],
    ['actions','Resolve gaps','Give missing proof and failed tests an owner, date, and closure evidence.',`${s.openActions} open actions; ${s.unprovenClosure} closures lack proof`],
    ['licensing','Check the purchase rights','Record PQC feature entitlement, support term, and migration rights.',s.licenseTermsRecorded?(s.licenseProofQualified?'Terms and proof recorded':'Terms recorded; proof needed'):'Terms incomplete'],
    ['scorecard','Review the evidence scorecard','Inspect separate scope, proof, test, and open-risk indicators.','Review aid; no product grade'],
    ['attestations','Prepare claim drafts','Use only scoped, proof-linked claims for human review.','Suggestions; no signature or endorsement']
  ];
  return `${pageHead('02 / Process flow','Review the claim, then decide','Work through one offered release and setup. Collect supplier claims, check proof, record tests, and document the buyer decision. Each step shows what is recorded so far.')}
    <div class="process-list">${steps.map(([target,title,description,status],index)=>`<article class="process-step"><span class="process-number">${String(index+1).padStart(2,'0')}</span><div><h2>${helpLabel(title)}</h2><p>${glossaryHtml(description)}</p><strong>${escapeHtml(status)}</strong></div><button type="button" data-route="${target}">Open section</button></article>`).join('')}</div>
    <section class="section"><div class="section-head"><h2>Close the loop</h2></div><div class="section-body"><p class="note-line">Return to Buyer record after reviewing the scorecard and claim drafts. Write the actual buyer decision, what was verified, what remains unknown, and the next review trigger.</p><button type="button" class="primary-button" data-route="overview">Open buyer record</button></div></section>`;
}

function renderLicensing() {
  const l=state.licensing || {};
  return `${pageHead('10 / Licensing','License and support terms','Record whether the promised PQC feature can be bought, enabled, maintained, tested, and updated in the offered edition.')}
    <section class="section"><div class="section-head"><div><h2>Supplier terms</h2><p>Link statements to a contract, order form, or support document in Evidence.</p></div></div><div class="section-body field-grid">
      ${field('License model','licenseModel',l.licenseModel,'text','',[],'license')}
      ${field('PQC feature entitlement','pqcEntitlement',l.pqcEntitlement,'text','State whether it is included, paid, preview, or planned.',[],'license')}
      ${field('Support and update term','supportTerm',l.supportTerm,'text','Record a date or support period for this product version.',[],'license')}
      ${field('Migration and rollback rights','migrationRights',l.migrationRights,'textarea','Include testing, staged deployment, rollback, and algorithm update rights.',[],'license')}
      ${field('Third-party crypto terms','thirdPartyTerms',l.thirdPartyTerms,'textarea','Include known upstream component licenses and support dependencies.',[],'license')}
      ${field('License proof ID','proofId',l.proofId,'text','Use an EV ID from the Evidence section.',[],'license')}
      ${field('License review note','reviewNote',l.reviewNote,'textarea','Record terms that still need legal or procurement review.',[],'license')}
    </div></section>
    <section class="section"><div class="section-head"><div><h2>${helpLabel('License register')}</h2><p>Record each product, component, content, or distribution license separately.</p></div><button type="button" class="primary-button" data-add="licenses">Add license</button></div><div class="section-body record-list">${state.licenses.length?state.licenses.map(item=>`<article class="record"><div class="record-top"><div><h3>${escapeHtml(item.id)} · ${escapeHtml(item.name||'Unnamed license')}</h3><p>${escapeHtml(item.appliesTo||'Scope needed')} · ${escapeHtml(item.licenseId||'Identifier needed')}</p></div><div class="record-actions"><button type="button" data-edit="licenses" data-id="${escapeHtml(item.id)}">Edit</button><button type="button" class="delete" data-delete="licenses" data-id="${escapeHtml(item.id)}">Delete</button></div></div><p>${escapeHtml(item.conditions||'Conditions not recorded')}</p>${item.sourceUrl?`<p>Original license: ${link(item.sourceUrl,safeUrl(item.sourceUrl)?'open the publisher text':item.sourceUrl)}</p>`:''}${inboundLine(item.id)}</article>`).join(''):'<p class="note-line">No license records entered yet.</p>'}</div></section>
    <section class="section"><div class="section-head"><h2>Publishing this workbook</h2></div><div class="section-body"><p class="note-line">This workbook is licensed under the Apache License 2.0 with the Commons Clause. Anyone, including a company or a government agency, may use, change, and share it free of charge, for example to review the products it buys. Nobody may sell it, host it for a fee, or sell a product or service, including consulting or support, whose value comes entirely or substantially from it.</p><p class="note-line">${link('https://github.com/AbacusNin/PQC-Starch/blob/main/LICENSE','Read the license')} · ${link('https://github.com/AbacusNin/PQC-Starch/blob/main/NOTICE','Third-party notices')} · ${link('https://github.com/AbacusNin/PQC-Starch','Source code')}</p><p class="note-line">Bundled third-party files keep their own licenses, listed in the notices. Linked standards, guides, and supplier documents keep theirs too. This page records buyer questions about the product being bought; it does not interpret contract law.</p>
      <details class="license-disclosure"><summary>OWASP CycloneDX guide text</summary><p>The CBOM and SBOM guides are © 2025 OWASP Foundation; the attestation guide is © 2024 OWASP Foundation. Each guide states CC BY 4.0. If guide text or figures are reused, credit the author, link the license, and identify changes. The CBOM guide also notes IBM-contributed portions under Apache 2.0. <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 terms</a>.</p></details>
      <details class="license-disclosure"><summary>CycloneDX specification and schema</summary><p>The CycloneDX specification repository identifies its schemas as Apache 2.0. This project bundles the official CycloneDX 1.7.2 JSON Schemas, with the SPDX, JSF, and cryptography schemas they reference, to check imported BOMs in the browser. Their Apache 2.0 license text is in <code>schema/LICENSE.CycloneDX.txt</code>. Keep that license and the source attribution with any public copy. <a href="https://github.com/CycloneDX/specification/blob/master/README.md#copyright--license" target="_blank" rel="noopener noreferrer">Repository license statement</a>.</p></details>
      <details class="license-disclosure"><summary>Excel import library</summary><p>The local .xlsx reader uses JSZip 3.10.1, distributed under the MIT license option. Its license text is included with the browser files in <code>vendor/LICENSE.JSZip.md</code>. Excel files are parsed on this device.</p></details>
      <details class="license-disclosure"><summary>PQC Maturity Model criteria</summary><p>The bundled PQCMM 1.0.1 criteria are converted from the PKI Consortium release, Copyright (c) 2022 PKI Consortium, under the MIT license. Its license text is in <code>data/LICENSE.PQCMM.txt</code>. Loading the criteria does not certify a product or assign it a maturity level.</p></details>
      <details class="license-disclosure"><summary>IBM Plex fonts</summary><p>The page uses IBM Plex Sans and IBM Plex Mono, Copyright IBM Corp., under the SIL Open Font License 1.1. The license text is in <code>fonts/LICENSE-OFL.txt</code>.</p></details>
      <details class="license-disclosure"><summary>NIST and other linked material</summary><p>Links to NIST, NSA, CISA, FBI, IETF, consortium, and vendor sources remain with their publishers. Check each source's reuse terms before copying substantial text, figures, or code into a public release. Record any reused material as its own license entry above.</p></details>
    </div></section>`;
}

const producerLine = s => Object.entries(s.qualifiedByProducer).map(([producer,count])=>`${producer}: ${count}`).join(' · ') || 'none yet';
function renderScorecard() {
  const s=buildScorecard(state,survey,controls,allTests());
  const broken=brokenLinks().length;
  const indicators=[
    ['Scope',s.missingScope.length?'Incomplete':'Recorded',s.missingScope.length?`Missing: ${s.missingScope.join(', ')}`:'Exact product, version, setup, and buyer setting recorded.'],
    ['Discovery',`${s.mappedUses} / ${s.totalUses} mapped uses`,`${s.totalUses ? `${s.usesWithBomRef} uses name an SBOM or CBOM reference; ${s.totalBoms} BOM records entered. Full discovery coverage is not established by a manual map.` : 'Map at least one cryptographic use and its discovery limits.'}`],
    ['Claims and proof',`${s.supportedAnswers} of ${s.yesAnswers} yes answers supported`,`${s.answered} questions answered; ${s.qualifiedProof} of ${s.totalProof} proof records have matching scope and basic provenance. Qualified proof by producer: ${producerLine(s)}.`],
    ['Controls and tests',`${s.supportedControls} / ${s.applicableControls} applicable controls; ${s.supportedTests} / ${s.applicableTests} applicable tests supported`,`${s.acceptedControls-s.supportedControls} accepted controls lack qualifying linked proof; ${s.unresolvedRequiredTests} of ${s.requiredTests} buyer-required tests lack a complete supported result; ${s.blockedRequiredTests} are blocked. An observed test counts only when qualifying proof produced by the buyer or an independent party backs it.`],
    ['License and support',s.licenseTermsRecorded?(s.licenseProofQualified?'Terms with matching proof':'Terms need matching proof'):'Terms incomplete','Check feature entitlement, support term, migration rights, and a linked contract or support artifact.'],
    ['Open risk',`${s.openActions} open actions`,`${s.failedTests} failed tests; ${s.inconclusiveTests} inconclusive tests; ${s.mismatchedProof} accepted proof records that do not qualify; ${s.counterProof} rejected or wrong-scope records kept as counter-evidence; ${s.acceptedRisks} accepted risks${s.incompleteRisks?`, ${s.incompleteRisks} without an approver or expiry`:''}; ${s.unprovenClosure} closures without qualifying proof; ${broken} links to check.`]
  ];
  const bars=[['Buyer scope',4-s.missingScope.length,4],['Mapped uses',s.mappedUses,s.totalUses],['Vendor answers',s.answered,s.totalQuestions]];
  const unmapped=s.totalUses-s.mappedUses;
  const remedies=[
    ['overview',s.missingScope.length?`Enter ${s.missingScope.join(', ')} for the exact offered product.`:'Recheck the scope after a version or configuration change.'],
    ['crypto',!s.totalUses?'Add each connection, signature, and stored-data use; name discovery limits.':unmapped?`Complete ${unmapped} use(s); link each to an exact SBOM or CBOM asset where available and review inventory coverage.`:'Link each use to an exact SBOM or CBOM asset where available, then review inventory coverage.'],
    ['evidence',s.mismatchedProof?`Recheck ${s.mismatchedProof} accepted proof item(s) for product, path, issuer, and date.`:s.counterProof?'Keep rejected and wrong-scope proof linked; it explains why a claim stays open.':'Link each accepted vendor answer to matching proof, and record who produced it.'],
    ['tests',s.unresolvedRequiredTests?`Resolve ${s.unresolvedRequiredTests} buyer-required test(s). Name the lead team, blocker, prerequisites, and decision owner.`:s.acceptedControls-s.supportedControls?`Link qualifying proof to ${s.acceptedControls-s.supportedControls} accepted control(s).`:'Review each control and its linked answers before accepting it.'],
    ['licensing',s.licenseTermsRecorded?`Add proof to each applicable license record; ${s.licensesWithProof} of ${s.licenseRecords} have matching proof.`:'Record feature entitlement, support, migration rights, and each applicable license.'],
    ['actions',s.incompleteRisks?`Name the approver, scope, and expiry for ${s.incompleteRisks} accepted risk(s).`:s.failedTests||s.unprovenClosure?`Open actions for ${s.failedTests} failed test(s), and attach closure proof to ${s.unprovenClosure} closed action(s).`:'Assign owners and dates to open gaps; record why accepted risks are acceptable.']
  ];
  return `${pageHead('11 / Scorecard','Buyer evidence scorecard','These indicators show how complete and traceable this assessment is. They do not grade a product, certify PQC, or assign a PQCMM level.','<button type="button" class="quiet-button" data-compare>Compare with an earlier export</button><button type="button" class="quiet-button" data-open-grc>Export for a GRC tool</button>')}
    <section class="section"><div class="section-head"><h2>${helpLabel('Record completeness')}</h2></div><div class="section-body"><div class="score-bars">${bars.map(([label,count,total])=>`<div class="score-bar"><span>${helpLabel(label)}</span><progress class="bar-track" aria-label="${escapeHtml(label)}" value="${count}" max="${total||1}"></progress><b>${count}/${total}</b></div>`).join('')}</div><p class="help">These bars count filled-in records only. Proof and support appear below as counts with their source, because a bar would read like a grade.</p><p class="note-line"><strong>${helpLabel('Qualified proof by producer')}:</strong> ${escapeHtml(producerLine(s))}</p></div></section>
    <div class="score-grid">${indicators.map(([title,result,detail],index)=>`<article class="score-item"><h2>${helpLabel(title)}</h2><strong>${escapeHtml(result)}</strong><p>${escapeHtml(detail)}</p><div class="score-remedy"><b>${helpLabel('How to close this gap')}</b><p>${escapeHtml(remedies[index][1])}</p><button type="button" class="quiet-button" data-route="${remedies[index][0]}">Open ${escapeHtml(({overview:'Buyer record',crypto:'Crypto map',evidence:'Evidence',tests:'Tests',controls:'Control proof',licensing:'Licensing',actions:'Actions'})[remedies[index][0]])}</button></div></article>`).join('')}</div>
    <section class="section"><div class="section-head"><h2>How counts are earned</h2></div><div class="section-body"><ol class="rule-list"><li><details><summary>A supported yes answer needs buyer acceptance and linked proof.</summary><div class="rule-detail"><p>A supplier's yes counts only after the buyer marks the answer Accepted and links proof that meets rule 2. The count is shown against the number of yes answers, not all 38 questions.</p></div></details></li><li><details><summary>Qualifying proof must meet four conditions.</summary><div class="rule-detail"><ol type="a"><li>It is marked Accepted by the buyer.</li><li>It matches the exact product, version, and path being bought.</li><li>It names its artifact, issuer, and date.</li><li>It has a file or a source location.</li></ol><p>Proof that is accepted but misses a condition is counted as needing rework. Rejected or wrong-scope proof is counted as counter-evidence.</p></div></details></li><li><details><summary>An observed test needs more than a result.</summary><div class="rule-detail"><ol type="a"><li>The tested crypto use, product build, and tool version.</li><li>The observation, the negative control, and the limits of what was tested.</li><li>A named reviewer.</li><li>Linked qualifying proof produced by the buyer or an independent party. A supplier's own log restates the claim, so it does not count.</li></ol></div></details></li><li><details><summary>Controls or tests marked not applicable leave the totals.</summary><div class="rule-detail"><p>A control or test marked not applicable is removed from both the count and the total, so it neither helps nor hurts. Record the reason, so a later reviewer can check it.</p></div></details></li><li><details><summary>A roadmap, unsupported acceptance, or unproven closure earns no credit.</summary><div class="rule-detail"><ol type="a"><li>A roadmap or planned date is not a delivered feature.</li><li>Accepting an answer without linked qualifying proof does not make it supported.</li><li>An action marked closed counts as closed only when its closure proof is a qualifying proof record.</li></ol></div></details></li><li><details><summary>Unknown coverage stays unknown until discovery scope is independently established.</summary><div class="rule-detail"><p>The crypto map shows only what reviewers recorded. Paths, regions, and components nobody checked count as unknown, not as covered, until an independent inventory or test establishes the scope.</p></div></details></li><li><details><summary>The buyer makes the final decision in Buyer record.</summary><div class="rule-detail"><p>The scorecard measures how complete and traceable the review is. It does not approve or reject a product. The buyer records that decision, and any conditions, in Buyer record.</p></div></details></li></ol></div></section>`;
}

function renderAttestations() {
  const drafts=buildClaimDrafts(state);
  return `${pageHead('12 / Claim drafts','Draft claim statements (unsigned)','These drafts are suggestions based on your entries. They are not an endorsement, certification, verified attestation, or digital signature.',drafts.length?'<button type="button" class="primary-button" data-export-claims>Export claim drafts</button>':'')}
    <section class="section"><div class="section-head"><h2>How to use these drafts</h2></div><div class="section-body"><ol class="flow-list"><li><b>1</b><span>Complete the exact product, version, and deployment setup in Buyer record.</span></li><li><b>2</b><span>Add one crypto-use record per path. Link proof to its CU ID and check product and path match.</span></li><li><b>3</b><span>Record tests, including negative controls and limits, and review any counter-evidence or open action.</span></li><li><b>4</b><span>Have a named reviewer check the draft against the original proof before any formal attestation or signature.</span></li></ol><p class="note-line">Export uses CycloneDX 1.7 <code>declarations.targets</code>, <code>claims</code>, and <code>evidence</code> fields, and marks itself inside as an unsigned draft. It omits formal attestations, conformance scores, affirmations, and signatures because this workbook does not establish them, and it leaves out drafts that lack the scope detail a claim needs. Check the export against the <a href="https://cyclonedx.org/schema/bom-1.7.schema.json" target="_blank" rel="noopener noreferrer">official CycloneDX 1.7 schema</a> and the <a href="https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-Attestations-en.pdf" target="_blank" rel="noopener noreferrer">OWASP attestation guide</a> (CC BY 4.0) before external use.</p></div></section>
    <div class="warning">A draft export may reveal deployment paths and proof metadata. The export dialog can leave out proof locations; review the rest before sharing. Attached evidence files are not included.</div>
    <div class="record-list">${drafts.length?drafts.map(draft=>`<article class="record claim-draft"><div class="record-top"><h2>${escapeHtml(draft.id)}</h2>${statusPill(draft.status)}</div><p class="claim-statement">${escapeHtml(draft.statement || 'Insufficient information for a specific claim.')}</p>${draft.missing.length?`<p><strong>Still needed:</strong> ${escapeHtml(draft.missing.join(', '))}</p>`:''}<p><strong>Supporting proof:</strong> ${escapeHtml(draft.supportingEvidence.map(item=>item.id).join(', ')||'none')}</p><p><strong>Counter-evidence:</strong> ${escapeHtml(draft.counterEvidence.map(item=>item.id).join(', ')||'none recorded')}</p><p><strong>Proof pending review:</strong> ${escapeHtml(draft.pendingEvidence.join(', ')||'none')}</p><p><strong>Reviewer-recorded tests:</strong> ${escapeHtml(draft.tests.map(item=>`${item.id}: ${item.result}`).join(', ')||'none linked to this use')}</p><p><strong>Actions:</strong> ${escapeHtml(draft.actions.map(item=>`${item.id}: ${item.status}`).join(', ')||'none linked')}</p><p><strong>Discovery limits:</strong> ${escapeHtml(draft.limits)}</p></article>`).join(''):'<div class="empty">No claim draft yet. Start by adding a crypto use, then link proof to its CU ID.</div>'}</div>`;
}

const resourceGroups = ['All',...new Set(resources.map(item => item[0]))];
const sourceUrls = new Set(sources.map(item=>item[2]));
const allSourceIds = [...sources,...resources.filter(item=>!sourceUrls.has(item[4])).map((item,index)=>[`LIB-${String(index+1).padStart(3,'0')}`,item[1],item[4]])];
function resourceItems() {
  const query = resourceSearch.trim().toLowerCase();
  const matches = resources.filter(item => (resourceGroup === 'All' || item[0] === resourceGroup) && (!query || item.join(' ').toLowerCase().includes(query)));
  return `<p class="resource-count" role="status">${matches.length} of ${resources.length} resources</p><div class="resource-list">${matches.map(([group,title,kind,description,url]) =>
    `<article class="resource-card"><div class="resource-meta"><span>${escapeHtml(group)}</span><span>${escapeHtml(kind)}</span></div><h3>${link(url,title)}</h3><p>${escapeHtml(description)}</p></article>`
  ).join('') || '<p class="note-line">No resources match. Try a different word or group.</p>'}</div>`;
}
const levelLabel = item => item.level===null ? 'No level stated' : `Level ${item.level}${item.levelName?` ${item.levelName}`:''}`;
function renderMaturity() {
  const p=state.pqcmm, has=p.criteria.length;
  const actions=`<button type="button" class="quiet-button" data-import-criteria>Import criteria</button><button type="button" class="primary-button" data-load-pqcmm>${has?'Reload':'Load'} PKI Consortium PQCMM 1.0.1</button>`;
  const head=pageHead('08 / Maturity criteria','Maturity criteria review','Load the PKI Consortium PQC Maturity Model or import your own criteria, then record whether the supplier\'s proof shows each criterion is met.',actions);
  if(!has) return `${head}<div class="empty">No criteria loaded. Load the bundled PQCMM 1.0.1 release, or import JSON (a PQCMM model file or a criteria list), CSV, or Excel with columns ID, Level, Level name, Criterion, Tags, and Source.</div>`;
  const source=[[p.source.name,p.source.version].filter(Boolean).join(' '),p.source.publisher,p.source.license].filter(Boolean).join(' · ');
  const summary=levelSummary(p.criteria,p.reviews);
  const groups=summary.map(level=>{
    const items=p.criteria.filter(item=>item.level===level.level);
    return `<section class="section"><div class="section-head"><h2>${escapeHtml(levelLabel(items[0]))}</h2><span>${items.length} criteria</span></div><div class="section-body record-list">${items.map(criterionCard).join('')}</div></section>`;
  }).join('');
  return `${head}<p class="note-line">Source: ${escapeHtml(source||'Imported list')}${p.source.url?` · ${link(p.source.url,'Model page')}`:''} · Imported ${escapeHtml(dateLabel(p.source.importedAt))}</p>
    <div class="warning">This records your review of each criterion. It is not a PQCMM certification or an assessed maturity level. Levels are shown as the source states them. The PKI Consortium had not launched PQCMM certification as of October 2026.</div>
    <section class="section level-summary"><div class="section-head"><h2>Review results by stated level</h2></div><div class="section-body"><table class="source-table"><thead><tr><th>Level</th><th>Met</th><th>Partial</th><th>Not met</th><th>Not assessed</th></tr></thead><tbody>${summary.map(level=>`<tr><td>${escapeHtml(level.level===null?'No level stated':`Level ${level.level} ${level.name}`.trim())}</td><td>${level.met} of ${level.total} met</td><td>${level.partial}</td><td>${level.notMet}</td><td>${level.notAssessed}</td></tr>`).join('')}</tbody></table></div></section>${groups}`;
}

function criterionCard(item) {
  const review=state.pqcmm.reviews[item.key]||{}, id=`criterion-${item.key.replace(/[^A-Za-z0-9-]/g,'_')}`;
  const proof=evidenceFor(item.key);
  return `<article class="record criterion"><div class="record-top"><div><h3>${escapeHtml(item.key)} · ${escapeHtml(levelLabel(item))}</h3><p>${criterionHtml(item.text,escapeHtml)}</p>
    <div class="tag-list">${item.tags.map(tag=>`<span class="pill">${escapeHtml(tag)}</span>`).join('')}${item.source?` ${link(item.source,'Source')}`:''}</div></div>${statusPill(review.status,'Not assessed')}</div>
    <div class="field-grid"><div class="field"><label for="${id}-status">Review result</label><select id="${id}-status" data-criterion="${escapeHtml(item.key)}" data-field="status">${STATUSES.map(status=>`<option${(review.status||'Not assessed')===status?' selected':''}>${status}</option>`).join('')}</select></div>
    <div class="field"><label for="${id}-note">Review note</label><textarea id="${id}-note" rows="2" data-criterion="${escapeHtml(item.key)}" data-field="note">${fieldValue(review.note)}</textarea></div></div>
    <p class="help">${proof.length?`Proof linked: ${proof.map(entry=>`${escapeHtml(entry.id)}${qualifyingEvidence(entry)?' (meets the review fields)':''}`).join(', ')}.`:`No proof linked. Add ${escapeHtml(item.key)} to a proof record's linked IDs.`}</p></article>`;
}

async function loadBundledPqcmm() {
  try {
    const {default:data}=await import('./data/pqcmm-1.0.1.js');
    const imported=criteriaFromModel(data.model,{validate:createValidator(data.schema),provenance:data.provenance});
    if(!state.pqcmm.criteria.length) return applyCriteria(imported);
    previewCriteria(imported,'PKI Consortium PQCMM 1.0.1');
  } catch(error) { showToast(error.message,true); }
}

async function importCriteriaFile(file) {
  try {
    const read=await readCriteriaFile(file);
    let imported;
    if(read.model) {
      const {default:data}=await import('./data/pqcmm-1.0.1.js');
      imported=criteriaFromModel(read.model,{validate:createValidator(data.schema)});
    } else imported=criteriaFromRows(read.rows,file.name);
    previewCriteria(imported,file.name);
  } catch(error) { showToast(error.message,true); }
  finally { $('#criteria-file').value=''; }
}

function previewCriteria(imported,label) {
  pendingCriteria=imported;
  const kept=imported.criteria.filter(item=>state.pqcmm.reviews[item.key]).length;
  const levels=levelSummary(imported.criteria).map(level=>level.level===null?`${level.total} without a level`:`${level.total} at level ${level.level}`).join(', ');
  $('#transfer-title').textContent='Load maturity criteria';
  $('#transfer-body').innerHTML=`<p class="note-line">${imported.criteria.length} criteria found in ${escapeHtml(label)}: ${escapeHtml(levels)}.${state.pqcmm.criteria.length?` They replace the ${state.pqcmm.criteria.length} criteria loaded now. ${kept} existing review result(s) with the same IDs are kept.`:''}</p>
    <ul class="import-preview">${imported.criteria.slice(0,5).map(item=>`<li><b>${escapeHtml(item.key)}</b> ${escapeHtml(levelLabel(item))} · ${escapeHtml(short(item.text.replace(/\*\*/g,''),90))}</li>`).join('')}</ul>
    <p class="help">Levels, tags, and sources are kept as the file states them. The workbook does not assign a maturity level.</p>
    <div class="transfer-actions"><button type="button" class="primary-button" data-apply-criteria>Load these criteria</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
  if(!transferDialog.open) transferDialog.showModal();
}

function applyCriteria(imported=pendingCriteria) {
  if(!imported) return;
  const keys=new Set(imported.criteria.map(item=>item.key));
  state.pqcmm={source:imported.source,criteria:imported.criteria,reviews:Object.fromEntries(Object.entries(state.pqcmm.reviews).filter(([key])=>keys.has(key)))};
  pendingCriteria=null; persist();
  if(transferDialog.open) transferDialog.close();
  render(); showToast(`${imported.criteria.length} maturity criteria loaded.`);
}

function renderSources() {
  return `${pageHead('13 / Terms and resources','Terms and resource library','Hover, focus, or tap an underlined word for its short definition. The list below includes every link collected in this research run.')}
    <details id="resource-library" class="section flush resource-disclosure" ${resourceExpanded?'open':''}><summary class="section-head"><h2>Resource library</h2><span>${resources.length} links · select to ${resourceExpanded?'close':'open'}</span></summary><div class="section-body">
      <div class="resource-tools"><label for="resource-search">Search resources</label><input id="resource-search" type="search" value="${escapeHtml(resourceSearch)}" placeholder="Agency, topic, standard, or title"></div>
      <div class="resource-filters" aria-label="Resource groups">${resourceGroups.map(group => `<button type="button" data-resource-group="${escapeHtml(group)}" class="${resourceGroup===group?'active':''}" aria-pressed="${resourceGroup===group}">${escapeHtml(group)}</button>`).join('')}</div>
      <div id="resource-results">${resourceItems()}</div></div></details>
    <div class="source-grid"><details class="section flush resource-disclosure"><summary class="section-head"><h2>Terms</h2><span>${terms.length} definitions</span></summary><table class="source-table"><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody>${[...terms].sort((a,b)=>a[0].localeCompare(b[0])).map(([word,meaning])=>`<tr><td><dfn>${escapeHtml(word)}</dfn></td><td>${escapeHtml(meaning)}</td></tr>`).join('')}</tbody></table></details>
    <details class="section flush resource-disclosure"><summary class="section-head"><h2>Workbook source IDs</h2><span>${allSourceIds.length} source links</span></summary><table class="source-table"><thead><tr><th>ID</th><th>Source</th></tr></thead><tbody>${[...allSourceIds].sort((a,b)=>a[0].localeCompare(b[0])).map(([id,label,url])=>`<tr><td>${escapeHtml(id)}</td><td>${link(url,label)}</td></tr>`).join('')}</tbody></table></details></div>
    <section class="section"><div class="section-head"><h2>How to read this workbook</h2></div><div class="section-body"><p class="note-line">The questions and control summaries are plain-language syntheses. Use the linked source for exact requirements. PQCA component status helps identify what to investigate; it does not verify your deployed product. The crypto map is a manual intake, not a complete CycloneDX CBOM.</p></div></section>`;
}

function render() {
  hideTerm();
  const valid=['overview','process','survey','crypto','evidence','tests','controls','maturity','actions','licensing','scorecard','attestations','sources'];
  if (!valid.includes(route)) route='overview';
  document.querySelectorAll('[data-route]').forEach(button=>{
    button.classList.toggle('active',button.dataset.route===route);
    button.setAttribute('aria-current',button.dataset.route===route?'page':'false');
  });
  view.innerHTML = ({overview:renderOverview,process:renderProcess,survey:renderSurvey,crypto:()=>renderRecords('crypto'),evidence:()=>renderRecords('evidence'),tests:renderTests,controls:renderControls,actions:()=>renderRecords('actions'),licensing:renderLicensing,scorecard:renderScorecard,attestations:renderAttestations,sources:renderSources,maturity:renderMaturity})[route]();
  $('#resource-library')?.addEventListener('toggle', event => {
    resourceExpanded=event.target.open;
    event.target.querySelector('summary span').textContent=`${resources.length} links · select to ${resourceExpanded?'close':'open'}`;
  });
  updateHeader();
}

function go(next) {
  route=next;
  location.hash=next;
  render();
  view.focus();
  window.scrollTo({top:0,behavior:'instant'});
  $('#rail').classList.remove('open');
  $('#menu-button').setAttribute('aria-expanded','false');
}

const fieldDefs = {
  customTests:[['id','Test ID'],['title','Test title'],['expected','Expected proof','textarea'],['path','Path or test area'],['sources','Test sources','textarea']],
  crypto:[['id','Use ID'],['product','Product / system'],['protected','What is protected or verified?'],['path','Where is it used?'],['sourceNode','Source system'],['destinationNode','Destination system'],['trustBoundary','Trust boundary'],['function','Function','select',['Key establishment','Server authentication','Client authentication','Data encryption','Software signing','Firmware signing','Boot verification','Certificate issuance','Certificate validation','Backup / key wrap','Other']],['current','Current method'],['parameter','Parameter or key size'],['protocolVersion','Protocol and version'],['cipherSuite','Cipher suite'],['component','Component and version'],['componentPurl','Package URL (PURL)'],['sbomRef','SBOM component reference'],['cbomRef','CBOM asset reference'],['assetType','CBOM asset type','select',['algorithm','protocol','certificate','related-crypto-material']],['usageStatus','Use status','select',['Vendor claim','CBOM listed','Configured','Observed','Buyer accepted']],['keyLifecycle','Key or certificate lifecycle'],['owner','Owner'],['dataLife','Data life or exposure'],['target','PQC target or plan'],['coverage','Discovery coverage and blind spots','textarea']],
  evidence:[['id','Proof ID'],['type','Proof type','select',['Vendor statement','Product documentation','Release note','Assessment report','CBOM / inventory','Configuration','Test trace','Independent test','CAVP certificate','CMVP certificate','Contract / roadmap','Other']],['producer','Produced by','select',PRODUCERS],['artifact','What is the artifact?'],['issuer','Issuer or observer'],['date','Date','date'],['productMatch','Product/version match?','select',['Yes','No','Unsure']],['pathMatch','Path/setup match?','select',['Yes','No','Unsure']],['location','Location or URL'],['result','Buyer result','select',['Accepted','Clarify','Rejected','Not reviewed']],['sensitivity','Sensitivity','select',['Public','Customer confidential','NDA / secure portal','Redacted','Assessor only']],['linkedIds','Linked IDs, separated by commas'],['note','Review note','textarea']],
  boms:[['id','BOM record ID'],['kind','BOM kind','select',['SBOM','CBOM','Combined SBOM and CBOM']],['serial','BOM serial number'],['version','BOM version'],['target','BOM target product'],['release','BOM target release'],['supplier','BOM supplier'],['author','BOM author'],['created','BOM creation date','date'],['lifecycle','BOM lifecycle','select',['Design','Pre-build','Build','Post-build','Operations','Discovery','Other']],['tool','Generation tool and version'],['source','Source or evidence ID'],['validation','Schema validation result'],['signature','Signature verification result'],['composition','Declared completeness'],['services','External services and boundaries','textarea'],['dependencies','Dependency and provides review','textarea'],['distribution','Sharing or redaction limits','textarea'],['reviewer','BOM reviewer'],['notes','BOM review notes','textarea']],
  actions:[['id','Action ID'],['linked','Linked control, question, or test'],['gap','Gap or risk'],['task','What must happen?'],['owner','Owner'],['status','Status','select',['Open','In progress','Blocked','Closed','Accepted risk']],['targetDate','Target date','date'],['milestone','Milestone or dependency'],['closureProof','Closure proof ID'],['riskApprover','Risk approver'],['riskScope','Risk scope'],['riskExpiry','Risk expiry','date'],['note','Buyer note','textarea']],
  licenses:[['id','License record ID'],['name','License or agreement name'],['appliesTo','Product or component covered'],['licenseId','License identifier'],['sourceUrl','Original license URL'],['rights','Rights granted','textarea'],['conditions','Conditions or limits','textarea'],['proofId','License proof ID'],['reviewNote','License review note','textarea']]
};
const PREFIX={crypto:'CU',evidence:'EV',licenses:'LI',boms:'BM',customTests:'XT',actions:'AC'};

function recordList(type) { return type==='crypto'?state.crypto:type==='evidence'?state.evidence:type==='licenses'?state.licenses:type==='boms'?state.boms:type==='customTests'?state.customTests:state.actions; }
function openRecord(type,id='') {
  dialogType=type; editingId=id;
  const existing=recordList(type).find(item=>item.id===id) || {};
  const value={...existing,id:id||allocateId(state,PREFIX[type],recordList(type))};
  if (type==='crypto' && !id) value.product=state.buyer.product||'';
  $('#dialog-kind').textContent = id ? 'Edit record' : 'New record';
  $('#dialog-title').textContent = type==='crypto'?'Cryptographic use':type==='evidence'?'Evidence item':type==='licenses'?'License record':type==='boms'?'SBOM or CBOM record':type==='customTests'?'Product-specific test':'Action';
  $('#dialog-body').innerHTML = `<div class="field-grid">${fieldDefs[type].map(([key,label,kind,options])=>{
    const v=key==='linkedIds' ? (value.linkedIds||[]).join(', ') : (value[key]||'');
    const fieldId=`record-${key}`;
    const input=kind==='select' ? `<select id="${fieldId}" name="${key}"><option value="">Choose</option>${options.map(option=>`<option${v===option?' selected':''}>${escapeHtml(option)}</option>`).join('')}</select>` : kind==='textarea' ? `<textarea id="${fieldId}" name="${key}" rows="3">${fieldValue(v)}</textarea>` : `<input id="${fieldId}" name="${key}" type="${kind==='date'?'date':'text'}" value="${fieldValue(v)}" ${key==='id'?'required':''} ${key==='id'&&id?'readonly':''}>`;
    return `<div class="field ${kind==='textarea'?'full':''}"><label for="${fieldId}">${helpLabel(label)}</label>${input}</div>`;
  }).join('')}</div>${type==='evidence' ? `<div class="dialog-section"><h3>Local attachment</h3><p class="file-hint">PDF, text, CSV, JSON, image, Word, or Excel. 10 MB per file, 30 MB for the assessment. The file's contents must match its type. Never attach raw private keys. The file stays in this browser and is not uploaded by this app. If you choose "Export with attachments," its bytes are copied into the JSON download, which is unencrypted unless you set a passphrase. They can travel over a network if you later email, upload, sync, or share that download. Review sensitivity and use an approved protected channel before sharing.</p><div class="field"><label for="evidence-file">${helpLabel('Choose a file')}</label><input id="evidence-file" name="attachment" type="file" accept=".pdf,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.docx,.xlsx"></div>${value.attachmentName?`<p class="help">Current file: ${escapeHtml(value.attachmentName)} (${Math.round(value.attachmentSize/1024)} KB)</p>`:''}</div>` : ''}`;
  recordDialog.showModal();
}

async function saveRecord(event) {
  event.preventDefault();
  const data=new FormData(event.currentTarget);
  const target=recordList(dialogType);
  const existing=target.find(item=>item.id===editingId);
  const item={...(existing||{})};
  for(const [key] of fieldDefs[dialogType]) item[key]=String(data.get(key)||'').trim().slice(0,12000);
  // Ids are matched against upper-case links everywhere, so a lower-case id would be unlinkable.
  item.id=item.id.toUpperCase();
  if (containsSecret(fieldDefs[dialogType].map(([key])=>item[key]).join('\n'))) return showToast(SECRET_WARNING,true);
  if (dialogType==='customTests' && (!/^XT-\d{3}$/.test(item.id) || !item.title || !item.expected || !item.sources)) return showToast('Use an XT-### ID and provide a title, expected proof, and a source.',true);
  if (!/^[A-Z][A-Z0-9-]{1,59}$/.test(item.id)) return showToast('Use an ID with letters, numbers, and hyphens.',true);
  if (!editingId && target.some(entry=>entry.id===item.id)) return showToast('This ID is already used.',true);
  if (dialogType==='evidence') {
    item.linkedIds=item.linkedIds.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean).slice(0,100);
    if (!PRODUCERS.includes(item.producer)) item.producer=inferProducer(item.type);
    const file=data.get('attachment');
    if (file?.size) {
      const total=state.evidence.reduce((sum,entry)=>sum+(entry.id===item.id?0:Number(entry.attachmentSize)||0),0);
      let attachmentType;
      try { attachmentType=await putAttachment(item.id,file,total); }
      catch (error) { return showToast(error.message,true); }
      item.attachmentName=file.name.slice(0,180); item.attachmentType=attachmentType; item.attachmentSize=file.size;
    }
  }
  if (existing) Object.assign(existing,item); else target.push(item);
  syncCounters(state);
  if (dialogType==='customTests') selectedTest=item.id;
  persist(); recordDialog.close(); render();
  const known=knownIds(), unknown=dialogType==='evidence' ? item.linkedIds.filter(id=>!known.has(id)) : [];
  showToast(unknown.length ? `Record saved. These linked IDs match no record: ${unknown.join(', ')}.` : 'Record saved locally.', Boolean(unknown.length));
}

function referencesTo(id) {
  const refs=[];
  for (const item of state.evidence) if (item.id!==id && item.linkedIds?.includes(id)) refs.push(item.id);
  for (const [testId,test] of Object.entries(state.tests)) if (test.cryptoUseId===id) refs.push(testId);
  for (const action of state.actions) if (action.closureProof===id) refs.push(action.id);
  for (const license of state.licenses) if (license.proofId===id) refs.push(license.id);
  if (state.licensing?.proofId===id) refs.push('License terms');
  for (const bom of state.boms) if (bom.source===id) refs.push(bom.id);
  return [...new Set(refs)];
}
function removeReferences(id) {
  for (const item of state.evidence) if (item.linkedIds?.includes(id)) item.linkedIds=item.linkedIds.filter(linkId=>linkId!==id);
  for (const test of Object.values(state.tests)) if (test.cryptoUseId===id) test.cryptoUseId='';
  for (const action of state.actions) if (action.closureProof===id) action.closureProof='';
  for (const license of state.licenses) if (license.proofId===id) license.proofId='';
  if (state.licensing?.proofId===id) state.licensing.proofId='';
  for (const bom of state.boms) if (bom.source===id) bom.source='';
}

async function deleteRecord(type,id) {
  const refs=referencesTo(id);
  if (!confirm(`Delete ${id}?${refs.length?` These records link to it and will lose that link: ${refs.join(', ')}.`:''} This removes the record and any local attachment. Export a copy first if you need it.`)) return;
  const items=recordList(type);
  const index=items.findIndex(item=>item.id===id);
  if(index<0) return;
  if(type==='evidence') { try { await removeAttachment(id); } catch { showToast('The evidence record was removed, but local attachment cleanup failed.',true); } }
  items.splice(index,1);
  removeReferences(id);
  if(type==='customTests') { delete state.tests[id]; selectedTest='T01'; }
  persist(); render();
}

async function downloadAttachment(id) {
  const item=state.evidence.find(entry=>entry.id===id);
  try {
    const blob=await getAttachment(id);
    if(!blob) throw new Error('The local attachment is missing.');
    download(blob,item?.attachmentName||`${id}-attachment`);
  } catch(error) { showToast(error.message,true); }
}

function download(blob,name) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url; anchor.download=name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

function openTransfer() {
  const available=encryptionAvailable();
  $('#transfer-title').textContent='Export assessment';
  $('#transfer-body').innerHTML=`<p class="note-line">Export downloads a JSON copy. "With attachments" includes the full bytes of every local proof file in that download. This app does not send it to a server. A later email, cloud sync, upload, or shared drive can send it over a network and expose sensitive contents. Check the file and use an approved protected channel before sharing.</p>
    <fieldset class="encrypt-box"><legend>Protect the file</legend><label class="check" for="export-encrypt"><input type="checkbox" id="export-encrypt" ${available?'':'disabled'}> Encrypt with a passphrase</label>
    <div class="field-grid"><div class="field"><label for="export-passphrase">Passphrase, at least ${MIN_PASSPHRASE} characters</label><input type="password" id="export-passphrase" autocomplete="new-password" disabled></div><div class="field"><label for="export-passphrase-confirm">Repeat the passphrase</label><input type="password" id="export-passphrase-confirm" autocomplete="new-password" disabled></div></div>
    <p class="help">${available?'Uses AES-256-GCM with a key derived by PBKDF2-SHA-256 (600,000 iterations). Nobody can open the file without the passphrase, including you, so keep it somewhere safe.':'Encryption needs a secure page address. Open the workbook from localhost or an HTTPS address to use it.'}</p></fieldset>
    <div class="dialog-section"><h3>Full backup</h3><p class="help">Everything in this assessment, for your own records or another reviewer on your team.</p>
    <div class="transfer-actions"><button type="button" class="primary-button" data-export="all">Export with attachments</button><button type="button" class="quiet-button" data-export="answers">Export answers only</button></div></div>
    <fieldset class="encrypt-box"><legend>Share copy</legend><p class="help">For people outside the review team. Review outcomes stay; checked items are replaced with "${REMOVED}". A share copy does not count as a backup.</p>
    ${SHARE_CATEGORIES.map(category=>`<label class="check" for="share-${category}"><input type="checkbox" id="share-${category}" checked> Remove ${SHARE_LABELS[category]}</label>`).join('')}
    <div class="transfer-actions"><button type="button" class="quiet-button" data-export="share">Export share copy</button></div></fieldset>
    <p class="help">Importing a whole assessment offers to export the current one first. Section imports add records after a preview.</p>`;
  transferDialog.showModal();
}

async function previewRecordImport(file) {
  try {
    pendingRecordImport=await parseRecordImport(file,recordImportType);
    const names={crypto:'crypto uses',boms:'BOM review records',evidence:'proof records'};
    $('#transfer-title').textContent=`Import ${names[recordImportType]}`;
    $('#transfer-body').innerHTML=`<p class="note-line">${pendingRecordImport.rows.length} record(s) found in ${escapeHtml(file.name)}. These will be added to this assessment. Existing records stay in place, and duplicate IDs get new IDs.</p>
      <ul class="import-preview">${pendingRecordImport.rows.slice(0,5).map(item=>`<li><b>${escapeHtml(item.id||'New ID')}</b> ${escapeHtml(short(item.protected||item.current||item.target||item.artifact||item.type||'Untitled record',90))}</li>`).join('')}</ul>
      ${bomCheckHtml(pendingRecordImport.bomCheck)}
      <p class="help">${pendingRecordImport.bomCheck?'The checks above show the file is well formed and, if signed, unchanged since signing. They do not show the BOM is complete or that the product uses what it lists.':'Import does not verify a supplier claim, BOM schema, signature, or proof.'} Imported proof starts unreviewed. Local attachments in another assessment are not copied. Inspect source files for sensitive architecture before exporting or sharing.</p>
      <div class="transfer-actions"><button type="button" class="primary-button" data-apply-record-import>Add these records</button><button type="button" class="quiet-button" data-cancel-record-import>Cancel</button></div>`;
    transferDialog.showModal();
  } catch(error) { pendingRecordImport=null; showToast(error.message,true); }
  finally { $('#record-import-file').value=''; }
}

function bomCheckHtml(check) {
  if(!check) return '';
  const pill=(ok,label)=>`<span class="pill ${ok?'good':'bad'}">${label}</span>`;
  const signatureOk=check.signature.status==='valid';
  return `<ul class="import-preview bom-check"><li>${pill(check.schema.valid,check.schema.valid?'Schema passes':'Schema fails')} ${escapeHtml(check.schema.summary)}${check.schema.errors.length>1?`<ul>${check.schema.errors.slice(1).map(error=>`<li>${escapeHtml(`${error.path} ${error.message}`)}</li>`).join('')}</ul>`:''}</li>
    <li>${check.signature.status==='unsigned'||check.signature.status==='unsupported'?'<span class="pill warn">Signature not checked</span>':pill(signatureOk,signatureOk?'Signature valid':'Signature fails')} ${escapeHtml(check.signature.summary)}</li>
    <li>${escapeHtml(graphSummary(check.graph))}</li></ul>`;
}

function applyRecordImport() {
  if(!pendingRecordImport) return;
  const {kind,rows,fileName,bomCheck}=pendingRecordImport;
  const prepared=prepareImportedRows({kind,rows,fileName,bomCheck,existingIds:state[kind].map(item=>item.id),floor:state.counters?.[PREFIX[kind]]});
  const next=structuredClone(state);
  next[kind].push(...prepared);
  syncCounters(next);
  try { saveAssessment(next); }
  catch { return showToast('Browser storage could not save these records. Export a copy and free space before retrying.',true); }
  state=next; pendingRecordImport=null; transferDialog.close(); render(); showToast(`${prepared.length} record(s) imported for review.`);
}

async function runExport(kind) {
  try {
    const encrypt=$('#export-encrypt')?.checked;
    const passphrase=encrypt ? $('#export-passphrase').value : '';
    if (encrypt && passphrase.length<MIN_PASSPHRASE) return showToast(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`,true);
    if (encrypt && passphrase!==$('#export-passphrase-confirm').value) return showToast('The two passphrases do not match.',true);
    const share=kind==='share';
    const shareRemoved=share ? SHARE_CATEGORIES.filter(category=>$(`#share-${category}`)?.checked) : undefined;
    const {blob,missing}=await exportAssessment(state,kind!=='answers',{shareRemoved});
    const name=`${fileBase()}-${today()}${share?'-share-copy':''}`;
    if (encrypt) download(new Blob([JSON.stringify(await encryptExport(await blob.text(),passphrase))],{type:'application/json'}),`${name}-encrypted.json`);
    else download(blob,`${name}.json`);
    // A share copy leaves things out on purpose, so it cannot stand in for a backup.
    if (!share) {
      state.lastExportedAt=new Date().toISOString();
      saveAssessment(state,{touch:false});
      updateHeader();
    }
    transferDialog.close();
    showToast(missing.length ? `Exported. These attachments were missing from browser storage and are noted in the file: ${missing.join(', ')}.` : share ? 'Share copy exported. Check it before sending.' : 'Assessment exported.', Boolean(missing.length));
  } catch(error) { showToast(error.message,true); }
}

function openClaimExport() {
  const drafts=buildClaimDrafts(state), complete=drafts.filter(draft=>!draft.missing.length).length;
  $('#transfer-title').textContent='Export claim drafts';
  $('#transfer-body').innerHTML=`<p class="note-line">The file uses CycloneDX 1.7 declaration fields and is marked inside as an unsigned draft for human review. ${complete} of ${drafts.length} draft(s) have the scope detail a claim needs; the others are left out.</p>
    <label class="check" for="claims-omit-locations"><input type="checkbox" id="claims-omit-locations"> Leave out proof locations (URLs and file names)</label>
    <p class="help">Claim statements still name each path, and proof records still name their issuer. Review both before sharing.</p>
    <div class="transfer-actions"><button type="button" class="primary-button" data-confirm-claims>Export claim drafts</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
  transferDialog.showModal();
}

function exportCbomDraft() {
  try {
    const {cbom,skipped}=buildCbomDraft(state,`urn:uuid:${makeUuid()}`);
    if(!cbom.components.some(item=>item.type==='cryptographic-asset')) return showToast('Record a current method on at least one crypto use first.',true);
    download(new Blob([JSON.stringify(cbom,null,2)],{type:'application/json'}),`${fileBase()}-cbom-draft.json`);
    showToast(`CBOM draft exported and marked inside as unsigned and built from the manual map.${skipped.length?` It left out ${skipped.join(', ')}, which have no current method.`:''}`);
  } catch(error) { showToast(error.message,true); }
}

function openGrcExport() {
  $('#transfer-title').textContent='Export for a GRC tool';
  $('#transfer-body').innerHTML=`<p class="note-line">Builds a ZIP with the files, column headings, and values each platform documents for bulk import, plus a README that lists what to load where and which headings could not be verified. Tenants customize templates, so check each file against your own before loading it.</p>
    <fieldset class="encrypt-box"><legend>Platform</legend>${Object.entries(PLATFORMS).map(([value,label],index)=>`<label class="check" for="grc-${value}"><input type="radio" name="grc-platform" id="grc-${value}" value="${value}"${index===0?' checked':''}> ${escapeHtml(label)}</label>`).join('')}</fieldset>
    <label class="check" for="grc-include-files"><input type="checkbox" id="grc-include-files" checked> Include attached proof files</label>
    <p class="help">The package holds the full review, including names, notes, and proof locations. It is for loading into your own GRC tool, not for sharing outside your organization.</p>
    <div class="transfer-actions"><button type="button" class="primary-button" data-export-grc>Export package</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
  transferDialog.showModal();
}

async function exportGrcPackage() {
  const platform=$('input[name="grc-platform"]:checked')?.value;
  try {
    if(!window.JSZip) throw new Error('ZIP support is unavailable in this browser.');
    const attachments=[];
    if($('#grc-include-files')?.checked) for(const item of state.evidence.filter(entry=>entry.attachmentName)) {
      const blob=await getAttachment(item.id);
      if(blob) attachments.push({id:item.id,name:item.attachmentName,bytes:new Uint8Array(await blob.arrayBuffer())});
    }
    const zip=await buildGrcPackage(normalizeAssessment(state),platform,{JSZip:window.JSZip,attachments,type:'blob'});
    download(zip,`${fileBase()}-${platform}-grc-package.zip`);
    transferDialog.close();
    showToast(`${PLATFORMS[platform]} package exported. Read its README before loading.`);
  } catch(error) { showToast(error.message,true); }
}

function exportClaimDrafts(omitLocations) {
  try {
    const payload=buildCycloneDxDraft(state,`urn:uuid:${makeUuid()}`,{omitLocations});
    download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`${fileBase()}-cyclonedx-claim-drafts.json`);
    transferDialog.close();
    showToast('Claim drafts exported. Check sensitive details before sharing.');
  } catch(error) { showToast(error.message,true); }
}

async function runImport(file) {
  try {
    if (file.size<=MAX_IMPORT_BYTES) {
      let format='';
      try { format=JSON.parse(await file.text())?.format; } catch { format=''; } // parseImport reports the invalid JSON below.
      if (format===ENCRYPTED_FORMAT) { pendingImportFile=file; return openDecrypt(); }
    }
    previewImport(await parseImport(file));
  } catch(error) { showToast(error.message,true); }
  finally { $('#import-file').value=''; }
}

function openDecrypt() {
  $('#transfer-title').textContent='Open encrypted export';
  $('#transfer-body').innerHTML=`<p class="note-line">This export is encrypted. Enter the passphrase used when it was exported.</p><div class="field"><label for="import-passphrase">Passphrase</label><input type="password" id="import-passphrase" autocomplete="current-password"></div><div class="transfer-actions"><button type="button" class="primary-button" data-import-decrypt>Open file</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
  transferDialog.showModal();
}

async function decryptPendingImport() {
  const button=$('[data-import-decrypt]');
  const passphrase=$('#import-passphrase').value;
  button.disabled=true;
  try { const imported=await parseImport(pendingImportFile,raw=>decryptExport(raw,passphrase)); pendingImportFile=null; previewImport(imported); }
  catch(error) { showToast(error.message,true); }
  finally { if(button.isConnected) button.disabled=false; }
}

function previewImport(imported) {
  pendingImport=imported;
  const a=imported.assessment, {dropped,truncated}=imported.report;
  const answered=Object.values(a.survey).filter(item=>item.answer).length;
  $('#transfer-title').textContent='Replace this assessment?';
  $('#transfer-body').innerHTML=`<p class="note-line">Importing replaces ${escapeHtml(state.buyer.product||'the current assessment')} in this browser, including its local attachments.</p>
    ${imported.shareCopy?.length?`<p class="note-line">This is a share copy. The sender removed ${escapeHtml(listJoin(imported.shareCopy.map(category=>SHARE_LABELS[category])))}. Those fields read "${REMOVED}", and proof backed only by them cannot be rechecked from this file.</p>`:''}
    <ul class="import-preview"><li><b>Incoming</b> ${escapeHtml([a.buyer.product,a.buyer.version].filter(Boolean).join(' · ')||'Unnamed assessment')}</li><li>${answered} answered questions, ${a.crypto.length} crypto uses, ${a.evidence.length} proof records, ${imported.attachments.length} attachments</li>${dropped.length?`<li>Not imported, unrecognized fields: ${escapeHtml(dropped.slice(0,12).join(', '))}${dropped.length>12?` and ${dropped.length-12} more`:''}</li>`:''}${truncated.map(item=>`<li>Only the first ${item.kept} of ${item.received} ${escapeHtml(item.list)} records fit</li>`).join('')}</ul>
    <div class="transfer-actions"><button type="button" class="primary-button" data-import-choice="export">Export current, then replace</button><button type="button" class="quiet-button" data-import-choice="replace">Replace without export</button><button type="button" class="quiet-button" data-import-choice="cancel">Cancel</button></div>`;
  if (!transferDialog.open) transferDialog.showModal();
}

async function exportBackup(label) {
  const {blob}=await exportAssessment(state,true);
  download(blob,`${fileBase()}-${today()}-${label}.json`);
}

async function applyImport(choice) {
  if (choice==='cancel' || !pendingImport) { pendingImport=null; return transferDialog.close(); }
  try {
    if (choice==='export') await exportBackup('before-import');
    await replaceAssessment(pendingImport);
    state=normalizeAssessment(pendingImport.assessment);
    pendingImport=null; transferDialog.close();
    selectedQuestion='Q01'; route='overview'; location.hash='overview'; render();
    showToast('Assessment imported and saved locally.');
  } catch(error) { showToast(error.message,true); }
}

async function sha256Hex(value) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function previewReplay(file) {
  try {
    if (file.size>2*1024*1024) throw new Error('A replay packet must be 2 MB or less.');
    const text=await file.text();
    let packet;
    try { packet=JSON.parse(text); } catch { throw new Error('Choose a valid replay packet JSON file.'); }
    if (containsSecret(packet)) throw new Error('This file appears to contain secret key material. Remove it before importing.');
    // The digest shows the packet was not edited after the harness wrote it; it does not prove who ran it.
    const digestVerified=encryptionAvailable();
    if (digestVerified && await sha256Hex(packetDigestInput(packet))!==packet.digest) throw new Error('The packet digest does not match its contents, so it was changed after the harness wrote it.');
    const plan=planReplayImport(packet,state,{digestVerified});
    pendingReplay={packet,text,digestVerified};
    $('#transfer-title').textContent='Import replay packet';
    $('#transfer-body').innerHTML=`<p class="note-line">The replay harness probed <b>${escapeHtml(plan.target)}</b> over ${escapeHtml(plan.protocol)} on ${escapeHtml(String(packet.generatedAt||'').slice(0,10))} for build ${escapeHtml(packet.subject.build||'not stated')}. ${digestVerified?'Digest verified: the packet matches what the harness wrote.':'Digest not verified, because this page lacks a secure address.'}</p>
      <ul class="import-preview">${packet.scenarios.map(item=>`<li><b>${escapeHtml(item.outcome)}</b> ${escapeHtml(item.title)}: ${escapeHtml(item.detail)}</li>`).join('')}</ul>
      <p class="help">Tests to fill: ${escapeHtml(plan.updates.map(update=>`${update.testId} ${update.fields.result}`).join(', ')||'none')}.${plan.skipped.length?` Already recorded and left unchanged: ${escapeHtml(plan.skipped.join(', '))}.`:''} The packet becomes one unreviewed evidence record produced by the buyer. Before any result counts, confirm in Evidence that the target was the offered build and path, then link each test to its crypto use and sign it.</p>
      <div class="transfer-actions"><button type="button" class="primary-button" data-apply-replay>Import packet</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
    transferDialog.showModal();
  } catch(error) { pendingReplay=null; showToast(error.message,true); }
  finally { $('#replay-import-file').value=''; }
}

async function applyReplay() {
  if (!pendingReplay) return;
  const {packet,text,digestVerified}=pendingReplay;
  try {
    const evidenceId=allocateId(state,'EV',state.evidence);
    const plan=planReplayImport(packet,state,{digestVerified,evidenceId});
    const file=new File([text],'replay-packet.json',{type:'application/json'});
    const total=state.evidence.reduce((sum,entry)=>sum+(Number(entry.attachmentSize)||0),0);
    plan.evidence.attachmentType=await putAttachment(evidenceId,file,total);
    plan.evidence.attachmentName=file.name; plan.evidence.attachmentSize=file.size;
    state.evidence.push(plan.evidence);
    for (const {testId,fields} of plan.updates) state.tests[testId]={...(state.tests[testId]||{}),...fields};
    syncCounters(state);
    pendingReplay=null; persist(); transferDialog.close(); render();
    showToast(`Replay packet imported as ${evidenceId}. Confirm the target matches the offered build and path before relying on it.`);
  } catch(error) { showToast(error.message,true); }
}

async function showComparison(file) {
  try {
    const {assessment:earlier}=await parseImport(file);
    const changes=compareAssessments(earlier,normalizeAssessment(state));
    const counts=['added','removed','changed'].map(kind=>`${changes.filter(item=>item.change===kind).length} ${kind}`).join(', ');
    $('#transfer-title').textContent='Changes since the earlier export';
    $('#transfer-body').innerHTML=`<p class="note-line">Compared ${escapeHtml(file.name)} (${escapeHtml([earlier.buyer.product,earlier.buyer.version].filter(Boolean).join(' · ')||'unnamed')}) with this assessment: ${counts}. Review each changed claim, proof item, and test before carrying a conclusion forward.</p>
      ${changes.length?`<ul class="import-preview compare-list">${changes.slice(0,300).map(item=>`<li><b>${escapeHtml(item.area)} ${escapeHtml(item.id)}</b> ${escapeHtml(item.change)}${item.from!==undefined?`${item.field?` ${escapeHtml(item.field)}`:''}: ${escapeHtml(item.from)} → ${escapeHtml(item.to)}`:''}</li>`).join('')}</ul>${changes.length>300?`<p class="help">Showing the first 300 of ${changes.length} changes.</p>`:''}`:'<p class="compare-list">No differences in the compared fields.</p>'}
      <div class="transfer-actions"><button type="button" class="quiet-button" data-close-transfer>Close</button></div>`;
    transferDialog.showModal();
  } catch(error) { showToast(error.message,true); }
  finally { $('#compare-file').value=''; }
}

function openReset() {
  $('#transfer-title').textContent='Clear this assessment?';
  $('#transfer-body').innerHTML=`<p class="note-line">Clearing removes every answer and local attachment for this assessment in this browser. It cannot be undone.</p><div class="transfer-actions"><button type="button" class="primary-button" data-reset-choice="export">Export, then clear</button><button type="button" class="danger-button" data-reset-choice="clear">Clear without export</button><button type="button" class="quiet-button" data-close-transfer>Cancel</button></div>`;
  transferDialog.showModal();
}

async function clearAssessment(exportFirst) {
  try {
    if (exportFirst) await exportBackup('before-clear');
    await resetAssessment(); state=blankAssessment(); transferDialog.close(); go('overview'); showToast('Assessment cleared.');
  } catch(error) { showToast(error.message,true); }
}

function printRecord() {
  const b=state.buyer, s=buildScorecard(state,survey,controls,allTests()), drafts=buildClaimDrafts(state), licensing=state.licensing||{};
  const accepted=state.evidence.filter(item=>item.result==='Accepted').length;
  const pair=(label,value)=>`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value||'Not recorded')}</td></tr>`;
  const table=(headings,rows,empty)=>rows.length?`<table><tr>${headings.map(heading=>`<th>${escapeHtml(heading)}</th>`).join('')}</tr>${rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell||'')}</td>`).join('')}</tr>`).join('')}</table>`:`<p>${escapeHtml(empty)}</p>`;
  const answered=survey.map((item,index)=>[qid(index),item[1],answer(qid(index)).answer,answer(qid(index)).review||'Not reviewed']).filter(row=>row[2]);
  const recordedTests=allTests().filter(t=>testAnswer(t[0]).result||testAnswer(t[0]).requiredForProcurement).map(t=>{const a=testAnswer(t[0]);return [t[0],t[1],a.result||'Not run',a.requiredForProcurement||'',a.negative,a.limits];});
  $('#print-root').innerHTML=`<h1>PQC buyer verification record</h1><p class="print-muted">Printed ${escapeHtml(new Date().toLocaleString())}. This record is a buyer review aid, not a certification. Test results were recorded by reviewers; this app does not run tests.</p>
    <section><h2>Product and decision</h2><table>${pair('Organization',b.organization)}${pair('Product',b.product)}${pair('Version and edition',b.version)}${pair('Configuration',b.configuration)}${pair('Vendor',b.vendor)}${pair('Buyer setting',b.setting)}${pair('Policy or contract',b.policyRef)}${pair('Decision',b.decision)}${pair('Verified',b.verified)}${pair('Unknown',b.unknown)}${pair('Conditions',b.conditions)}${pair('Next review trigger',b.trigger)}</table></section>
    <section><h2>Work recorded</h2><p>${s.answered}/${survey.length} survey answers; ${state.crypto.length} crypto uses recorded (${s.mappedUses} fully described); ${accepted} accepted proof items (${s.qualifiedProof} qualify); ${s.acceptedControls}/${s.applicableControls} applicable controls accepted; ${s.observedTests} observed tests (${s.supportedTests} backed by buyer or independent proof); ${s.openActions} open or blocked work items.</p></section>
    <section><h2>Survey answers</h2>${table(['ID','Question','Vendor answer','Buyer review'],answered,'No survey answers recorded.')}</section>
    <section><h2>SBOM and CBOM register</h2>${table(['ID','Kind and target','Release','Coverage'],state.boms.map(item=>[item.id,[item.kind,item.target].filter(Boolean).join(' · '),item.release,item.composition||'Unknown']),'No SBOM or CBOM recorded.')}</section>
    <section><h2>Evidence register</h2>${table(['ID','Type','Produced by','Buyer result','Product match','Path match','Linked to'],state.evidence.map(item=>[item.id,item.type,item.producer||'Unknown',item.result||'Not reviewed',item.productMatch,item.pathMatch,(item.linkedIds||[]).join(', ')]),'No proof recorded.')}</section>
    <section><h2>Tests with recorded results or requirements</h2>${table(['ID','Test','Result','Required','Negative control','Limits'],recordedTests,'No test results recorded.')}</section>
    <section><h2>Controls requiring follow-up</h2>${table(['ID','Expectation','Buyer result','Action'],controls.filter(c=>controlAnswer(c[0]).result!=='Accepted'&&controlAnswer(c[0]).result!=='N/A').map(c=>[c[0],c[1],controlAnswer(c[0]).result||'Not reviewed',controlAnswer(c[0]).gapAction]),'No controls need follow-up.')}</section>
    <section><h2>Open actions</h2>${table(['ID','Status','Gap','Owner','Target'],state.actions.filter(a=>['Open','In progress','Blocked'].includes(a.status)).map(a=>[a.id,a.status,a.gap,a.owner,a.targetDate]),'None.')}</section>
    <section><h2>Accepted risks</h2>${table(['ID','Gap','Approver','Scope','Expiry'],state.actions.filter(a=>a.status==='Accepted risk').map(a=>[a.id,a.gap,a.riskApprover||'Not named',a.riskScope,a.riskExpiry||'Not set']),'None.')}</section>
    <section><h2>Evidence scorecard</h2><p>${s.supportedAnswers} of ${s.yesAnswers} yes answers supported; ${s.supportedControls}/${s.acceptedControls} accepted controls with qualifying proof; ${s.supportedTests}/${s.observedTests} observed tests backed by buyer or independent proof. Qualified proof by producer: ${escapeHtml(producerLine(s))}. ${s.mismatchedProof} accepted proof records do not qualify; ${s.counterProof} records are kept as counter-evidence; ${s.unprovenClosure} action closures lack qualifying proof. These figures describe the record, not product compliance.</p></section>
    <section><h2>License and support terms</h2><table>${pair('License model',licensing.licenseModel)}${pair('PQC entitlement',licensing.pqcEntitlement)}${pair('Support and updates',licensing.supportTerm)}${pair('Migration rights',licensing.migrationRights)}${pair('Third-party crypto terms',licensing.thirdPartyTerms)}${pair('License proof ID',licensing.proofId)}${pair('Open license questions',licensing.reviewNote)}</table><h3>Individual licenses</h3>${table(['ID','License','Applies to','Conditions','Proof'],state.licenses.map(item=>[item.id,item.name||item.licenseId,item.appliesTo,item.conditions,item.proofId]),'No license records.')}</section>
    <section><h2>Draft claim statements (unsigned)</h2><p class="print-muted">These are suggestions based on entered information, not an endorsement, verified attestation, certification, or digital signature.</p>${table(['Use','Draft statement','Supporting proof','Counter-evidence and limits'],drafts.map(draft=>[draft.id,draft.statement||'Insufficient information for a specific claim.',draft.supportingEvidence.map(proof=>proof.id).join(', ')||'None',`${draft.counterEvidence.map(proof=>proof.id).join(', ')||'None recorded'}; ${draft.limits}`]),'No draft claims yet.')}</section>
    <p class="print-muted">Attachments are not printed. Review the linked evidence and test limits in the saved assessment before relying on a conclusion.</p>`;
  window.print();
}

function currentValue(element) {
  if (element.dataset.buyer) return state.buyer[element.dataset.buyer]||'';
  if (element.dataset.license) return state.licensing?.[element.dataset.license]||'';
  if (element.dataset.survey) return answer(element.dataset.survey)[element.dataset.field]||'';
  if (element.dataset.control) return controlAnswer(element.dataset.control)[element.dataset.field]||'';
  if (element.dataset.test) return testAnswer(element.dataset.test)[element.dataset.field]||'';
  if (element.dataset.criterion) return state.pqcmm.reviews[element.dataset.criterion]?.[element.dataset.field]||'';
  return '';
}

document.addEventListener('click', async event => {
  const term = event.target.closest?.('.term');
  if (term) { showTerm(term); return; }
  hideTerm();
  const routeButton=event.target.closest('[data-route]');
  if(routeButton) return go(routeButton.dataset.route);
  const resourceButton=event.target.closest('[data-resource-group]');
  if(resourceButton){resourceGroup=resourceButton.dataset.resourceGroup; render(); $('#resource-search').focus(); return;}
  const questionButton=event.target.closest('[data-question]');
  if(questionButton){selectedQuestion=questionButton.dataset.question; render(); return;}
  const testButton=event.target.closest('[data-select-test]');
  if(testButton){selectedTest=testButton.dataset.selectTest; render(); return;}
  const controlButton=event.target.closest('[data-select-control]');
  if(controlButton){selectedControl=controlButton.dataset.selectControl; render(); return;}
  const relatedTestButton=event.target.closest('[data-open-test]');
  if(relatedTestButton){selectedTest=relatedTestButton.dataset.openTest; go('tests'); return;}
  const filterButton=event.target.closest('[data-survey-filter]');
  if(filterButton){surveyFilter=filterButton.dataset.surveyFilter; render(); return;}
  const recordImportButton=event.target.closest('[data-import-records]');
  if(recordImportButton){recordImportType=recordImportButton.dataset.importRecords;$('#record-import-file').click();return;}
  if(event.target.closest('[data-apply-record-import]')) return applyRecordImport();
  if(event.target.closest('[data-import-replay]')) return $('#replay-import-file').click();
  if(event.target.closest('[data-compare]')) return $('#compare-file').click();
  if(event.target.closest('[data-apply-replay]')) return applyReplay();
  if(event.target.closest('[data-cancel-record-import]')) {pendingRecordImport=null;transferDialog.close();return;}
  if(event.target.closest('[data-close-transfer]')) {pendingImportFile=null;transferDialog.close();return;}
  const importChoice=event.target.closest('[data-import-choice]');
  if(importChoice) return applyImport(importChoice.dataset.importChoice);
  if(event.target.closest('[data-import-decrypt]')) return decryptPendingImport();
  const resetChoice=event.target.closest('[data-reset-choice]');
  if(resetChoice) return clearAssessment(resetChoice.dataset.resetChoice==='export');
  const addButton=event.target.closest('[data-add]');
  if(addButton) return openRecord(addButton.dataset.add);
  const editButton=event.target.closest('[data-edit]');
  if(editButton) return openRecord(editButton.dataset.edit,editButton.dataset.id);
  const deleteButton=event.target.closest('[data-delete]');
  if(deleteButton) return deleteRecord(deleteButton.dataset.delete,deleteButton.dataset.id);
  const attachmentButton=event.target.closest('[data-download-attachment]');
  if(attachmentButton) return downloadAttachment(attachmentButton.dataset.downloadAttachment);
  const exportButton=event.target.closest('[data-export]');
  if(exportButton) return runExport(exportButton.dataset.export);
  if(event.target.closest('[data-export-claims]')) return openClaimExport();
  if(event.target.closest('[data-export-cbom]')) return exportCbomDraft();
  if(event.target.closest('[data-load-pqcmm]')) return loadBundledPqcmm();
  if(event.target.closest('[data-open-grc]')) return openGrcExport();
  if(event.target.closest('[data-export-grc]')) return exportGrcPackage();
  if(event.target.closest('[data-import-criteria]')) return $('#criteria-file').click();
  if(event.target.closest('[data-apply-criteria]')) return applyCriteria();
  if(event.target.closest('[data-confirm-claims]')) return exportClaimDrafts($('#claims-omit-locations')?.checked);
  if(event.target.closest('[data-action="reset"]')) return openReset();
  if(event.target.closest('[data-action="download-unreadable"]')) return download(new Blob([unreadableCopy()||''],{type:'application/json'}),'pqc-unreadable-saved-assessment.json');
  if(event.target.closest('[data-action="discard-unreadable"]')) {
    if(confirm('Discard the unreadable saved data? Download it first if anyone may need it.')) { localStorage.removeItem(UNREADABLE_KEY); render(); }
  }
});

document.addEventListener('input', event => {
  const element=event.target;
  if(element.id==='resource-search') {
    resourceSearch=element.value;
    $('#resource-results').innerHTML=resourceItems();
    return;
  }
  if(element.id==='survey-search') {
    surveySearch=element.value;
    $('.question-list').innerHTML=surveyItems();
    return;
  }
  if(!['buyer','license','survey','control','test','criterion'].some(scope=>element.dataset[scope])) return;
  if(containsSecret(element.value)) { element.value=currentValue(element); return showToast(SECRET_WARNING,true); }
  if(element.dataset.buyer){state.buyer[element.dataset.buyer]=element.value;persist();if(element.dataset.buyer==='decision')render();return;}
  if(element.dataset.license){state.licensing ||= {};state.licensing[element.dataset.license]=element.value;persist();return;}
  if(element.dataset.survey){
    const id=element.dataset.survey;
    state.survey[id] ||= {};
    state.survey[id][element.dataset.field]=element.value;
    if(element.dataset.field==='answer' || element.dataset.field==='detail') syncSurveyEvidence(id);
    persist();
    if(element.dataset.field==='answer'||element.dataset.field==='review') render();
    return;
  }
  // Only select changes re-render; re-rendering on each keystroke would replace the field being typed in.
  if(element.dataset.control){state.controls[element.dataset.control] ||= {};state.controls[element.dataset.control][element.dataset.field]=element.value;persist();if(['applies','result'].includes(element.dataset.field))render();return;}
  if(element.dataset.criterion){const key=element.dataset.criterion;state.pqcmm.reviews[key]={status:'Not assessed',note:'',...state.pqcmm.reviews[key],[element.dataset.field]:element.value};persist();if(element.dataset.field==='status')render();return;}
  if(element.dataset.test){state.tests[element.dataset.test] ||= {};state.tests[element.dataset.test][element.dataset.field]=element.value;persist();if(['result','requiredForProcurement','blocked','dependencies'].includes(element.dataset.field))render();}
});

document.addEventListener('change', event => {
  const element=event.target;
  if(element.id==='export-encrypt') {
    for (const id of ['#export-passphrase','#export-passphrase-confirm']) $(id).disabled=!element.checked;
    if(element.checked) $('#export-passphrase').focus();
    return;
  }
  if(element.dataset.linkEvidence){
    const item=state.evidence.find(entry=>entry.id===element.dataset.linkEvidence);
    if(!item) return;
    item.linkedIds ||= [];
    const claim=element.dataset.claim;
    item.linkedIds=element.checked ? [...new Set([...item.linkedIds,claim])] : item.linkedIds.filter(id=>id!==claim);
    persist();render();
  }
});

// Another tab saving the same assessment replaces this tab's copy, so the next save cannot undo its work.
window.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  try { state = event.newValue === null ? blankAssessment() : normalizeAssessment(JSON.parse(event.newValue)); }
  catch { return showToast('Another tab saved data this tab cannot read. Reload before editing.', true); }
  render();
  showToast('This assessment changed in another tab. The view now shows that version.');
});

$('#record-form').addEventListener('submit',saveRecord);
$('#dialog-close').addEventListener('click',()=>recordDialog.close());
$('#dialog-cancel').addEventListener('click',()=>recordDialog.close());
$('#transfer-close').addEventListener('click',()=>transferDialog.close());
$('#export-button').addEventListener('click',openTransfer);
$('#import-button').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',event=>{if(event.target.files[0]) runImport(event.target.files[0]);});
$('#record-import-file').addEventListener('change',event=>{if(event.target.files[0]) previewRecordImport(event.target.files[0]);});
$('#replay-import-file').addEventListener('change',event=>{if(event.target.files[0]) previewReplay(event.target.files[0]);});
$('#criteria-file').addEventListener('change',event=>{if(event.target.files[0]) importCriteriaFile(event.target.files[0]);});
$('#compare-file').addEventListener('change',event=>{if(event.target.files[0]) showComparison(event.target.files[0]);});
$('#print-button').addEventListener('click',printRecord);
$('#menu-button').addEventListener('click',()=>{const open=$('#rail').classList.toggle('open');$('#menu-button').setAttribute('aria-expanded',String(open));});
$('#rail-close').addEventListener('click',()=>{$('#rail').classList.remove('open');$('#menu-button').setAttribute('aria-expanded','false');$('#menu-button').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTerm();if($('#rail').classList.contains('open')){$('#rail').classList.remove('open');$('#menu-button').setAttribute('aria-expanded','false');}}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1)||'overview';if(next!==route){route=next;render();}});
render();
