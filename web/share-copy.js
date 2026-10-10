// A share copy is an export for people outside the review team. It keeps every review outcome and removes
// the categories the sender chooses. Removed values are replaced with a marker rather than deleted, so a
// recipient can tell "removed by the sender" apart from "never recorded".
export const SHARE_CATEGORIES = ['locations', 'notes', 'names', 'files'];
export const SHARE_LABELS = {locations:'proof locations', notes:'notes', names:'reviewer and owner names', files:'attached files'};
export const REMOVED = 'Removed from share copy';

const NAME_FIELDS = {buyer:['reviewer'], tests:['reviewerDate', 'ownerTeam', 'partnerTeams', 'approvalOwner'], controls:['ownerTeam'],
  crypto:['owner'], actions:['owner', 'riskApprover'], boms:['reviewer']};
const NOTE_FIELDS = {survey:['followup'], evidence:['note'], actions:['note'], boms:['notes'], licenses:['reviewNote'], licensing:['reviewNote']};
const LOCATION_FIELDS = {evidence:['location'], boms:['source']};
const ID_SHAPED = /^[A-Z]{1,4}-\d{1,6}$/;

function rows(assessment, section) {
  const value = assessment[section];
  if (Array.isArray(value)) return value;
  if (['survey', 'tests', 'controls'].includes(section)) return Object.values(value || {});
  return value ? [value] : [];
}

function each(assessment, fieldsBySection, change) {
  for (const [section, fields] of Object.entries(fieldsBySection)) {
    for (const row of rows(assessment, section)) for (const field of fields) if (row[field]) row[field] = change(row[field], section, field);
  }
}

// Works on a copy that the caller already normalized; returns the same object for chaining.
export function redactForShare(assessment, removed) {
  const remove = new Set(removed.filter(category => SHARE_CATEGORIES.includes(category)));
  if (remove.has('names')) each(assessment, NAME_FIELDS, () => REMOVED);
  if (remove.has('notes')) {
    each(assessment, NOTE_FIELDS, () => '');
    for (const review of Object.values(assessment.pqcmm?.reviews || {})) review.note = '';
  }
  // A BOM source can be the ID of a proof record, which is a link inside the assessment rather than a location.
  if (remove.has('locations')) each(assessment, LOCATION_FIELDS, value => ID_SHAPED.test(value) ? value : REMOVED);
  if (remove.has('files')) {
    for (const item of assessment.evidence) {
      if (!item.attachmentName) continue;
      if (!item.location) item.location = 'Attached file removed from share copy';
      item.attachmentName = ''; item.attachmentType = ''; item.attachmentSize = 0;
    }
  }
  return assessment;
}
