// PQC replay harness: repeatable probes that record which key-establishment method a server selects and
// whether it refuses classical-only clients, for TLS 1.3, SSH, and IKEv2.
//
//   node tools/replay/replay.mjs self-test [--out packet.json]
//   node tools/replay/replay.mjs probe --target host:port --authorized [--protocol tls|ssh|ike]
//        [--require-hybrid] [--build "release label"] [--out packet.json]
//        TLS:  [--servername name] [--ca ca.pem]      SSH: [--host-key SHA256:fingerprint]
//
// self-test runs only against loopback fixtures it creates. probe connects to one target the operator is
// authorized to test. TLS probes are ordinary handshakes. SSH probes stop after the key exchange reply and
// never authenticate. IKEv2 probes stop after IKE_INTERMEDIATE and never send IKE_AUTH.
import tls from 'node:tls';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {selfSignedCertificate} from './fixture-cert.mjs';
import {sshKeyExchange, startSshFixture, HYBRID_KEX, PQ_KEX_NAMES} from './ssh.mjs';
import {ikeProbe, startIkeFixture, KE} from './ike.mjs';
import {REPLAY_FORMAT, packetDigestInput} from '../../web/replay-format.js';

export const HARNESS = {name:'pqc-replay-harness', version:'1.1.0'};
const HYBRID = 'X25519MLKEM768', CLASSICAL = 'X25519', OTHER_HYBRID = 'SecP384r1MLKEM1024';
const WRONG_NAME = 'pqc-replay-wrong-name.invalid';
const UNTRUSTED = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'CERT_UNTRUSTED']);
const BAD_CERTIFICATE = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_REVOKED', 'ERR_TLS_CERT_ALTNAME_INVALID']);

export const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex');

export async function startFixture({groups, name = 'localhost'}) {
  const {cert, key} = selfSignedCertificate(name);
  // The client closes first, so a TLS 1.3 session ticket has time to arrive for the resumption probe.
  const server = tls.createServer({cert, key, minVersion:'TLSv1.3', ecdhCurve:groups}, socket => socket.resume().on('end', () => socket.end()));
  // Negative controls end in refused handshakes by design; the client side records them.
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {port:server.address().port, cert, close:() => new Promise(resolve => server.close(resolve))};
}

function handshake({host, port, servername, ca, groups, session, waitForSession = false, timeoutMs = 5000}) {
  return new Promise(resolve => {
    let settled = false, result = null;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const socket = tls.connect({host, port, servername, ca, session, minVersion:'TLSv1.3', ecdhCurve:groups}, () => {
      const peer = socket.getPeerX509Certificate();
      result = {group:socket.getEphemeralKeyInfo()?.name || '', protocol:socket.getProtocol(), cipher:socket.getCipher()?.name || '',
        authorized:socket.authorized, reused:socket.isSessionReused(),
        certificate:peer ? {subject:peer.subject, subjectAltName:peer.subjectAltName || '', keyType:peer.publicKey.asymmetricKeyType, validTo:peer.validTo} : null};
      if (!waitForSession) { socket.end(); finish(result); }
    });
    // TLS 1.3 session tickets arrive after the handshake completes.
    socket.on('session', ticket => { if (waitForSession && result) { socket.end(); finish({...result, session:ticket}); } });
    socket.setTimeout(timeoutMs, () => { socket.destroy(); finish(result ? {...result, session:null} : {error:'TIMEOUT'}); });
    socket.on('error', error => finish(result || {error:error.code || error.message}));
    // A peer that closes without an error or a ticket would otherwise leave the probe waiting forever.
    socket.on('close', () => finish(result ? {...result, session:null} : {error:'CLOSED'}));
  });
}

function classify(observed) {
  if (!observed.error) return 'connected';
  if (UNTRUSTED.has(observed.error)) return 'untrusted';
  if (BAD_CERTIFICATE.has(observed.error)) return 'certificate-rejected';
  if (observed.error.startsWith('ERR_SSL')) return 'handshake-rejected';
  return 'tool-error';
}

