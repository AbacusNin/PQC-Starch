import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import {selfSignedCertificate} from '../fixture-cert.mjs';
import {runSelfTest, probeTarget, startFixture, sha256Hex} from '../replay.mjs';
import {packetDigestInput} from '../../../web/replay-format.js';

const byId = packet => Object.fromEntries(packet.scenarios.map(scenario => [scenario.id, scenario]));

test('the fixture certificate is self-signed, verifiable, and bound to its names', () => {
  const {cert} = selfSignedCertificate('localhost');
  const x509 = new crypto.X509Certificate(cert);
  assert.equal(x509.verify(x509.publicKey), true);
  assert.equal(x509.checkHost('localhost'), 'localhost');
  assert.equal(x509.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(x509.checkHost('wrong.example'), undefined);
});

test('the self-test observes every expected fixture behavior', async () => {
  const packet = await runSelfTest();
  assert.equal(packet.subject.kind, 'local-fixture');
  assert.deepEqual(packet.scenarios.filter(s => s.outcome !== 'matched').map(s => `${s.id}: ${s.outcome} ${s.detail}`), []);
  const s = byId(packet);
  assert.equal(s['hybrid-offer'].observed.group, 'X25519MLKEM768');
  assert.equal(s['classical-only'].observed.rejected, true);
  assert.equal(s['classical-fallback'].observed.group, 'X25519');
  assert.equal(s['wrong-name'].observed.rejected, true);
  assert.equal(s['identity'].observed.authorized, true);
});

test('a probe flags a contradiction when a target negotiates classical while hybrid is expected', async () => {
  const fixture = await startFixture({groups:'X25519'});
  try {
    const packet = await probeTarget({host:'127.0.0.1', port:fixture.port, servername:'localhost', ca:fixture.cert, requireHybrid:true, build:'classical fixture'});
    assert.equal(byId(packet)['hybrid-offer'].outcome, 'contradicted');
    assert.equal(byId(packet)['hybrid-offer'].observed.group, 'X25519');
    assert.equal(byId(packet)['classical-only'].outcome, 'contradicted');
  } finally { await fixture.close(); }
});

test('a strict hybrid target that rejects a classical-only client is recorded as enforced', async () => {
  const fixture = await startFixture({groups:'X25519MLKEM768'});
  try {
    const packet = await probeTarget({host:'127.0.0.1', port:fixture.port, servername:'localhost', ca:fixture.cert, requireHybrid:true, build:'strict fixture'});
    assert.equal(byId(packet)['hybrid-offer'].outcome, 'matched');
    assert.equal(byId(packet)['classical-only'].outcome, 'matched');
    assert.equal(byId(packet)['classical-only'].observed.rejected, true);
  } finally { await fixture.close(); }
});

test('an unreachable target is inconclusive, never a product failure', async () => {
  const port = await new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); }); });
  const packet = await probeTarget({host:'127.0.0.1', port, servername:'localhost', requireHybrid:true, timeoutMs:2000, build:'closed port'});
  assert.deepEqual([...new Set(packet.scenarios.map(s => s.outcome))], ['inconclusive']);
});

test('an untrusted certificate chain makes identity checks inconclusive instead of passing or failing', async () => {
  const fixture = await startFixture({groups:'X25519MLKEM768:X25519'});
  try {
    const packet = await probeTarget({host:'127.0.0.1', port:fixture.port, servername:'localhost', requireHybrid:false, build:'no CA supplied'});
    assert.equal(byId(packet)['identity'].outcome, 'inconclusive');
    assert.equal(byId(packet)['wrong-name'].outcome, 'inconclusive');
  } finally { await fixture.close(); }
});

test('the packet digest covers the subject, policy, and every scenario', async () => {
  const packet = await runSelfTest();
  assert.equal(packet.digest, sha256Hex(packetDigestInput(packet)));
  const edited = structuredClone(packet);
  edited.scenarios[0].outcome = 'contradicted';
  assert.notEqual(sha256Hex(packetDigestInput(edited)), packet.digest);
});

// ---- SSH and IKEv2 probe packets ----
import {startSshFixture, HYBRID_KEX} from '../ssh.mjs';
import {startIkeFixture, KE} from '../ike.mjs';
import {planReplayImport} from '../../../web/replay-format.js';

