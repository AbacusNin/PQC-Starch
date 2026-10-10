// GRC export packages. Each platform gets the files, column headings, enumerations, and date formats its own
// documentation describes for bulk import, as researched on October 10, 2026. Where a vendor documents
// nothing usable for a record type (for example, a buyer's test observations), the records travel in a
// review workbook attached to the vendor review. Every package says which headings were verified and which
// were not, because tenants customize templates and some templates sit behind a login.
import {survey as surveyContent, controls as controlContent, tests as testContent} from './content.js';
import {qualifyingEvidence} from './scorecard.js';
import {buildXlsx} from './xlsx-write.js';

export const PLATFORMS = {archer:'Archer', servicenow:'ServiceNow GRC', vanta:'Vanta', drata:'Drata', scrut:'Scrut'};

// ---- Formatting ----
const filled = value => Boolean(String(value ?? '').trim());
const oneLine = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const validIso = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const usDate = value => validIso(value) ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : '';
const spacedDate = value => validIso(value) ? `${value.slice(8, 10)} ${value.slice(5, 7)} ${value.slice(0, 4)}` : '';
const isoDate = value => validIso(value) ? value : '';
const limit = (value, size) => String(value ?? '').slice(0, size);

// Spreadsheet programs run a cell that starts with these characters as a formula. Supplier text reaches
// these files, so such a cell gets a leading apostrophe (OWASP CSV injection guidance).
const neutralize = value => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
export function csv(headers, rows, clean = value => value) {
  const cell = value => `"${neutralize(clean(String(value ?? ''))).replace(/"/g, '""')}"`;
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---- One view of the review, shared by every platform ----
function reviewKey(buyer) {
  return [buyer.product, buyer.version].filter(filled).join(' ').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'PQC-REVIEW';
}

function reviewData(state, today) {
  const buyer = state.buyer || {};
  const evidence = state.evidence || [];
  const proofFor = id => evidence.filter(item => (item.linkedIds || []).includes(id)).map(item => item.id).join(', ');
  const tests = [...testContent, ...(state.customTests || []).map(item => [item.id, item.title, item.expected, item.path, item.sources])];
  const actions = state.actions || [];
  return {
    key:reviewKey(buyer), today, buyer,
    vendor:buyer.vendor || 'Unnamed supplier',
    product:[buyer.product, buyer.version].filter(filled).join(' ') || 'Unnamed product',
    assessed:isoDate(buyer.assessmentDate) || today,
    controls:controlContent.map(([id, statement, sources, questions]) => {
      const answer = state.controls?.[id] || {};
      return {id, statement, sources, questions, applies:answer.applies || '', result:answer.result || '', owner:answer.ownerTeam || '', rationale:answer.rationale || '', action:answer.gapAction || '', proof:proofFor(id)};
    }),
    tests:tests.map(([id, title, expected, path]) => {
      const answer = state.tests?.[id] || {};
      return {id, title, expected, path, result:answer.result || 'Not run', build:answer.productBuild || '', tool:answer.toolVersion || '', observed:answer.observed || '',
        negative:answer.negative || '', limits:answer.limits || '', reviewer:answer.reviewerDate || '', required:answer.requiredForProcurement || '', proof:proofFor(id)};
    }),
    evidence:evidence.map(item => ({...item, qualifies:qualifyingEvidence(item) ? 'Yes' : 'No', linked:(item.linkedIds || []).join(', ')})),
    open:actions.filter(item => !['Done', 'Closed', 'Accepted risk'].includes(item.status)),
    done:actions.filter(item => ['Done', 'Closed'].includes(item.status)),
    accepted:actions.filter(item => item.status === 'Accepted risk'),
    actions,
    survey:surveyContent.map(([group, question, proof], index) => {
      const id = `Q${String(index + 1).padStart(2, '0')}`;
      const answer = state.survey?.[id] || {};
      return {id, number:`Q${index + 1}`, order:index + 1, group, question, proof, answer:answer.answer || '', detail:answer.detail || '', review:answer.review || '', followup:answer.followup || ''};
    }),
    criteria:(state.pqcmm?.criteria || []).map(item => ({...item, status:state.pqcmm.reviews?.[item.key]?.status || 'Not assessed', note:state.pqcmm.reviews?.[item.key]?.note || '', proof:proofFor(item.key)})),
    crypto:state.crypto || []
  };
}

// Findings are reviewed controls with a gap or open question, and tests that failed.
function findings(data) {
  return [
    ...data.controls.filter(item => ['Gap', 'Clarify'].includes(item.result)).map(item => ({id:item.id, title:`${item.id} ${item.result}: ${oneLine(item.statement)}`, detail:item.rationale, opened:data.assessed, related:[item.action, item.proof].filter(filled).join(', ')})),
    ...data.tests.filter(item => item.result === 'Failed').map(item => ({id:item.id, title:`${item.id} failed: ${oneLine(item.title)}`, detail:item.observed, opened:data.assessed, related:item.proof}))
  ];
}

// ---- The review workbook every package attaches ----
function reviewSheets(data) {
  return [
    {name:'Summary', headers:['Field', 'Value'], rows:[['Supplier', data.vendor], ['Product and version', data.product], ['Deployment', data.buyer.configuration || ''],
      ['Assessment date', data.assessed], ['Buyer decision', data.buyer.decision || ''], ['Conditions', data.buyer.conditions || ''], ['Note',
      'Exported from the PQC Buyer Workbook. Results are the buyer review of supplier claims and proof. They are not a certification.']]},
    {name:'Survey', headers:['Question', 'Topic', 'Question text', 'Supplier answer', 'Supplier detail', 'Buyer review', 'Follow-up'], rows:data.survey.map(item => [item.id, item.group, item.question, item.answer, item.detail, item.review, item.followup])},
    {name:'Controls', headers:['Control', 'Statement', 'Applies', 'Buyer result', 'Owner', 'Rationale', 'Action', 'Linked proof', 'Source IDs'], rows:data.controls.map(item => [item.id, item.statement, item.applies, item.result, item.owner, item.rationale, item.action, item.proof, item.sources])},
    {name:'Tests', headers:['Test', 'Title', 'Result (reviewer-recorded)', 'Required for purchase', 'Tested build', 'Tool version', 'Observation', 'Negative control', 'Limits', 'Reviewer and date', 'Linked proof'],
      rows:data.tests.map(item => [item.id, item.title, item.result, item.required, item.build, item.tool, item.observed, item.negative, item.limits, item.reviewer, item.proof])},
    {name:'Evidence', headers:['Evidence', 'Type', 'Artifact', 'Issuer', 'Produced by', 'Date', 'Location', 'Buyer review', 'Product match', 'Path match', 'Meets review fields', 'Linked to', 'File'],
      rows:data.evidence.map(item => [item.id, item.type, item.artifact, item.issuer, item.producer, item.date, item.location, item.result, item.productMatch, item.pathMatch, item.qualifies, item.linked, item.attachmentName || ''])},
    {name:'Actions', headers:['Action', 'Linked', 'Gap', 'Task', 'Owner', 'Status', 'Target date', 'Closure proof', 'Risk approver', 'Risk scope', 'Risk expiry'],
      rows:data.actions.map(item => [item.id, item.linked, item.gap, item.task, item.owner, item.status, item.targetDate, item.closureProof, item.riskApprover, item.riskScope, item.riskExpiry])},
    {name:'Maturity criteria', headers:['Criterion', 'Level', 'Level name', 'Criterion text', 'Tags', 'Source', 'Review result', 'Note', 'Linked proof'],
      rows:data.criteria.map(item => [item.key, item.level ?? '', item.levelName, item.text, item.tags.join('; '), item.source, item.status, item.note, item.proof])},
    {name:'Crypto map', headers:['Use', 'Protects', 'Path', 'Function', 'Current method', 'Usage status', 'Coverage'], rows:data.crypto.map(item => [item.id, item.protected, item.path, item.function, item.current, item.usageStatus, item.coverage])}
  ];
}

// ---- Platform packages: {files:{path:content}, readme} ----
const COMMON = data => ({'pqc-review.json':JSON.stringify(data.state, null, 2)});

function archer(data) {
  // The Data Import wizard splits multi-value cells on a values delimiter; "|" is the suggested one, so text loses it.
  const clean = value => oneLine(value.replace(/\|/g, ' '));
  const id = value => `${data.key}:${value}`;
  const planStatus = {Open:'Not Started', 'In progress':'In Progress', Done:'Closed', Closed:'Closed'};
  return {files:{
    '1-third-party-profile.csv':csv(['Third Party Name', 'Description'], [[data.vendor, `Supplier of ${data.product}`]], clean),
    '2-engagement.csv':csv(['Engagement ID', 'Engagement Name', 'Third Party Name', 'Product', 'Deployment', 'Review Date', 'Buyer Decision'],
      [[data.key, `PQC claim review: ${data.product}`, data.vendor, data.product, data.buyer.configuration || '', usDate(data.assessed), data.buyer.decision || '']], clean),
    '3-control-standards.csv':csv(['Standard ID', 'Standard Name', 'Statement', 'Workbook Result', 'Applies', 'Owner', 'Rationale', 'Linked Evidence'],
      data.controls.map(item => [id(item.id), `PQC buyer check ${item.id}`, item.statement, item.result, item.applies, item.owner, item.rationale, item.proof]), clean),
    '4-findings.csv':csv(['Finding ID', 'Finding Name', 'Description', 'Root Cause', 'Date Opened', 'Status', 'Related Records'],
      findings(data).map(item => [id(item.id), item.title, item.detail, 'Supplier proof does not yet support the claim', usDate(item.opened), 'Open', item.related]), clean),
    '5-remediation-plans.csv':csv(['Plan ID', 'Plan Name', 'Status', 'Workbook Status', 'Opened Date', 'Target Completion Date', 'Owner', 'Related Records'],
      [...data.open, ...data.done].map(item => [id(item.id), item.task || item.gap, planStatus[item.status] || '', item.status || 'Open', usDate(data.assessed), usDate(item.targetDate), item.owner, item.linked]), clean),
    '6-exception-requests.csv':csv(['Exception ID', 'Exception Name', 'Description', 'Approver', 'Scope', 'Expiration Date', 'References'],
      data.accepted.map(item => [id(item.id), item.gap, item.task, item.riskApprover, item.riskScope, usDate(item.riskExpiry), item.linked]), clean),
    '7-question-library.csv':csv(['Question Name', 'Question Text', 'Question Type', 'Category', 'Status'],
      data.survey.map(item => [`PQC-${item.id}`, item.question, 'Values List', item.group, 'Active']), clean),
    '8-questionnaire-answers.csv':csv(['Question Name', 'Answer', 'Supplier Detail', 'Buyer Review', 'Follow-up'],
      data.survey.map(item => [`PQC-${item.id}`, item.answer, item.detail, item.review, item.followup]), clean),
    '9-evidence-manifest.csv':csv(['Evidence ID', 'Title', 'Type', 'Issuer', 'Produced By', 'Date', 'Location', 'Buyer Review', 'Meets Review Fields', 'Linked To', 'File', 'SHA-256'],
      data.evidence.map(item => [id(item.id), item.artifact, item.type, item.issuer, item.producer, usDate(item.date), item.location, item.result, item.qualifies, item.linked, item.file, item.sha256]), clean),
    ...(data.criteria.length ? {'10-maturity-criteria.csv':csv(['Criterion ID', 'Level', 'Criterion', 'Tags', 'Source', 'Review Result', 'Note', 'Linked Evidence'],
      data.criteria.map(item => [id(item.key), item.level ?? '', item.text, item.tags.join('; '), item.source, item.status, item.note, item.proof]), clean)} : {})
  }, readme:archerReadme(data)};
}

async function servicenow(data, JSZip) {
  const id = value => `${data.key}:${value}`;
  const status = {Accepted:'Compliant', Gap:'Non-compliant', 'N/A':'Not applicable'};
  const effect = {Observed:'Effective', Failed:'Ineffective'};
  const issueState = {Open:'New', 'In progress':'Respond', Blocked:'Respond', Done:'Closed Complete', Closed:'Closed Complete'};
  const sheets = [
    {name:'control_objectives', headers:['External ID', 'Name', 'Description', 'Source IDs'], rows:data.controls.map(item => [id(item.id), `PQC buyer check ${item.id}`, item.statement, item.sources])},
    {name:'controls', headers:['External ID', 'Name', 'Control objective', 'Status', 'Workbook result', 'Owner', 'Rationale', 'Linked evidence'],
      rows:data.controls.filter(item => item.result || item.applies).map(item => [id(item.id), `${data.product}: ${item.id}`, id(item.id), status[item.result] || '', item.result, item.owner, item.rationale, item.proof])},
    {name:'control_tests', headers:['External ID', 'Name', 'Operating effectiveness', 'Workbook result', 'Test plan', 'Results', 'Tested build', 'Negative control', 'Limits', 'Reviewer and date', 'Linked evidence'],
      rows:data.tests.filter(item => item.result !== 'Not run').map(item => [id(item.id), item.title, effect[item.result] || 'None', item.result, item.expected, item.observed, item.build, item.negative, item.limits, item.reviewer, item.proof])},
    {name:'issues', headers:['External ID', 'Short description', 'Description', 'State', 'Workbook status', 'Due date', 'Recommendation', 'Linked items'],
      rows:[...data.open, ...data.done].map(item => [id(item.id), limit(item.gap || item.task, 160), item.gap, issueState[item.status] || 'New', item.status || 'Open', isoDate(item.targetDate), item.task, item.linked])},
    {name:'exceptions', headers:['External ID', 'Short description', 'Justification', 'Valid from', 'Valid to', 'Approver', 'Scope', 'Linked items'],
      rows:data.accepted.map(item => [id(item.id), limit(item.gap, 160), item.task, data.assessed, isoDate(item.riskExpiry), item.riskApprover, item.riskScope, item.linked])},
    {name:'vendor', headers:['Name', 'Vendor', 'Notes'], rows:[[data.vendor, 'true', `PQC claim review of ${data.product}`]]},
    {name:'questionnaire', headers:['Serial number', 'Category', 'Question', 'Order', 'Data type'], rows:data.survey.map(item => [item.order, item.group, item.question, item.order, 'Choice'])},
    {name:'questionnaire_responses', headers:['Serial number', 'Question', 'Supplier answer', 'Supplier detail', 'Buyer review'], rows:data.survey.map(item => [item.order, item.question, item.answer, item.detail, item.review])},
    {name:'links', headers:['From', 'To', 'Relationship'], rows:data.evidence.flatMap(item => (item.linkedIds || []).map(target => [id(item.id), id(target), 'evidence supports']))},
    {name:'attachments', headers:['Record key', 'Table', 'File name', 'Content type', 'SHA-256'], rows:data.evidence.filter(item => item.file).map(item => [id(item.id), 'sys_attachment', item.file, item.attachmentType, item.sha256])}
  ];
  const files = {'pqc-review-servicenow.xlsx':await buildXlsx(JSZip, sheets)};
  for (const sheet of sheets) files[`csv/${sheet.name}.csv`] = csv(sheet.headers, sheet.rows);
  files['evidence-manifest.csv'] = files['csv/attachments.csv'];
  return {files, readme:servicenowReadme(data)};
}

async function vanta(data, JSZip) {
  const finding = (content, riskStatus, notes) => ({content:limit(content, 2000), riskStatus, ...(riskStatus === 'REMEDIATE' ? {remediation:{state:'OPEN', requirementNotes:limit(notes, 2000)}} : {})});
  const findingList = [
    ...findings(data).map(item => finding(`${item.title}${item.detail ? `. ${oneLine(item.detail)}` : ''}`, 'REMEDIATE', item.related ? `Related: ${item.related}` : '')),
    ...data.open.map(item => finding(`${item.id}: ${oneLine(item.gap || item.task)}`, 'REMEDIATE', [item.task, item.owner && `Owner: ${item.owner}`, item.targetDate && `Due: ${item.targetDate}`].filter(Boolean).join('. '))),
    ...data.accepted.map(item => finding(`${item.id}: ${oneLine(item.gap)}. Accepted by ${item.riskApprover || 'nobody named'} for ${item.riskScope || 'unstated scope'} until ${item.riskExpiry || 'no stated date'}.`, 'ACCEPT'))
  ];
  const risks = data.accepted.map(item => ({description:limit(oneLine(item.gap), 500), detailedDescription:limit(`${item.task || ''} Approver: ${item.riskApprover || 'not named'}. Scope: ${item.riskScope || 'not stated'}. Expires: ${item.riskExpiry || 'not stated'}. Linked: ${item.linked || 'none'}.`.trim(), 10000),
    treatment:'Accept', identificationDate:`${data.assessed}T00:00:00.000Z`}));
  return {files:{
    'vendor.json':JSON.stringify({name:limit(data.vendor, 2000), status:'IN_PROCUREMENT', servicesProvided:limit(`${data.product}${data.buyer.configuration ? `, ${data.buyer.configuration}` : ''}`, 2000),
      additionalNotes:limit(`PQC claim review exported from the PQC Buyer Workbook on ${data.today}. Buyer decision: ${data.buyer.decision || 'not recorded'}.`, 2000)}, null, 2),
    'findings.json':JSON.stringify(findingList, null, 2),
    'risks.json':JSON.stringify(risks, null, 2),
    'risks.csv':csv(['Risk Scenario', 'Description', 'Treatment', 'Identification Date'], data.accepted.map(item => [oneLine(item.gap), `${item.task || ''} Approver: ${item.riskApprover || 'not named'}. Scope: ${item.riskScope || 'not stated'}. Expires: ${item.riskExpiry || 'not stated'}.`.trim(), 'Accept', data.assessed])),
    'controls.csv':csv(['Control ID', 'Control Name', 'Control Description', 'Domain', 'Owner', 'Framework Code', 'Effective Date'],
      data.controls.map(item => [`PQC-${item.id}`, `PQC buyer check ${item.id}`, item.statement, '', '', '', data.assessed])),
    'review-workbook.xlsx':await buildXlsx(JSZip, reviewSheets(data)),
    'evidence-manifest.csv':evidenceIndex(data)
  }, readme:vantaReadme(data)};
}

async function drata(data, JSZip) {
  // Drata's importer refuses < > and \ anywhere in a file.
  const clean = value => value.replace(/[<>\\]/g, ' ');
  const riskId = item => `PQC-${Number(String(item.id).match(/\d+/)?.[0] || 0)}`;
  const vendorHeaders = ['Name', 'Website URL', 'Privacy URL', 'Terms Of Use URL', 'Trust Center URL', 'Provided Services', 'Residual Risk', 'Inherent Risk', 'Type', 'Status', 'Additional Notes', 'Stored Data', 'Contact at vendor', 'Contact email'];
  const riskHeaders = ['Risk ID', 'Title', 'Description', 'Categories', 'Treatment option', 'Treatment plan', 'Completed Date', 'Reviewers', 'Inherent impact', 'Inherent likelihood',
    'Residual impact', 'Residual likelihood', 'Anticipated completion date', 'Risk identified date', 'Risk source', 'Vendor', 'Risk status', 'Internal notes', 'Supporting documents', 'Owners', 'Controls'];
  const riskRow = item => {
    const closed = ['Done', 'Closed'].includes(item.status);
    const accepted = item.status === 'Accepted risk';
    const notes = accepted ? `Accepted by ${item.riskApprover || 'nobody named'}; scope ${item.riskScope || 'not stated'}; expires ${item.riskExpiry || 'not stated'}.` : `Workbook status: ${item.status || 'Open'}. Linked: ${item.linked || 'none'}.`;
    return [riskId(item), limit(oneLine(item.gap || item.task), 191), limit(`${oneLine(item.gap)} Linked to ${item.linked || 'no record'} in the PQC review of ${data.product}.`, 768), 'People - Third Party',
      accepted ? 'Accept' : closed ? '' : 'Mitigate', item.task, closed ? isoDate(item.targetDate) : '', '', '', '', '', '', closed ? '' : isoDate(item.targetDate), data.assessed, '', data.vendor,
      closed ? 'closed' : 'active', limit(notes, 768), '', '', ''];
  };
  const due = data.open.filter(item => validIso(item.targetDate) && item.targetDate >= data.today);
  const skipped = data.open.filter(item => !due.includes(item)).map(item => item.id);
  const reviewStatus = data.buyer.decision ? 'COMPLETED' : 'IN_PROGRESS';
  return {files:{
    'vendor.csv':csv(vendorHeaders, [[data.vendor, '', '', '', '', `${data.product}${data.buyer.configuration ? `, ${data.buyer.configuration}` : ''}`, '', '', 'Vendor', 'Under Review',
      `PQC claim review exported ${data.today}. Buyer decision: ${data.buyer.decision || 'not recorded'}.`, '', '', '']], clean),
    'risks.csv':csv(riskHeaders, data.actions.map(riskRow), clean),
    'tasks.csv':csv(['Title', 'Description', 'Due Date', 'Task Type', 'Assignee Email', 'Control ID', 'Risk ID'],
      due.map(item => [limit(`${item.id}: ${oneLine(item.task || item.gap)}`, 191), `${oneLine(item.gap)} Owner in the workbook: ${item.owner || 'not named'}.`, item.targetDate, 'Risk', '', '', riskId(item)]), clean),
    'drata-api.json':JSON.stringify({vendor:{name:limit(data.vendor, 191), notes:`PQC claim review of ${data.product}`},
      securityReview:{title:limit(`PQC claim review: ${data.product}`, 191), securityReviewStatus:reviewStatus, securityReviewType:'SECURITY', reviewDeadlineAt:`${data.today}T00:00:00.000Z`,
        note:limit(`Buyer decision: ${data.buyer.decision || 'not recorded'}. Results are in review-results.xlsx.`, 1000)}}, null, 2),
    'review-results.xlsx':await buildXlsx(JSZip, reviewSheets(data)),
    'evidence-index.csv':evidenceIndex(data, clean)
  }, readme:drataReadme(data, skipped)};
}

async function scrut(data, JSZip) {
  const vendorHeaders = ['Vendor Name', 'Vendor URL (Optional)', "Vendor's Category", 'Service Description (Optional)', 'Entities (Optional)', 'Assigned To (Optional)', 'POC Name (Optional)',
    'POC Email (Optional)', 'Assessment Status', 'Assessment Justification (Optional)', 'Last Assessment Date (Optional)', 'Last Assessed By (Optional)', 'Recurrence (Optional)',
    'Next Assessment Date (Optional)', 'Risk Impact (Optional)'];
  const assessed = data.buyer.decision ? 'Assessed' : 'In Progress';
  return {files:{
    'vendor-import.xlsx':await buildXlsx(JSZip, [{name:'Vendors', headers:vendorHeaders, rows:[[limit(data.vendor, 100), '', 'Security', limit(`${data.product}${data.buyer.configuration ? `, ${data.buyer.configuration}` : ''}`, 10000),
      '', '', '', '', assessed, limit(`PQC claim review. Buyer decision: ${data.buyer.decision || 'not recorded'}.`, 500), spacedDate(data.assessed), '', '', '', '']]}]),
    'questionnaire-template.xlsx':await buildXlsx(JSZip, [{name:'Questions', headers:['Question number', 'Question', 'Condition for follow up question (If applicable)', 'Weightage (Optional)', 'Domain (Optional)', 'Attachment Mandatory'],
      rows:data.survey.map(item => [item.number, limit(item.question, 1000), '', '', '', 'No'])}]),
    'risks.csv':csv(['Risk Name', 'Description', 'Category', 'Treatment'], data.actions.filter(item => !['Done', 'Closed'].includes(item.status))
      .map(item => [oneLine(item.gap || item.task), `${item.task || ''} Linked: ${item.linked || 'none'}.${item.status === 'Accepted risk' ? ` Approver: ${item.riskApprover || 'not named'}; scope ${item.riskScope || 'not stated'}; expires ${item.riskExpiry || 'not stated'}.` : ''}`.trim(),
        'Vendor Management', item.status === 'Accepted risk' ? 'Accept' : 'Mitigate'])),
    'review-record.xlsx':await buildXlsx(JSZip, reviewSheets(data)),
    'evidence-index.csv':evidenceIndex(data)
  }, readme:scrutReadme(data)};
}

function evidenceIndex(data, clean) {
  return csv(['Evidence ID', 'Title', 'Type', 'Issuer', 'Produced by', 'Date', 'Location', 'Buyer review', 'Meets review fields', 'Linked to', 'File', 'SHA-256'],
    data.evidence.map(item => [item.id, item.artifact, item.type, item.issuer, item.producer, item.date, item.location, item.result, item.qualifies, item.linked, item.file, item.sha256]), clean);
}

// ---- README text ----
const CHECK = 'Check each file against the current template in your own tenant before loading it. Tenants rename, add, and require fields, and some templates are only visible after sign-in. Headings marked verified matched the vendor\'s public documentation on October 10, 2026.';
const readme = (title, data, body) => `# ${title} import package\n\nPQC claim review of ${data.product}, supplied by ${data.vendor}. Exported from the PQC Buyer Workbook on ${data.today}.\n\n${CHECK}\n\nThe review records the buyer's check of supplier claims and proof. It is not a certification, and a reviewer-recorded test result is not an independent test report.\n\n${body}\n\n## Always included\n\n- \`pqc-review.json\`: the complete review, for scripts or any field these files leave out.\n- \`evidence/\`: attached proof files, when you chose to include them. The manifest lists each file's SHA-256 so you can confirm nothing changed in transit.\n- Cells that begin with = + - @ start with an apostrophe in CSV files so a spreadsheet cannot run them as formulas.\n`;

function archerReadme(data) {
  return readme('Archer', data, `## Files and load order

Load in this order so cross-references find their targets: third-party profile, engagement, control standards, findings, remediation plans, exception requests, then the question library and answers.

| File | Archer target | Notes |
|---|---|---|
| 1-third-party-profile.csv | Third Party Profile | "Third Party Name" verified as the default key. |
| 2-engagement.csv | Engagements | Field names not verified; map them in the wizard. |
| 3-control-standards.csv | Control Standards | "Standard ID", "Standard Name", "Statement" verified from Archer's content-feed mapping. |
| 4-findings.csv | Findings | "Root Cause", "Date Opened", "Related Records" verified. Status uses Open. |
| 5-remediation-plans.csv | Remediation Plans | Status uses Not Started, In Progress, or Closed. A blocked action has no verified Archer status, so Status is empty and "Workbook Status" says Blocked. |
| 6-exception-requests.csv | Exception Requests | Approver, scope, and expiry field names not verified. |
| 7-question-library.csv | Question Library | "Question Name" is the key. The question type "Values List" is not verified. |
| 8-questionnaire-answers.csv | Questionnaire | The 38 questions must exist as questionnaire fields first. |
| 9-evidence-manifest.csv | Supporting documentation | Archer's Data Import cannot load attachments; use the REST API or attach by hand. |

## Format

- UTF-8, comma-delimited, every value in double quotes, header row on line 1.
- Set the wizard's values delimiter to the pipe character. Pipes were removed from text so they cannot split a value.
- Dates use MM/DD/YYYY. Declare that format while mapping.
- Each file has a stable ID column (for example ${data.key}:C05). Use it as the key field with "Update Existing Records" so a second import updates rather than duplicates.
- Owners and reviewers are plain text. A User/Groups field fails when the person has no Archer account.
- Archer's 2024.09 documentation says the Data Import wizard is on-premises only; the 2025.12 page drops that sentence. Confirm it is available on your SaaS tenant.

## Sources

- https://help.archerirm.cloud/platform_2025_12/en-us/content/platform/integration/int_dimp_basics.htm
- https://help.archerirm.cloud/platform_2024_09/en-us/content/platform/integration/int_dimp_preparing.htm
- https://help.archerirm.cloud/platform_2025_04/en-us/content/platform/integration/int_dimp_importing.htm
- https://help.archerirm.cloud/audit_issues_2024.03/en-us/Content/Solutions/Audit/am_ism_upgrade.htm
- https://help.archerirm.cloud/platform_2024_09/en-us/content/platform/questionnaires/quest_ql_adding.htm`);
}

function servicenowReadme(data) {
  return readme('ServiceNow GRC', data, `## Files

\`pqc-review-servicenow.xlsx\` holds one sheet per target; \`csv/\` holds the same sheets as CSV. Load each sheet through Load Data (an import set) and a transform map you build. No shipped transform map covers these tables.

| Sheet | Target table | Notes |
|---|---|---|
| control_objectives | sn_compliance_policy_statement | Load first. |
| controls | sn_compliance_control | Status uses Compliant, Non-compliant, or Not applicable. Clarify and unreviewed results leave Status empty; "Workbook result" keeps the original. |
| control_tests | sn_audit_control_test | Operating effectiveness uses Effective (observed), Ineffective (failed), or None. These are the buyer's observations of a supplier product. |
| issues | sn_grc_issue | State uses New, Respond, or Closed Complete. |
| exceptions | sn_compliance_policy_exception | Accepted risks, with approver, scope, and Valid to. |
| vendor | core_company | One supplier row. |
| questionnaire | Third-party risk questionnaire template | Columns follow the documented single-sheet layout. |
| questionnaire_responses, links | Reference | Attach to the assessment or load into your own tables. |
| attachments | sys_attachment | Upload each file with the Attachment API, one file per request. |

## Format and matching

- Coalesce on "External ID" (for example ${data.key}:C05) so a second load updates instead of inserting.
- Dates use yyyy-MM-dd. Booleans are lowercase.
- Reference columns hold display values; map owners to user names yourself.
- Set the field map's choice action to reject, so an unexpected value cannot create a new choice.
- Column names in these sheets are labels. ServiceNow's public documentation gives form labels, not dictionary column names, so confirm each column in sys_dictionary before building the transform map.

## Sources

- https://www.servicenow.com/docs/bundle/yokohama-integrate-applications/page/administer/import-sets/concept/c_ImportSetCoalesce.html
- https://www.servicenow.com/docs/r/api-reference/rest-apis/c_ImportSetAPI.html
- https://www.servicenow.com/docs/r/api-reference/rest-apis/c_AttachmentAPI.html
- https://www.servicenow.com/docs/r/integrate-applications/easy-import/c_EasyImport.html`);
}

function vantaReadme(data) {
  return readme('Vanta', data, `## Files

| File | Vanta target | Notes |
|---|---|---|
| vendor.json | POST /v1/vendors | Fields and the IN_PROCUREMENT status verified against the public API reference. |
| findings.json | Vendor findings on the security review | One finding per gap, failed test, open action, and accepted risk. riskStatus uses REMEDIATE or ACCEPT. Findings have no owner or due-date field, so those sit in requirementNotes. |
| risks.json, risks.csv | Risk scenarios | Accepted risks, treatment Accept. "Risk Scenario" is the only verified CSV heading. Approver, scope, and expiry are in the description; create custom fields first if you want them as fields. |
| review-workbook.xlsx | Document on the security review | Vanta has no import for test observations or survey answers, so they travel here. Upload it with type OTHER. |
| controls.csv | Custom controls (optional) | Headings verified. Leave Domain empty or use a value your tenant accepts. Only import these if you want the 26 checks in your own control library. |
| evidence-manifest.csv | Reference | Upload proof files as security review documents. |

## Format

- API dates are ISO 8601 date-times. The API rejects any property not in its schema, which is why the JSON files carry only documented fields.
- The API needs an OAuth client secret. Run any load script from a machine you control; never paste the secret into a web page.
- Vanta creates a security review when a vendor's inherent risk warrants one; the API cannot start one.

## Sources

- https://developer.vanta.com/api-reference/vendors/create-a-vendor.md
- https://developer.vanta.com/api-reference/vendors/add-a-vendor-finding.md
- https://developer.vanta.com/api-reference/risk-scenarios/create-risk-scenario.md
- https://help.vanta.com/en/articles/11345435-importing-custom-controls
- https://help.vanta.com/en/articles/12005142-adding-and-managing-risks`);
}

function drataReadme(data, skipped) {
  return readme('Drata', data, `## Files

| File | Drata target | Notes |
|---|---|---|
| vendor.csv | Vendor bulk import | Headings from Drata's vendor overview. The template may hold more columns; if Drata rejects the file, paste these columns into the template from your tenant. |
| risks.csv | Risk register import | Headings verified. Risk ID uses PREFIX-NUMBER, so a second import updates the same risks. Category "People - Third Party". Risk source and Vendor need VRM Pro. Owners and Reviewers are empty because they must be existing Drata users. |
| tasks.csv | Custom tasks import | Open actions with a due date today or later. Assignee Email is required by Drata and must be a Drata user; fill it before loading.${skipped.length ? ` Left out because they lack a future due date: ${skipped.join(', ')}.` : ''} |
| drata-api.json | Vendor and security review API | Enum values verified: securityReviewStatus, securityReviewType SECURITY. |
| review-results.xlsx | Security review document | Upload to the security review; Drata has no field for control or test results. |
| evidence-index.csv | Reference | Upload proof files as vendor documents. Drata's vendor document upload refuses .json and .zip. |

## Format

- Dates use YYYY-MM-DD. The characters < > and \\ were removed because Drata's importer refuses them.
- Do not import the 26 checks as Drata controls: Drata controls track your own compliance program, and its readiness rollups would count the supplier's results against you.

## Sources

- https://help.drata.com/en/articles/12260817-import-risk-in-bulk-new-experience
- https://help.drata.com/en/articles/14744132-bulk-import-custom-tasks
- https://help.drata.com/en/articles/13557179-vendors-overview-in-drata-new-experience
- https://developers.drata.com/openapi/reference/v2/tag/Vendor-Security-Reviews/`);
}

function scrutReadme(data) {
  return readme('Scrut', data, `## Files

| File | Scrut target | Notes |
|---|---|---|
| vendor-import.xlsx | Vendor bulk import | Columns A to O as documented. The import fails on any error. Category Security; status Assessed when a buyer decision is recorded. Scrut's page prints "Vendor's Category" with a curly apostrophe, likely from page formatting; if the import rejects the heading, copy it from your tenant's template. |
| questionnaire-template.xlsx | Questionnaire template import | Columns A to F as documented. Later columns (question type and options) are not published, so all questions import as subjective. Domains must already exist. |
| risks.csv | Risk register import | "Risk Name" is required; map the rest in the wizard. Category "Vendor Management". |
| review-record.xlsx | Vendor document | Scrut has no import for control results, test results, or supplier answers; upload this as a vendor document. |
| evidence-index.csv | Reference | Vendor documents are added by hand in Scrut. |

## Format

- Vendor dates use DD MM YYYY. Assignee and POC columns are empty because they must be Scrut users.

## Sources

- https://help.scrut.io/docs/adding-a-single-vendor
- https://help.scrut.io/docs/bulk-importing-template
- https://help.scrut.io/docs/adding-a-new-risk
- https://help.scrut.io/docs/adding-a-document`);
}

// ---- Package ----
const sha256Hex = async bytes => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const safeName = value => String(value).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);

// attachments: [{id, name, bytes}] for the proof files to include. Returns the ZIP as a Uint8Array or Blob.
export async function buildGrcPackage(state, platform, {JSZip, attachments = [], today = new Date().toISOString().slice(0, 10), type = 'uint8array'} = {}) {
  if (!PLATFORMS[platform]) throw new Error('Choose a supported GRC platform.');
  const data = reviewData(state, today);
  data.state = state;
  const files = {};
  for (const item of attachments) {
    const file = `evidence/${safeName(item.id)}-${safeName(item.name)}`;
    files[file] = item.bytes;
    const record = data.evidence.find(entry => entry.id === item.id);
    if (record) { record.file = file; record.sha256 = await sha256Hex(item.bytes); }
  }
  const built = await ({archer, servicenow, vanta, drata, scrut})[platform](data, JSZip);
  Object.assign(files, COMMON(data), built.files, {'README.md':built.readme});
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({type, compression:'DEFLATE'});
}