// Outcomes: matched or contradicted against a stated expectation, recorded when nothing was expected,
// and inconclusive when the probe itself could not establish a result. A probe failure is never a product failure.
function scenario({id, testIds, title, offered, expected, observed, identity = false}) {
  const kind = classify(observed);
  const {session, ...kept} = observed;
  let outcome, detail;
  if (kind === 'tool-error') { outcome = 'inconclusive'; detail = `The probe could not complete (${observed.error}). This says nothing about the product.`; }
  else if (kind === 'untrusted') { outcome = 'inconclusive'; detail = `The certificate chain was not trusted (${observed.error}). Supply the issuing CA with --ca to check identity.`; }
  else if (kind === 'certificate-rejected' && !identity) { outcome = 'inconclusive'; detail = `Certificate verification failed (${observed.error}) before the negotiated group could be read.`; }
  else {
    kept.rejected = kind !== 'connected';
    if (!expected) outcome = 'recorded';
    else if ('rejected' in expected) outcome = expected.rejected === kept.rejected ? 'matched' : 'contradicted';
    else if ('group' in expected) outcome = !kept.rejected && kept.group === expected.group ? 'matched' : 'contradicted';
    else if ('authorized' in expected) outcome = !kept.rejected && kept.authorized === expected.authorized ? 'matched' : 'contradicted';
    else if ('reused' in expected) outcome = !kept.rejected && kept.reused === expected.reused ? 'matched' : 'contradicted';
    detail = kept.rejected ? `Handshake refused (${observed.error}).`
      : `${kept.protocol} selected ${kept.group || 'an unreported group'}${kept.reused ? ' on a resumed session' : ''}${kept.certificate ? `; server certificate key type ${kept.certificate.keyType}` : ''}.`;
  }
  return {id, testIds, title, offered, expected:expected || null, observed:kept, outcome, detail};
}

async function resumption(base, groups, expected) {
  const first = await handshake({...base, groups, waitForSession:true});
  if (first.error) return scenario({id:'resumption', testIds:['T11'], title:'A second connection resuming the first session', offered:groups, expected, observed:first});
  if (!first.session) return {id:'resumption', testIds:['T11'], title:'A second connection resuming the first session', offered:groups, expected:expected || null,
    observed:{reused:false}, outcome:'inconclusive', detail:'The server issued no session ticket within the timeout, so resumption could not be tried.'};
  const second = await handshake({...base, groups, session:first.session});
  return scenario({id:'resumption', testIds:['T11'], title:'A second connection resuming the first session', offered:groups, expected, observed:second});
}

// ---- SSH ----
const SSH_HYBRID_OFFER = [HYBRID_KEX, 'curve25519-sha256', 'ecdh-sha2-nistp256'];
const SSH_CLASSICAL_OFFER = ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256'];

function sshScenario({id, testIds, title, offered, expected, observed, advertised = false}) {
  const kept = observed.error ? {error:observed.error} : {kex:observed.kex || null, hostKeyAlgorithm:observed.hostKeyAlgorithm || null, rejected:Boolean(observed.rejected),
    completed:Boolean(observed.completed), signatureValid:observed.signatureValid ?? null, hostKey:observed.hostKey || null,
    serverPostQuantum:(observed.serverKex || []).filter(name => PQ_KEX_NAMES.includes(name)), reason:observed.reason || ''};
  let outcome, detail;
  if (observed.error) { outcome = 'inconclusive'; detail = `The probe could not complete (${observed.error}). This says nothing about the product.`; }
  else if (advertised) { outcome = 'recorded'; detail = kept.serverPostQuantum.length ? `The server advertises ${kept.serverPostQuantum.join(', ')}.` : 'The server advertises no post-quantum key exchange method.'; }
  else if (expected && 'signatureValid' in expected) {
    outcome = kept.completed && kept.signatureValid === expected.signatureValid ? 'matched' : 'contradicted';
    detail = kept.signatureValid ? 'The host signature over the exchange verified.' : 'The host signature over the exchange did not verify, so the exchange was not counted as confirmed.';
  } else if (kept.completed && !kept.signatureValid) {
    outcome = 'inconclusive';
    detail = `${kept.kex} was negotiated, but the host signature over the exchange did not verify. That can mean interception, a server fault, or a harness fault, so it is not counted either way.`;
  } else {
    if (!expected) outcome = 'recorded';
    else if ('rejected' in expected) outcome = expected.rejected === kept.rejected ? 'matched' : 'contradicted';
    else if ('kex' in expected) outcome = !kept.rejected && kept.kex === expected.kex ? 'matched' : 'contradicted';
    else if ('fingerprint' in expected) outcome = kept.completed && kept.hostKey?.fingerprint === expected.fingerprint ? 'matched' : 'contradicted';
    detail = kept.rejected ? `Key exchange refused (${kept.reason}).`
      : `${kept.kex} negotiated${kept.completed ? ` and confirmed by a valid ${kept.hostKey?.signatureType} host signature; host key ${kept.hostKey?.fingerprint}` : ` (${kept.reason})`}.`;
  }
  return {id, testIds, title, offered, expected:expected || null, observed:kept, outcome, detail};
}

