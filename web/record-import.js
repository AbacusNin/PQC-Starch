import {containsSecret} from './secrets.js';
import {PRODUCERS} from './storage.js';
import {checkCycloneDx, graphSummary} from './bom-check.js';
export {containsSecret};

const MAX_FILE = 6 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
const MAX_ROWS = 100;
const MAX_ENTRIES = 150;
const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
const PREFIX = {crypto:'CU', boms:'BM', evidence:'EV'};
const DATE_FIELDS = {evidence:['date'], boms:['created']};

const aliases = {
  crypto:{
    id:['id','use id'], product:['product','product / system'], protected:['protected','what is protected or verified?'],
    path:['path','where is it used?'], sourceNode:['source system'], destinationNode:['destination system'],
    trustBoundary:['trust boundary'], function:['function'], current:['current method'], parameter:['parameter','parameter / key size','parameter or key size'],
    protocolVersion:['protocol and version'], cipherSuite:['cipher suite'], component:['component','component + version','component and version'],
    componentPurl:['package url','purl','package url (purl)'], sbomRef:['sbom component reference'], cbomRef:['cbom asset reference'],
    assetType:['cbom asset type'], keyLifecycle:['key or certificate lifecycle'], owner:['owner'], dataLife:['data life / exposure','data life or exposure'],
    target:['pqc target or plan'], coverage:['coverage','coverage note','discovery coverage and blind spots']
  },
  boms:{
    id:['id','bom record id'], kind:['kind','bom kind'], serial:['serial','bom serial number'], version:['version','bom version'],
    target:['target','bom target product'], release:['release','bom target release'], supplier:['supplier','bom supplier'],
    author:['author','bom author'], created:['created','bom creation date'], lifecycle:['lifecycle','bom lifecycle'],
    tool:['tool','generation tool and version'], source:['source','source or evidence id'],
    composition:['composition','declared completeness'], services:['services','external services and boundaries'],
    dependencies:['dependencies','dependency and provides review'], distribution:['distribution','sharing or redaction limits'],
    reviewer:['reviewer','bom reviewer'], notes:['notes','bom review notes']
  },
  evidence:{
    id:['id','proof id'], linkedIds:['linked ids','linked claim / control','linked ids, separated by commas'],
    type:['type','proof type'], producer:['producer','produced by'], artifact:['artifact','what is the artifact?'], issuer:['issuer','issuer / observer','issuer or observer'],
    date:['date'], productMatch:['product match','product/version match?'], pathMatch:['path match','path / setup match?','path/setup match?'],
    location:['location','location or url'], sensitivity:['sensitivity'], note:['note','review note']
  },
  pqcmm:{
    id:['id','criterion id','criteria id','requirement id'], level:['level','maturity level'], levelName:['level name'],
    text:['criterion','criteria','text','description','requirement','statement'], tags:['tags','tag','category','categories','domain'],
    source:['source','source url','url','link','reference']
  }
};
const MAX_CRITERIA_ROWS = 300;

function rejectSecrets(value) {
  if (containsSecret(value)) throw new Error('This file appears to contain secret key material. Remove it before importing.');
}

// Excel stores dates as day counts from 1899-12-30; a five-digit whole number in a date column is one.
export function excelSerialToIso(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{5}(?:\.\d+)?$/.test(raw)) return value;
  return new Date((Math.floor(Number(raw)) - 25569) * 86400000).toISOString().slice(0, 10);
}

function rowFromObject(item,kind) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const byKey=new Map(Object.entries(item).map(([name,value])=>[key(name),value]));
  const result={};
  for (const [field,names] of Object.entries(aliases[kind])) {
    const value=[field,...names].map(name=>byKey.get(key(name))).find(value=>value!==undefined);
    if (value!==undefined) result[field]=Array.isArray(value)?value.join(', '):String(value ?? '').slice(0,12000);
  }
  return Object.keys(result).length ? result : null;
}

