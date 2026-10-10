// Packet format shared by the replay harness (tools/replay) and the browser import.
import {tests} from './content.js';

export const REPLAY_FORMAT = 'pqc-replay-packet';
const RESULT = {matched:'Observed', recorded:'Observed', contradicted:'Failed', inconclusive:'Inconclusive'};
const RANK = {Observed:0, Inconclusive:1, Failed:2};
const text = value => typeof value === 'string' ? value.slice(0, 2000) : '';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

// The digest covers every field except itself, so any later edit to the packet changes it.
// It detects alteration; it does not prove who ran the harness.
export function packetDigestInput(packet) {
  const {digest, ...rest} = packet;
  return canonicalJson(rest);
}

// Turns an authorized-target packet into one unreviewed evidence record and proposed test results.
// The reviewer still has to confirm the target was the offered build and path, link each test to its
// crypto use, and sign the result before the scorecard counts it.
export function planReplayImport(packet, state, {digestVerified = false, evidenceId = ''} = {}) {
  if (packet?.format !== REPLAY_FORMAT || packet.version !== 1 || !Array.isArray(packet.scenarios) || !packet.subject || typeof packet.subject !== 'object')
    throw new Error('This file is not a supported replay packet.');
  if (packet.subject.kind === 'local-fixture')
    throw new Error('This packet comes from the harness self-test on local fixtures. It calibrates the probes; it is not evidence about a product.');
  if (packet.subject.kind !== 'authorized-target') throw new Error('This file is not a supported replay packet.');
  const valid = new Set([...tests.map(item => item[0]), ...(state.customTests || []).map(item => item.id)]);
  const target = `${text(packet.subject.host)}:${Number(packet.subject.port) || ''}`;
  // Packets from harness 1.0 carry no protocol; they were all TLS.
  const protocol = ({tls:'TLS', ssh:'SSH', ike:'IKEv2'})[text(packet.subject.protocol) || 'tls'] || 'TLS';
  const tool = `${text(packet.harness?.name)} ${text(packet.harness?.version)} (Node ${text(packet.harness?.node)}, OpenSSL ${text(packet.harness?.openssl)})`;
  const source = `packet ${text(packet.digest).slice(0, 12) || 'without digest'} from ${target} (${text(packet.subject.servername)})`;
  const negatives = packet.scenarios.filter(item => item?.expected?.rejected).map(item => `${text(item.title)}: ${text(item.detail)}`).join(' ');
  const limits = `${text(packet.limits)} One client probed one target address; internal legs, other regions, and certificate or host-key signature migration were not observed.`;
  const linked = [], updates = [], skipped = [];
  for (const scenario of packet.scenarios) {
    for (const testId of Array.isArray(scenario?.testIds) ? scenario.testIds : []) {
      if (!valid.has(testId)) throw new Error(`The packet names an unknown test: ${text(testId)}.`);
      if (!linked.includes(testId)) linked.push(testId);
      if (state.tests?.[testId]?.result) { if (!skipped.includes(testId)) skipped.push(testId); continue; }
      const result = RESULT[scenario.outcome] || 'Inconclusive';
      const line = `${text(scenario.title)}: ${text(scenario.detail)}`;
      const existing = updates.find(update => update.testId === testId);
      if (existing) {
        existing.fields.observed += ` ${line}`;
        if (RANK[result] > RANK[existing.fields.result]) existing.fields.result = result;
        continue;
      }
      updates.push({testId, fields:{result, observed:`Recorded by the replay harness. ${line}`, negative:negatives || 'No negative control in this packet.',
        limits, toolVersion:tool, productBuild:text(packet.subject.build), replaySource:source}});
    }
  }
  const outcomes = packet.scenarios.map(item => `${text(item?.id)} ${text(item?.outcome)}`).join(', ');
  const evidence = {id:evidenceId, type:'Test trace', producer:'Buyer', artifact:`${protocol} replay packet from ${target}`, issuer:tool,
    date:text(packet.generatedAt).slice(0, 10), productMatch:'Unsure', pathMatch:'Unsure', location:`Replay ${source}`, result:'Not reviewed',
    sensitivity:'Customer confidential', linkedIds:linked, attachmentName:'', attachmentType:'', attachmentSize:0,
    note:`Harness outcomes: ${outcomes}. Digest ${digestVerified ? 'verified on import' : 'not verified'}. Confirm the target was the offered product build and path before accepting this record.`};
  return {evidence, updates, skipped, target, protocol};
}