async function sshScenarios({host, port, requireHybrid, expectHostKey, timeoutMs}) {
  const hybrid = await sshKeyExchange({host, port, kex:SSH_HYBRID_OFFER, timeoutMs});
  const classical = await sshKeyExchange({host, port, kex:SSH_CLASSICAL_OFFER, timeoutMs});
  return [
    sshScenario({id:'ssh-hybrid-offer', testIds:['T19'], title:'SSH: mlkem768x25519-sha256 offered first, classical methods after', offered:SSH_HYBRID_OFFER.join(','), expected:{kex:HYBRID_KEX}, observed:hybrid}),
    sshScenario({id:'ssh-pq-methods', testIds:['T19'], title:'SSH: post-quantum methods the server advertises', offered:'server method list', expected:null, observed:hybrid, advertised:true}),
    sshScenario({id:'ssh-classical-only', testIds:requireHybrid ? ['T19', 'T15'] : ['T19'], title:'SSH: only classical methods offered', offered:SSH_CLASSICAL_OFFER.join(','), expected:requireHybrid ? {rejected:true} : null, observed:classical}),
    sshScenario({id:'ssh-host-key', testIds:['T19'], title:'SSH: host key presented during the hybrid exchange', offered:'host key fingerprint', expected:expectHostKey ? {fingerprint:expectHostKey} : null, observed:hybrid})
  ];
}

// ---- IKEv2 ----
function ikeScenario({id, testIds, title, offered, expected, observed}) {
  const kept = observed.error ? {error:observed.error} : {rejected:Boolean(observed.rejected), reason:observed.reason || '', chosen:observed.chosen || null, intermediate:observed.intermediate || null};
  const additional = kept.chosen?.additional;
  let outcome, detail;
  if (observed.error) { outcome = 'inconclusive'; detail = `The probe could not complete (${observed.error}). This says nothing about the product.`; }
  else if (expected && 'intermediate' in expected) {
    outcome = kept.intermediate && kept.intermediate.completed === expected.intermediate ? 'matched' : 'contradicted';
    detail = kept.intermediate?.completed ? 'The IKE_INTERMEDIATE reply decrypted and carried an ML-KEM ciphertext.' : `The IKE_INTERMEDIATE exchange was not confirmed: ${kept.intermediate?.reason || 'no reply'}.`;
  } else if (expected?.additional && kept.rejected) {
    outcome = 'inconclusive';
    detail = `The responder chose none of the probe's proposals (${kept.reason}). The probe offers only AES-GCM with SHA-2 PRFs and Curve25519, P-256, or P-384, so this may reflect the probe's limits rather than the product.`;
  } else if (expected?.additional && KE_RESULT(additional) && kept.intermediate && !kept.intermediate.completed) {
    outcome = 'inconclusive';
    detail = `${additional} was chosen, but the IKE_INTERMEDIATE exchange was not confirmed: ${kept.intermediate.reason}.`;
  } else {
    if (!expected) outcome = 'recorded';
    else if ('rejected' in expected) outcome = expected.rejected === kept.rejected ? 'matched' : 'contradicted';
    else outcome = additional === expected.additional ? 'matched' : 'contradicted';
    detail = kept.rejected ? `Proposal refused (${kept.reason}).`
      : `${kept.chosen.encryption}, ${kept.chosen.classical}, additional key exchange ${additional}${kept.intermediate?.completed ? `; IKE_INTERMEDIATE returned a ${kept.intermediate.ciphertextBytes}-byte ${kept.intermediate.method} ciphertext` : ''}.`;
  }
  return {id, testIds, title, offered, expected:expected || null, observed:kept, outcome, detail};
}
const KE_RESULT = name => /^ml-kem/.test(name || '');