// Imported rows are work items: ids are made unique, review results reset, and the source file named.
export function prepareImportedRows({kind, rows, existingIds, fileName, floor = 0, bomCheck = null}) {
  const prefix = PREFIX[kind];
  const allowed = new Set(Object.keys(aliases[kind]));
  const used = new Set(existingIds.map(id => String(id).toUpperCase()));
  let number = Number(floor) || 0;
  return rows.map(row => {
    const item = Object.fromEntries(Object.entries(row).filter(([field]) => allowed.has(field)).map(([field, value]) => [field, String(value ?? '').trim().slice(0, 12000)]));
    item.id = String(item.id || '').toUpperCase();
    if (!new RegExp(`^${prefix}-\\d{3,}$`).test(item.id) || used.has(item.id)) {
      do number++; while (used.has(`${prefix}-${String(number).padStart(3, '0')}`));
      item.id = `${prefix}-${String(number).padStart(3, '0')}`;
    }
    used.add(item.id);
    for (const field of DATE_FIELDS[kind] || []) if (item[field]) item[field] = excelSerialToIso(item[field]);
    if (kind === 'crypto') {
      item.usageStatus = item.cbomRef ? 'CBOM listed' : 'Vendor claim';
      item.coverage = [item.coverage, `Imported from ${fileName}; verify product scope, path, and deployed use.`].filter(Boolean).join(' ');
    }
    if (kind === 'boms') {
      item.validation = bomCheck ? bomCheck.schema.summary : 'Not checked';
      item.signature = bomCheck ? bomCheck.signature.summary : 'Not checked';
      if (bomCheck) { item.dependencies = graphSummary(bomCheck.graph); item.graph = bomCheck.graph.nodes; }
      item.notes = [item.notes, `Imported from ${fileName}; review original file before relying on it.`].filter(Boolean).join(' ');
    }
    if (kind === 'evidence') {
      item.linkedIds = String(item.linkedIds || '').split(/[,;]+/).map(id => id.trim().toUpperCase()).filter(id => /^[A-Z][A-Z0-9-]{1,59}$/.test(id)).slice(0, 100);
      item.result = 'Not reviewed'; item.productMatch = 'Unsure'; item.pathMatch = 'Unsure';
      if (!PRODUCERS.includes(item.producer)) item.producer = 'Unknown';
      item.attachmentName = ''; item.attachmentType = ''; item.attachmentSize = 0;
      item.note = [item.note, `Imported from ${fileName}; inspect the original proof.`].filter(Boolean).join(' ');
    }
    return item;
  });
}

function xml(value) {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error('Excel XML declarations are not supported.');
  const doc=new DOMParser().parseFromString(value,'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The Excel file contains invalid XML.');
  return doc;
}
const nodes=(parent,name)=>[...parent.getElementsByTagName('*')].filter(node=>node.localName===name);
const first=(parent,name)=>nodes(parent,name)[0];

// Zip headers can understate a part's size, so the cap is enforced on the bytes actually inflated.
function readCapped(entry) {
  return new Promise((resolve, reject) => {
    let size = 0, done = false;
    const parts = [];
    const stream = entry.internalStream('string');
    stream.on('data', chunk => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_XML) { done = true; stream.pause(); reject(new Error('An Excel part is too large.')); return; }
      parts.push(chunk);
    }).on('error', error => { if (!done) { done = true; reject(error); } })
      .on('end', () => { if (!done) { done = true; resolve(parts.join('')); } }).resume();
  });
}

