import {qualifyingEvidence} from './scorecard.js';

const filled = value => Boolean(String(value ?? '').trim());
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value||'') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
export const DRAFT_STATUS = 'Unsigned draft for human review. Not an attestation, conformance result, certification, or endorsement.';

// randomUUID exists only in secure contexts; a plain-HTTP host still has getRandomValues.
export function makeUuid(source = globalThis.crypto) {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function buildClaimDrafts(state) {
  const buyer = state.buyer || {};
  return (state.crypto || []).map(use => {
    const required = [
      ['product', buyer.product], ['version', buyer.version], ['deployment setup', buyer.configuration],
      ['crypto use ID', use.id], ['function', use.function], ['path', use.path], ['current method', use.current]
    ];
    const missing = required.filter(([,value]) => !filled(value)).map(([name]) => name);
    const linked = (state.evidence || []).filter(proof => proof.linkedIds?.includes(use.id));
    const supporting = linked.filter(qualifyingEvidence);
    const counter = linked.filter(proof => proof.result === 'Rejected' || proof.productMatch === 'No' || proof.pathMatch === 'No');
    const pending = linked.filter(proof => !supporting.includes(proof) && !counter.includes(proof));
    const tests = Object.entries(state.tests || {}).filter(([,test]) => test.cryptoUseId === use.id).map(([id,test]) => ({id,result:test.result || 'Not run'}));
    const actions = (state.actions || []).filter(action => String(action.linked || '').toUpperCase().split(/[;,\s]+/).includes(use.id)).map(action => ({id:action.id,status:action.status || 'Open'}));
    const statement = missing.length ? '' : `For ${buyer.product}, version ${buyer.version}, in ${buyer.configuration.trim().replace(/[.\s]+$/, '')}, the buyer record reports ${use.current} for ${use.function.toLowerCase()} on ${use.path}.`;
    return {
      id:use.id || 'Unlabeled use',
      status:missing.length ? 'Insufficient detail' : counter.length ? 'Counter-evidence needs review' : supporting.length ? 'Ready for human review' : 'Proof needed',
      missing, statement,
      target:{product:buyer.product || '',version:buyer.version || '',configuration:buyer.configuration || '',cryptoUseId:use.id || '',path:use.path || ''},
      supportingEvidence:supporting.map(proof => ({id:proof.id,artifact:proof.artifact,date:proof.date,issuer:proof.issuer,producer:proof.producer})),
      counterEvidence:counter.map(proof => ({id:proof.id,result:proof.result || 'Scope mismatch'})),
      pendingEvidence:pending.map(proof => proof.id),
      tests, actions,
      limits:use.coverage || 'Discovery coverage has not been recorded.'
    };
  });
}

// Drafts missing their scope fields are left out: a claim without a target says nothing checkable.
export function buildCycloneDxDraft(state, serialNumber, {omitLocations = false} = {}) {
  const drafts=buildClaimDrafts(state).filter(draft => !draft.missing.length);
  const buyer=state.buyer || {};
  const target='buyer-target-1';
  const citedIds=new Set(drafts.flatMap(draft=>[...draft.supportingEvidence,...draft.counterEvidence].map(item=>item.id)));
  const proof=(state.evidence||[]).filter(item=>citedIds.has(item.id));
  const evidence=proof.map(item=>({
    'bom-ref':`proof-${item.id}`,
    propertyName:'pqc.buyer.proof',
    description:[item.artifact,item.type,item.producer&&`Produced by: ${item.producer}`,!omitLocations&&item.location&&`Location: ${item.location}`,item.result&&`Buyer review: ${item.result}`].filter(Boolean).join('; '),
    ...(validDate(item.date)?{created:`${item.date}T00:00:00Z`}:{}),
    ...(item.issuer?{author:{name:item.issuer}}:{})
  }));
  const claims=drafts.map(draft=>({
    'bom-ref':`claim-${draft.id}`,
    target,
    predicate:draft.statement,
    reasoning:[`Draft status: ${draft.status}.`,`Path: ${draft.target.path||'unknown'}.`,`Discovery limits: ${draft.limits}`,draft.tests.length&&`Reviewer-recorded tests: ${draft.tests.map(item=>`${item.id} ${item.result}`).join(', ')}.`,draft.actions.length&&`Actions: ${draft.actions.map(item=>`${item.id} ${item.status}`).join(', ')}.`].filter(Boolean).join(' '),
    ...(draft.supportingEvidence.length?{evidence:draft.supportingEvidence.map(item=>`proof-${item.id}`)}:{}),
    ...(draft.counterEvidence.length?{counterEvidence:draft.counterEvidence.map(item=>`proof-${item.id}`)}:{})
  }));
  return {
    $schema:'https://cyclonedx.org/schema/bom-1.7.schema.json',
    bomFormat:'CycloneDX',specVersion:'1.7',serialNumber,version:1,
    metadata:{timestamp:new Date().toISOString(),component:{type:'application',name:buyer.product||'Unspecified product',...(buyer.version?{version:buyer.version}:{})},
      properties:[{name:'pqc-buyer-workbook:document-status',value:DRAFT_STATUS},{name:'pqc-buyer-workbook:signed',value:'false'}]},
    declarations:{targets:{components:[{'bom-ref':target,type:'application',name:buyer.product||'Unspecified product',...(buyer.version?{version:buyer.version}:{})}]},claims,evidence}
  };
}