async function ikeScenarios({host, port, requireHybrid, timeoutMs}) {
  const hybrid = await ikeProbe({host, port, addke:[KE.MLKEM768, KE.NONE], timeoutMs});
  const classical = await ikeProbe({host, port, addke:[], timeoutMs});
  const strong = await ikeProbe({host, port, addke:[KE.MLKEM1024], timeoutMs});
  return [
    ikeScenario({id:'ike-hybrid-offer', testIds:['T20'], title:'IKEv2: ML-KEM-768 offered as an optional additional key exchange', offered:'Curve25519, P-256, or P-384 plus ADDKE1 ml-kem-768 or none', expected:{additional:'ml-kem-768'}, observed:hybrid}),
    ikeScenario({id:'ike-classical-only', testIds:requireHybrid ? ['T20', 'T15'] : ['T20'], title:'IKEv2: no additional key exchange offered', offered:'Curve25519, P-256, or P-384 only', expected:requireHybrid ? {rejected:true} : null, observed:classical}),
    ikeScenario({id:'ike-mlkem-1024', testIds:['T20'], title:'IKEv2: only ML-KEM-1024 offered as ADDKE1', offered:'ADDKE1 ml-kem-1024, required', expected:null, observed:strong})
  ];
}

function packet(subject, policy, scenarios, limits) {
  const body = {format:REPLAY_FORMAT, version:1, generatedAt:new Date().toISOString(),
    harness:{...HARNESS, node:process.version, openssl:process.versions.openssl}, subject, policy, scenarios, limits};
  return {...body, digest:sha256Hex(packetDigestInput(body))};
}

export async function runSelfTest() {
  const both = `${HYBRID}:${CLASSICAL}`;
  const fixtures = await Promise.all([startFixture({groups:both}), startFixture({groups:HYBRID}), startFixture({groups:both, name:'wrong.example'})]);
  const [mixed, strict, misnamed] = fixtures;
  const at = (fixture, extra) => ({host:'127.0.0.1', port:fixture.port, servername:'localhost', ca:fixture.cert, ...extra});
  try {
    const scenarios = [
      scenario({id:'hybrid-offer', testIds:['T01'], title:'Hybrid and classical offered to a server that supports both', offered:both, expected:{group:HYBRID}, observed:await handshake(at(mixed, {groups:both}))}),
      scenario({id:'classical-fallback', testIds:['T02'], title:'Only classical offered to a server that allows fallback', offered:CLASSICAL, expected:{group:CLASSICAL}, observed:await handshake(at(mixed, {groups:CLASSICAL}))}),
      scenario({id:'classical-only', testIds:['T02', 'T15'], title:'Only classical offered to a hybrid-only server', offered:CLASSICAL, expected:{rejected:true}, observed:await handshake(at(strict, {groups:CLASSICAL}))}),
      scenario({id:'unsupported-group', testIds:['T03'], title:'Only an unsupported hybrid group offered', offered:OTHER_HYBRID, expected:{rejected:true}, observed:await handshake(at(strict, {groups:OTHER_HYBRID}))}),
      scenario({id:'identity', testIds:['T04'], title:'Certificate checked against the server name', offered:both, expected:{authorized:true}, identity:true, observed:await handshake(at(mixed, {groups:both}))}),
      scenario({id:'wrong-name', testIds:['T04'], title:'A server presenting a certificate for another name', offered:both, expected:{rejected:true}, identity:true, observed:await handshake(at(misnamed, {groups:both}))}),
      await resumption(at(mixed, {}), both, {reused:true}),
      ...await sshSelfTest(),
      ...await ikeSelfTest()
    ];
    return packet({kind:'local-fixture', protocol:'tls, ssh, ike', host:'127.0.0.1', port:null, servername:'localhost', build:'Harness self-test fixtures'}, {expectGroup:HYBRID, requireHybrid:true}, scenarios,
      'Loopback fixtures created by the harness. They show the probes tell hybrid from classical negotiation in TLS, SSH, and IKEv2, catch name mismatches, and refuse to count an exchange whose signature or reply does not check out. They say nothing about any product.');
  } finally { await Promise.all(fixtures.map(fixture => fixture.close())); }
}

