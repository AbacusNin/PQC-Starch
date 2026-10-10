// Maturity criteria imported for review. Each criterion keeps the level, tags, and source its publisher gave it.
// The workbook records the reviewer's status per criterion and counts results per stated level. It never
// computes an overall maturity level: that is a certification decision, and PKI Consortium had not launched
// PQCMM certification as of October 2026.
import {containsSecret} from './secrets.js';

export const STATUSES = ['Not assessed', 'Met', 'Partial', 'Not met'];
export const MAX_CRITERIA = 300;
const text = (value, limit = 4000) => typeof value === 'string' ? value.trim().slice(0, limit) : (typeof value === 'number' ? String(value) : '');
const webAddress = value => /^https?:\/\/[^\s]+$/i.test(text(value, 500)) ? text(value, 500) : '';
const KEY = /^[A-Z][A-Z0-9.-]{0,59}$/;

// A level is a whole number from 0 to 9, written as 3, "3", "Level 3", or "L3". Anything else is no level.
export function parseLevel(value) {
  const match = /^(?:level\s*|l)?(\d)$/i.exec(text(value, 20));
  return match ? Number(match[1]) : null;
}

const keyFor = (prefix, id) => {
  const raw = text(id, 50).toUpperCase().replace(/\s+/g, '-');
  return /^[A-Z]/.test(raw) && !prefix ? raw : `${prefix || 'CRIT'}-${raw}`;
};

function refuseSecrets(value) {
  if (containsSecret(value)) throw new Error('This file appears to contain secret key material. Remove it before importing.');
}

export function criteriaFromModel(model, {validate, provenance = null} = {}) {
  refuseSecrets(model);
  if (validate && validate(model).length) throw new Error('This file does not match the PQCMM model schema, so it was not imported.');
  const info = model?.model || {};
  const prefix = text(info.abbreviation, 20).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CRIT';
  const version = text(info.version, 20);
  let origin = '';
  try { origin = new URL(text(info.canonicalUrl, 500)).origin; } catch { origin = ''; }
  const criteria = (Array.isArray(model?.levels) ? model.levels : []).flatMap(level => {
    const levelName = text(level.name, 60);
    const page = origin && /^\/[^\s]*$/.test(text(level.sourcePage, 300)) ? `${origin}${text(level.sourcePage, 300)}` : '';
    return (level.criteria?.items || []).map(item => ({
      key:keyFor(prefix, item.id), id:text(item.id, 40), level:Number.isInteger(level.number) ? level.number : null, levelName,
      text:text(item.text), tags:[`${text(info.abbreviation, 20)} ${version}`.trim(), `Level ${level.number} ${levelName}`.trim()], source:page
    }));
  });
  return finish(criteria, {name:text(info.name, 120), version, publisher:provenance?.publisher || '', url:webAddress(info.canonicalUrl),
    license:provenance ? `${provenance.license}; ${provenance.copyright}` : '', release:provenance?.release || ''});
}

export function criteriaFromRows(rows, fileName) {
  refuseSecrets(rows);
  const criteria = rows.map(row => {
    const level = parseLevel(row.level);
    return {key:keyFor('', row.id), id:text(row.id, 40), level, levelName:level === null ? '' : text(row.levelName, 60),
      text:text(row.text), tags:text(row.tags, 600).split(/[;,]/).map(tag => tag.trim().slice(0, 60)).filter(Boolean).slice(0, 20), source:webAddress(row.source)};
  });
  return finish(criteria, {name:text(fileName, 120), version:'', publisher:'', url:'', license:'', release:''});
}

function finish(criteria, source) {
  if (criteria.length > MAX_CRITERIA) throw new Error(`Import at most ${MAX_CRITERIA} criteria at a time.`);
  const seen = new Set();
  for (const item of criteria) {
    if (!item.id || !item.text || !KEY.test(item.key)) throw new Error('Each criterion needs an ID and criterion text.');
    if (seen.has(item.key)) throw new Error(`Criterion ${item.key} appears twice.`);
    seen.add(item.key);
  }
  if (!criteria.length) throw new Error('No criteria were found in this file.');
  return {source:{...source, importedAt:new Date().toISOString()}, criteria};
}

// Counts the reviewer's results per stated level. Criteria without a level are counted under level null.
export function levelSummary(criteria, reviews = {}) {
  const byLevel = new Map();
  for (const item of criteria) {
    const entry = byLevel.get(item.level) || {level:item.level, name:item.levelName, total:0, met:0, partial:0, notMet:0, notAssessed:0};
    const status = reviews[item.key]?.status || 'Not assessed';
    entry.total++;
    if (status === 'Met') entry.met++; else if (status === 'Partial') entry.partial++; else if (status === 'Not met') entry.notMet++; else entry.notAssessed++;
    byLevel.set(item.level, entry);
  }
  return [...byLevel.values()].sort((a, b) => (a.level ?? 99) - (b.level ?? 99));
}

// Renders the publisher's light markdown (bold only) as safe HTML.
export function criterionHtml(value, escapeHtml) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