async function xlsxRows(file,kind) {
  if (!window.JSZip) throw new Error('Excel support is unavailable in this browser. Import JSON instead.');
  const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
  const entries=Object.values(zip.files).filter(entry=>!entry.dir);
  if (entries.length>MAX_ENTRIES) throw new Error('The Excel file contains too many parts.');
  const read=async path=>{
    const entry=zip.file(path);
    return entry ? readCapped(entry) : '';
  };
  const workbookText=await read('xl/workbook.xml');
  const relText=await read('xl/_rels/workbook.xml.rels');
  if(!workbookText || !relText) throw new Error('This is not a readable .xlsx workbook.');
  const workbook=xml(workbookText), rels=xml(relText);
  const wanted={crypto:'Crypto Map',boms:'SBOM and CBOM Register',evidence:'Evidence',pqcmm:'Maturity Criteria'}[kind];
  const sheets=nodes(workbook,'sheet');
  const sheet=sheets.find(item=>item.getAttribute('name')?.toLowerCase()===wanted.toLowerCase()) || (sheets.length===1?sheets[0]:null);
  if(!sheet) throw new Error(`Choose an Excel file with a ${wanted} sheet, or a one-sheet import template.`);
  const relation=nodes(rels,'Relationship').find(item=>item.getAttribute('Id')===sheet.getAttribute('r:id'));
  if(!relation) throw new Error('The Excel sheet reference is missing.');
  const target=relation.getAttribute('Target') || '';
  const sheetPath=target.startsWith('/xl/')?target.slice(1):`xl/${target.replace(/^\/?xl\//,'')}`;
  if(!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(sheetPath)) throw new Error('The Excel sheet path is not supported.');
  const sheetText=await read(sheetPath);
  if(!sheetText) throw new Error('The Excel sheet is empty.');
  const sharedText=await read('xl/sharedStrings.xml');
  // Phonetic runs (rPh) are reading aids for East Asian text, not part of the cell value.
  const shared=sharedText?nodes(xml(sharedText),'si').map(item=>nodes(item,'t').filter(part=>part.parentElement?.localName!=='rPh').map(part=>part.textContent).join('')):[];
  const rows=nodes(xml(sheetText),'row').slice(0,MAX_CRITERIA_ROWS+15).map(row=>{
    const cells=[];
    for(const cell of nodes(row,'c')) {
      const letters=cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0] || '';
      let index=0;
      for(const letter of letters) index=index*26+letter.charCodeAt(0)-64;
      if(index<1 || index>100) continue;
      const type=cell.getAttribute('t');
      const value=type==='inlineStr'?nodes(cell,'t').map(part=>part.textContent).join(''):first(cell,'v')?.textContent || '';
      cells[index-1]=type==='s'?shared[Number(value)] || '':value;
    }
    return cells;
  });
  return tableRows(rows,kind);
}

// The heading row is the first row with at least two recognized headings, so a title or note above it is fine.
function tableRows(rows,kind) {
  const names=new Set(Object.values(aliases[kind]).flat().map(key));
  const headerIndex=rows.findIndex(row=>row.filter(value=>names.has(key(value))).length>=2);
  if(headerIndex<0) throw new Error('No recognized column headings were found for this record type.');
  return rows.slice(headerIndex+1).filter(row=>row.some(value=>String(value||'').trim())).map(row=>Object.fromEntries(rows[headerIndex].map((heading,index)=>[heading,row[index]||''])));
}