async function sshSelfTest() {
  const [mixed, strict, tampered] = await Promise.all([startSshFixture({kex:[HYBRID_KEX, 'curve25519-sha256']}), startSshFixture({kex:[HYBRID_KEX]}),
    startSshFixture({kex:[HYBRID_KEX, 'curve25519-sha256'], badSignature:true})]);
  const at = (fixture, kex) => sshKeyExchange({host:'127.0.0.1', port:fixture.port, kex});
  try {
    return [
      sshScenario({id:'ssh-hybrid-offer', testIds:['T19'], title:'SSH: hybrid and classical offered to a server that supports both', offered:SSH_HYBRID_OFFER.join(','), expected:{kex:HYBRID_KEX}, observed:await at(mixed, SSH_HYBRID_OFFER)}),
      sshScenario({id:'ssh-classical-fallback', testIds:['T19'], title:'SSH: only classical offered to a server that allows fallback', offered:SSH_CLASSICAL_OFFER.join(','), expected:{kex:'curve25519-sha256'}, observed:await at(mixed, SSH_CLASSICAL_OFFER)}),
      sshScenario({id:'ssh-classical-only', testIds:['T19', 'T15'], title:'SSH: only classical offered to a hybrid-only server', offered:SSH_CLASSICAL_OFFER.join(','), expected:{rejected:true}, observed:await at(strict, SSH_CLASSICAL_OFFER)}),
      sshScenario({id:'ssh-host-key', testIds:['T19'], title:'SSH: host key matches the fixture\'s known fingerprint', offered:'host key fingerprint', expected:{fingerprint:mixed.fingerprint}, observed:await at(mixed, SSH_HYBRID_OFFER)}),
      sshScenario({id:'ssh-tampered-signature', testIds:['T19'], title:'SSH: a server whose host signature over the hybrid exchange is corrupted', offered:SSH_HYBRID_OFFER.join(','), expected:{signatureValid:false}, observed:await at(tampered, SSH_HYBRID_OFFER)})
    ];
  } finally { await Promise.all([mixed, strict, tampered].map(fixture => fixture.close())); }
}

async function ikeSelfTest() {
  const [optional, required, broken] = await Promise.all([startIkeFixture({support:[KE.MLKEM768]}), startIkeFixture({support:[KE.MLKEM768], require:true}),
    startIkeFixture({support:[KE.MLKEM768], wrongKeys:true})]);
  const at = (fixture, addke) => ikeProbe({host:'127.0.0.1', port:fixture.port, addke});
  try {
    return [
      ikeScenario({id:'ike-hybrid-offer', testIds:['T20'], title:'IKEv2: optional ML-KEM-768 offered to a responder that supports it', offered:'ADDKE1 ml-kem-768 or none', expected:{additional:'ml-kem-768'}, observed:await at(optional, [KE.MLKEM768, KE.NONE])}),
      ikeScenario({id:'ike-classical-fallback', testIds:['T20'], title:'IKEv2: no additional key exchange offered to a responder that allows it', offered:'classical only', expected:{additional:'none'}, observed:await at(optional, [])}),
      ikeScenario({id:'ike-classical-only', testIds:['T20', 'T15'], title:'IKEv2: no additional key exchange offered to a responder that requires ML-KEM', offered:'classical only', expected:{rejected:true}, observed:await at(required, [])}),
      ikeScenario({id:'ike-unreadable-reply', testIds:['T20'], title:'IKEv2: a responder whose IKE_INTERMEDIATE reply does not decrypt', offered:'ADDKE1 ml-kem-768 or none', expected:{intermediate:false}, observed:await at(broken, [KE.MLKEM768, KE.NONE])})
    ];
  } finally { await Promise.all([optional, required, broken].map(fixture => fixture.close())); }
}

const LIMITS = {
  ssh:(host, port) => `SSH key exchanges from one client to ${host}:${port} at one point in time. The probe stops after the key exchange reply and never authenticates, so user authentication and later rekeying were not observed. The host key and its signature are classical in every method tested.`,
  ike:(host, port) => `IKEv2 IKE_SA_INIT and one IKE_INTERMEDIATE exchange from one initiator to ${host}:${port}. The probe never sends IKE_AUTH, so authentication, child SAs, and rekeying were not observed. ML-KEM decapsulation cannot detect a malformed ciphertext, so a completed exchange shows the responder returned an ML-KEM ciphertext of the right size inside a reply authenticated under the classical keys; it does not prove the post-quantum secret was mixed into later keys.`
};