test('an SSH probe flags a classical-only server when hybrid is required', async () => {
  const fixture = await startSshFixture({kex:['curve25519-sha256']});
  try {
    const packet = await probeTarget({protocol:'ssh', host:'127.0.0.1', port:fixture.port, requireHybrid:true, build:'classical ssh fixture'});
    assert.equal(packet.subject.protocol, 'ssh');
    assert.equal(byId(packet)['ssh-hybrid-offer'].outcome, 'contradicted');
    assert.equal(byId(packet)['ssh-classical-only'].outcome, 'contradicted');
    assert.match(byId(packet)['ssh-pq-methods'].detail, /no post-quantum key exchange method/);
  } finally { await fixture.close(); }
});

test('an SSH probe confirms a hybrid-only server, its refusal of classical clients, and its known host key', async () => {
  const fixture = await startSshFixture({kex:[HYBRID_KEX]});
  try {
    const packet = await probeTarget({protocol:'ssh', host:'127.0.0.1', port:fixture.port, requireHybrid:true, expectHostKey:fixture.fingerprint, build:'strict ssh fixture'});
    assert.deepEqual(['ssh-hybrid-offer', 'ssh-classical-only', 'ssh-host-key'].map(id => byId(packet)[id].outcome), ['matched', 'matched', 'matched']);
    const other = await probeTarget({protocol:'ssh', host:'127.0.0.1', port:fixture.port, expectHostKey:'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'});
    assert.equal(byId(other)['ssh-host-key'].outcome, 'contradicted');
  } finally { await fixture.close(); }
});

test('an IKEv2 probe confirms a responder that requires ML-KEM and flags one that allows classical-only', async () => {
  const [strict, lenient] = await Promise.all([startIkeFixture({support:[KE.MLKEM768], require:true}), startIkeFixture({support:[KE.MLKEM768]})]);
  try {
    const good = await probeTarget({protocol:'ike', host:'127.0.0.1', port:strict.port, requireHybrid:true});
    assert.equal(good.subject.protocol, 'ike');
    assert.equal(byId(good)['ike-hybrid-offer'].outcome, 'matched');
    assert.equal(byId(good)['ike-classical-only'].outcome, 'matched');
    const weak = await probeTarget({protocol:'ike', host:'127.0.0.1', port:lenient.port, requireHybrid:true});
    assert.equal(byId(weak)['ike-hybrid-offer'].outcome, 'matched');
    assert.equal(byId(weak)['ike-classical-only'].outcome, 'contradicted');
  } finally { await Promise.all([strict.close(), lenient.close()]); }
});

test('unreachable SSH and IKEv2 targets are inconclusive, never product failures', async () => {
  const port = await new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); }); });
  const ssh = await probeTarget({protocol:'ssh', host:'127.0.0.1', port, requireHybrid:true, timeoutMs:1000});
  assert.deepEqual([...new Set(ssh.scenarios.filter(s => s.id !== 'ssh-pq-methods').map(s => s.outcome))], ['inconclusive']);
  const ike = await probeTarget({protocol:'ike', host:'127.0.0.1', port, requireHybrid:true, timeoutMs:900});
  assert.deepEqual([...new Set(ike.scenarios.map(s => s.outcome))], ['inconclusive']);
});

test('SSH and IKEv2 packets fill their own workbook tests when imported', async () => {
  const sshFixture = await startSshFixture({kex:[HYBRID_KEX]});
  const ikeFixture = await startIkeFixture({support:[KE.MLKEM768], require:true});
  try {
    const ssh = planReplayImport(await probeTarget({protocol:'ssh', host:'127.0.0.1', port:sshFixture.port, requireHybrid:true}), {tests:{}, customTests:[]}, {evidenceId:'EV-010'});
    assert.deepEqual(ssh.evidence.linkedIds, ['T19', 'T15']);
    assert.equal(ssh.updates.find(item => item.testId === 'T19').fields.result, 'Observed');
    const ike = planReplayImport(await probeTarget({protocol:'ike', host:'127.0.0.1', port:ikeFixture.port, requireHybrid:true}), {tests:{}, customTests:[]}, {evidenceId:'EV-011'});
    assert.deepEqual(ike.evidence.linkedIds, ['T20', 'T15']);
    assert.match(ike.updates.find(item => item.testId === 'T20').fields.observed, /ml-kem-768/);
  } finally { await Promise.all([sshFixture.close(), ikeFixture.close()]); }
});
