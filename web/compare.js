// Lists what changed between an earlier export and the current assessment, so a re-review after a
// new release starts from the differences instead of rereading every record.
const RECORDS = [
  ['Crypto use', 'crypto', ['current', 'function', 'path', 'parameter', 'component', 'usageStatus', 'sourceNode', 'destinationNode']],
  ['Evidence', 'evidence', ['result', 'productMatch', 'pathMatch', 'producer', 'artifact', 'date']],
  ['BOM', 'boms', ['release', 'composition', 'validation', 'signature']],
  ['Action', 'actions', ['status', 'closureProof', 'riskExpiry']],
  ['License', 'licenses', ['licenseId', 'conditions', 'proofId']]
];
const MAPS = [['Survey', 'survey', ['answer', 'review']], ['Test', 'tests', ['result', 'requiredForProcurement', 'blocked']], ['Control', 'controls', ['applies', 'result']]];
const SCOPE = ['product', 'version', 'configuration', 'setting', 'decision', 'policyRef'];

export function compareAssessments(before, after) {
  const changes = [];
  const fields = (area, id, old, now, keys) => {
    for (const field of keys) if ((old?.[field] || '') !== (now?.[field] || '')) changes.push({area, id, change:'changed', field, from:old?.[field] || '(blank)', to:now?.[field] || '(blank)'});
  };
  for (const key of SCOPE) {
    const from = before.buyer?.[key] || '', to = after.buyer?.[key] || '';
    if (from !== to) changes.push({area:'Scope', id:key, change:'changed', from:from || '(blank)', to:to || '(blank)'});
  }
  for (const [area, kind, keys] of RECORDS) {
    const old = new Map((before[kind] || []).map(item => [item.id, item])), now = new Map((after[kind] || []).map(item => [item.id, item]));
    for (const [id, item] of now) if (old.has(id)) fields(area, id, old.get(id), item, keys); else changes.push({area, id, change:'added'});
    for (const id of old.keys()) if (!now.has(id)) changes.push({area, id, change:'removed'});
  }
  for (const [area, kind, keys] of MAPS) {
    const ids = [...new Set([...Object.keys(before[kind] || {}), ...Object.keys(after[kind] || {})])].sort();
    for (const id of ids) fields(area, id, before[kind]?.[id], after[kind]?.[id], keys);
  }
  return changes;
}