export async function probeTarget({protocol = 'tls', host, port, servername = host, ca, requireHybrid = false, expectGroup = HYBRID, expectHostKey = '', build = '', timeoutMs = 5000}) {
  if (protocol === 'ssh') return packet({kind:'authorized-target', protocol, host, port, servername:host, build}, {requireHybrid, expectKex:HYBRID_KEX, expectHostKey:expectHostKey || null},
    await sshScenarios({host, port, requireHybrid, expectHostKey, timeoutMs:Math.max(timeoutMs, 8000)}), LIMITS.ssh(host, port));
  if (protocol === 'ike') return packet({kind:'authorized-target', protocol, host, port, servername:host, build}, {requireHybrid, expectAdditional:'ml-kem-768'},
    await ikeScenarios({host, port, requireHybrid, timeoutMs:Math.max(timeoutMs, 6000)}), LIMITS.ike(host, port));
  if (protocol !== 'tls') throw new Error('Choose --protocol tls, ssh, or ike.');
  const both = `${expectGroup}:${CLASSICAL}`;
  const base = {host, port, servername, ca, timeoutMs};
  const scenarios = [
    scenario({id:'hybrid-offer', testIds:['T01'], title:'Hybrid and classical offered on a fresh connection', offered:both, expected:{group:expectGroup}, observed:await handshake({...base, groups:both})}),
    scenario({id:'classical-only', testIds:requireHybrid ? ['T02', 'T15'] : ['T02'], title:'Only a classical group offered', offered:CLASSICAL, expected:requireHybrid ? {rejected:true} : null, observed:await handshake({...base, groups:CLASSICAL})}),
    scenario({id:'unsupported-group', testIds:['T03'], title:`Only ${OTHER_HYBRID} offered`, offered:OTHER_HYBRID, expected:null, observed:await handshake({...base, groups:OTHER_HYBRID})}),
    scenario({id:'identity', testIds:['T04'], title:'Certificate checked against the expected server name', offered:both, expected:{authorized:true}, identity:true, observed:await handshake({...base, groups:both})}),
    scenario({id:'wrong-name', testIds:['T04'], title:'Certificate checked against a deliberately wrong name', offered:both, expected:{rejected:true}, identity:true, observed:await handshake({...base, servername:WRONG_NAME, groups:both})}),
    await resumption(base, both, null)
  ];
  return packet({kind:'authorized-target', protocol:'tls', host, port, servername, build}, {expectGroup, requireHybrid}, scenarios,
    `Fresh and resumed TLS 1.3 connections from one client to ${host}:${port} at one point in time.`);
}

async function main() {
  const {positionals, values} = parseArgs({allowPositionals:true, options:{target:{type:'string'}, servername:{type:'string'}, ca:{type:'string'},
    'require-hybrid':{type:'boolean'}, build:{type:'string'}, authorized:{type:'boolean'}, out:{type:'string'}, protocol:{type:'string'}, 'host-key':{type:'string'}}});
  let result;
  if (positionals[0] === 'self-test') result = await runSelfTest();
  else if (positionals[0] === 'probe') {
    if (!values.authorized) throw new Error('Probe only systems you are authorized to test, then pass --authorized to confirm.');
    const match = /^(.+):(\d{1,5})$/.exec(values.target || '');
    if (!match) throw new Error('Name one target as --target host:port.');
    const protocol = (values.protocol || 'tls').toLowerCase();
    if (values['host-key'] && !/^SHA256:[A-Za-z0-9+/]{43}$/.test(values['host-key'])) throw new Error('Give --host-key as SHA256: followed by the 43-character fingerprint, as ssh-keygen -l prints it.');
    result = await probeTarget({protocol, host:match[1].replace(/^\[|\]$/g, ''), port:Number(match[2]), servername:values.servername || match[1],
      ca:values.ca ? await fs.readFile(values.ca, 'utf8') : undefined, requireHybrid:Boolean(values['require-hybrid']), expectHostKey:values['host-key'] || '', build:values.build || ''});
  } else throw new Error('Usage: replay.mjs self-test | probe --target host:port --authorized [--protocol tls|ssh|ike] [options]');
  for (const item of result.scenarios) process.stderr.write(`${item.outcome.padEnd(12)} ${item.id.padEnd(18)} ${item.detail}\n`);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (values.out) { await fs.writeFile(values.out, json); process.stderr.write(`Packet written to ${values.out}\n`); }
  else process.stdout.write(json);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
