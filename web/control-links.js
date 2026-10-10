// Suggested test links. Reviewers decide applicability for the actual purchase.
export const controlTests = {
  C01:['T17'], C02:['T17'], C03:['T13','T16'], C04:['T10','T27'],
  C05:['T01','T05','T11','T15'], C06:['T04','T06','T12','T23'],
  C07:['T02','T03','T15'], C08:['T07','T24'], C09:['T13','T18','T26'],
  C10:[], C11:['T25'], C12:['T08','T09'], C13:['T10','T14'],
  C14:['T26'], C15:['T17'], C16:['T15','T20'], C17:[],
  C18:['T16','T26'], C19:['T13','T26'], C20:['T13','T18'],
  C21:['T14','T23'], C22:[], C23:[], C24:['T17','T32'],
  C25:['T05','T28','T29','T30','T33'], C26:['T24','T31']
};

export function relatedTestsForControl(controlId,state) {
  const added=Object.entries(state.tests || {}).filter(([,test])=>String(test.controlIds||'').split(/[,;\s]+/).includes(controlId)).map(([id])=>id);
  const required=controlId==='C23'?Object.entries(state.tests || {}).filter(([,test])=>test.requiredForProcurement==='Yes').map(([id])=>id):[];
  return [...new Set([...(controlTests[controlId]||[]),...added,...required])];
}
