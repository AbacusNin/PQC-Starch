import {relatedTestsForControl} from './control-links.js';

// This scores the completeness of the buyer's record, never product compliance.
const filled = value => Boolean(String(value ?? '').trim());
const idFor = (index, prefix) => `${prefix}${String(index + 1).padStart(2, '0')}`;
const includesId = (item, id) => item.linkedIds?.includes(id);
// A buyer test is only as independent as the proof behind it; supplier logs restate the claim.
export const TEST_PRODUCERS = ['Buyer', 'Independent third party'];

export function qualifyingEvidence(item) {
  return item.result === 'Accepted' && item.productMatch === 'Yes' && item.pathMatch === 'Yes' &&
    ['artifact','issuer','date'].every(key => filled(item[key])) &&
    (filled(item.location) || filled(item.attachmentName));
}

function questionRefs(value) {
  const found = new Set();
  for (const part of String(value || '').split(';').map(value => value.trim())) {
    const range = part.match(/^Q(\d{2})-Q(\d{2})$/);
    if (range) {
      for (let number = Number(range[1]); number <= Number(range[2]); number++) found.add(`Q${String(number).padStart(2,'0')}`);
    } else if (/^Q\d{2}$/.test(part)) found.add(part);
  }
  return [...found];
}

export function buildScorecard(state, survey, controls, tests) {
  const evidence = state.evidence || [];
  const qualified = evidence.filter(qualifyingEvidence);
  const hasProof = ids => qualified.some(item => ids.some(id => includesId(item, id)));
  const hasIndependentProof = ids => qualified.some(item => TEST_PRODUCERS.includes(item.producer) && ids.some(id => includesId(item, id)));
  const scopeFields = ['product','version','configuration','setting'];
  const missingScope = scopeFields.filter(key => !filled(state.buyer?.[key]));
  const mappedUses = (state.crypto || []).filter(item => ['id','function','path','current','component','coverage'].every(key => filled(item[key])));
  const usesWithBomRef = (state.crypto || []).filter(item=>filled(item.sbomRef) || filled(item.cbomRef));
  const answered = survey.filter((_, index) => filled(state.survey?.[idFor(index,'Q')]?.answer));
  const yesAnswers = survey.filter((_, index) => state.survey?.[idFor(index,'Q')]?.answer === 'Yes');
  const supportedAnswers = survey.filter((_, index) => {
    const id = idFor(index,'Q');
    const answer = state.survey?.[id];
    return answer?.answer === 'Yes' && answer.review === 'Accepted' && hasProof([id]);
  });
  const notApplicable = item => state.controls?.[item[0]]?.result === 'N/A' || state.controls?.[item[0]]?.applies === 'No';
  const applicableControls = controls.filter(item => !notApplicable(item));
  const applicableTests = tests.filter(item => state.tests?.[item[0]]?.result !== 'N/A');
  const acceptedControls = controls.filter(item => state.controls?.[item[0]]?.result === 'Accepted');
  const observedTests = tests.filter(item => state.tests?.[item[0]]?.result === 'Observed');
  const supportedTests = observedTests.filter(item => {
    const test = state.tests[item[0]];
    return ['productBuild','toolVersion','cryptoUseId','observed','negative','limits','reviewerDate'].every(key => filled(test[key])) &&
      (state.crypto || []).some(use => use.id === test.cryptoUseId) && hasIndependentProof([item[0]]);
  });
  const supportedControls = acceptedControls.filter(item => hasProof([item[0], ...questionRefs(item[3])]) &&
    !relatedTestsForControl(item[0],state).some(id => state.tests?.[id]?.requiredForProcurement === 'Yes' && !supportedTests.some(test=>test[0]===id)));
  const mismatchedProof = evidence.filter(item => item.result === 'Accepted' && !qualifyingEvidence(item));
  const counterProof = evidence.filter(item => item.result === 'Rejected' || (item.result !== 'Accepted' && (item.productMatch === 'No' || item.pathMatch === 'No')));
  const qualifiedByProducer = {};
  for (const item of qualified) qualifiedByProducer[item.producer || 'Unknown'] = (qualifiedByProducer[item.producer || 'Unknown'] || 0) + 1;
  const failedTests = tests.filter(item => state.tests?.[item[0]]?.result === 'Failed');
  const inconclusiveTests = tests.filter(item => state.tests?.[item[0]]?.result === 'Inconclusive');
  const requiredTests = tests.filter(item => state.tests?.[item[0]]?.requiredForProcurement === 'Yes');
  const blockedRequiredTests = requiredTests.filter(item => state.tests?.[item[0]]?.blocked === 'Yes');
  const unresolvedRequiredTests = requiredTests.filter(item => !supportedTests.includes(item));
  const openActions = (state.actions || []).filter(item => ['Open','In progress','Blocked'].includes(item.status));
  const acceptedRisks = (state.actions || []).filter(item => item.status === 'Accepted risk');
  const incompleteRisks = acceptedRisks.filter(item => !filled(item.riskApprover) || !filled(item.riskExpiry));
  const unprovenClosure = (state.actions || []).filter(item => item.status === 'Closed' && !qualified.some(proof => proof.id === item.closureProof));
  const licenseTermsRecorded = ['licenseModel','pqcEntitlement','supportTerm','migrationRights'].every(key => filled(state.licensing?.[key]));
  const licenseProofQualified = qualified.some(proof => proof.id === state.licensing?.proofId);
  const licenseRecords = state.licenses || [];
  const licensesWithProof = licenseRecords.filter(item=>filled(item.name) && filled(item.appliesTo) && qualified.some(proof=>proof.id===item.proofId));
  return {
    missingScope,
    mappedUses:mappedUses.length, totalUses:state.crypto?.length || 0,
    usesWithBomRef:usesWithBomRef.length, totalBoms:state.boms?.length || 0,
    answered:answered.length, totalQuestions:survey.length,
    yesAnswers:yesAnswers.length, supportedAnswers:supportedAnswers.length,
    acceptedControls:acceptedControls.length, supportedControls:supportedControls.length, totalControls:controls.length, applicableControls:applicableControls.length,
    observedTests:observedTests.length, supportedTests:supportedTests.length, totalTests:tests.length, applicableTests:applicableTests.length,
    qualifiedProof:qualified.length, totalProof:evidence.length, qualifiedByProducer,
    mismatchedProof:mismatchedProof.length, counterProof:counterProof.length,
    failedTests:failedTests.length, inconclusiveTests:inconclusiveTests.length,
    requiredTests:requiredTests.length,blockedRequiredTests:blockedRequiredTests.length,unresolvedRequiredTests:unresolvedRequiredTests.length,
    openActions:openActions.length, acceptedRisks:acceptedRisks.length, incompleteRisks:incompleteRisks.length, unprovenClosure:unprovenClosure.length,
    licenseTermsRecorded,licenseProofQualified,licenseRecords:licenseRecords.length,licensesWithProof:licensesWithProof.length,
    unknowns:filled(state.buyer?.unknown), nextReview:filled(state.buyer?.trigger)
  };
}