// RFC 4180 CSV: quoted fields may hold commas, quotes ("" inside quotes), and line breaks.
export function parseCsv(content, maxRows=MAX_CRITERIA_ROWS+15) {
  const source=String(content).replace(/^﻿/,'');
  const rows=[]; let row=[], field='', quoted=false;
  for (let index=0; index<source.length; index++) {
    const char=source[index];
    if (quoted) {
      if (char==='"' && source[index+1]==='"') { field+='"'; index++; }
      else if (char==='"') quoted=false;
      else field+=char;
    } else if (char==='"' && field==='') quoted=true;
    else if (char===',') { row.push(field); field=''; }
    else if (char==='\n' || char==='\r') {
      if (char==='\r' && source[index+1]==='\n') index++;
      row.push(field); rows.push(row); row=[]; field='';
      if (rows.length>maxRows) throw new Error('The CSV file has too many rows.');
    } else field+=char;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  if (field!=='' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// A criteria file is the PKI Consortium model (JSON), or a list of criteria as JSON, CSV, or Excel.
export async function readCriteriaFile(file) {
  if(file.size>MAX_FILE) throw new Error('The import file must be 6 MB or less.');
  const extension=file.name.toLowerCase().split('.').pop();
  if(extension==='json') {
    let raw;
    try { raw=JSON.parse(await file.text()); } catch { throw new Error('Choose a valid JSON file.'); }
    rejectSecrets(raw);
    if(raw && typeof raw==='object' && !Array.isArray(raw) && raw.model && Array.isArray(raw.levels)) return {model:raw};
    const list=Array.isArray(raw)?raw:raw?.criteria;
    if(!Array.isArray(list)) throw new Error('No criteria were found in this file.');
    return {rows:list.map(item=>rowFromObject(item,'pqcmm')).filter(Boolean)};
  }
  if(extension==='csv') return {rows:tableRows(parseCsv(await file.text()),'pqcmm').map(item=>rowFromObject(item,'pqcmm')).filter(Boolean)};
  if(extension==='xlsx') return {rows:(await xlsxRows(file,'pqcmm')).map(item=>rowFromObject(item,'pqcmm')).filter(Boolean)};
  throw new Error('Choose a .json, .csv, or .xlsx file.');
}

function cycloneDxRows(raw,kind) {
  if(raw?.bomFormat!=='CycloneDX') return null;
  if(kind==='boms') {
    const components=Array.isArray(raw.components)?raw.components:[];
    const crypto=components.some(item=>item?.type==='cryptographic-asset');
    const software=components.some(item=>item?.type && item.type!=='cryptographic-asset');
    const bomKind=crypto?(software?'Combined SBOM and CBOM':'CBOM'):'SBOM';
    const authors=Array.isArray(raw.metadata?.authors)?raw.metadata.authors:[];
    const lifecycles=Array.isArray(raw.metadata?.lifecycles)?raw.metadata.lifecycles:[];
    const tools=Array.isArray(raw.metadata?.tools?.components)?raw.metadata.tools.components:[];
    return [{kind:bomKind,serial:raw.serialNumber || '',version:String(raw.version||''),target:raw.metadata?.component?.name || '',release:raw.metadata?.component?.version || '',supplier:raw.metadata?.component?.supplier?.name || '',author:authors.map(item=>item.name).join(', '),created:typeof raw.metadata?.timestamp==='string'?raw.metadata.timestamp.slice(0,10):'',lifecycle:lifecycles.map(item=>item.phase).join(', '),tool:tools.map(item=>`${item.name||''} ${item.version||''}`.trim()).join(', '),composition:'Not independently checked',notes:`CycloneDX ${raw.specVersion||'unknown'} imported as a review record. Check scope, completeness, and authenticity.`}];
  }
  if(kind==='crypto') return (Array.isArray(raw.components)?raw.components:[]).filter(item=>item?.type==='cryptographic-asset').slice(0,MAX_ROWS).map(item=>({current:item.name||'',component:item.group||'',cbomRef:item['bom-ref']||'',assetType:item.cryptoProperties?.assetType||'',parameter:item.cryptoProperties?.algorithmProperties?.parameterSetIdentifier||'',coverage:'Listed in imported CBOM. Deployed use and path have not been observed.'}));
  throw new Error('A CycloneDX BOM is not a buyer proof register. Import proof records as a JSON array or Excel table.');
}

export async function parseRecordImport(file,kind) {
  if(file.size>MAX_FILE) throw new Error('The import file must be 6 MB or less.');
  const extension=file.name.toLowerCase().split('.').pop();
  let rawRows, bomCheck=null;
  if(extension==='xlsx') rawRows=await xlsxRows(file,kind);
  else if(extension==='csv') rawRows=tableRows(parseCsv(await file.text()),kind);
  else if(extension==='json') {
    let raw;
    try { raw=JSON.parse(await file.text()); } catch { throw new Error('Choose a valid JSON file.'); }
    rejectSecrets(raw);
    rawRows=cycloneDxRows(raw,kind) || (Array.isArray(raw)?raw:raw?.assessment?.[kind] || raw?.[kind]);
    // The check runs on the parsed file itself; its results never come from fields the file supplies.
    if(kind==='boms' && raw?.bomFormat==='CycloneDX') bomCheck=await checkCycloneDx(raw);
  } else throw new Error('Choose a .json, .csv, or .xlsx file. Save older .xls files as .xlsx first.');
  if(!Array.isArray(rawRows) || !rawRows.length) throw new Error('No matching records were found in this file.');
  if(rawRows.length>MAX_ROWS) throw new Error('Import at most 100 records at a time.');
  rejectSecrets(rawRows);
  const rows=rawRows.map(item=>rowFromObject(item,kind)).filter(Boolean);
  if(!rows.length) throw new Error('The file has no recognized fields for this section.');
  return {rows,kind,fileName:file.name,bomCheck};
}
