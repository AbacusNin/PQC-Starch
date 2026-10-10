// SSH key-exchange probe: loopback fixtures, plus a cross-check with the OpenSSH client when one that
// supports mlkem768x25519-sha256 is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {sshKeyExchange, startSshFixture, HYBRID_KEX} from '../ssh.mjs';

const BOTH = [HYBRID_KEX, 'curve25519-sha256'];

async function withFixture(options, run) {
  const fixture = await startSshFixture(options);
  try { return await run(fixture); } finally { await fixture.close(); }
}

test('a hybrid-capable server negotiates mlkem768x25519-sha256 and its host signature verifies', () => withFixture({kex:BOTH}, async fixture => {
  const result = await sshKeyExchange({host:'127.0.0.1', port:fixture.port, kex:BOTH});
  assert.equal(result.kex, HYBRID_KEX);
  assert.equal(result.completed, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.hostKey.fingerprint, fixture.fingerprint);
  assert.ok(result.serverKex.includes(HYBRID_KEX));
}));

test('a classical-only offer is refused by a hybrid-only server', () => withFixture({kex:[HYBRID_KEX]}, async fixture => {
  const result = await sshKeyExchange({host:'127.0.0.1', port:fixture.port, kex:['curve25519-sha256']});
  assert.equal(result.rejected, true);
  assert.match(result.reason, /no common key exchange method/);
}));

test('a classical server falls back to curve25519-sha256 when hybrid is offered first', () => withFixture({kex:['curve25519-sha256']}, async fixture => {
  const result = await sshKeyExchange({host:'127.0.0.1', port:fixture.port, kex:BOTH});
  assert.equal(result.kex, 'curve25519-sha256');
  assert.equal(result.signatureValid, true);
}));

test('a corrupted host signature over the hybrid exchange is caught', () => withFixture({kex:BOTH, badSignature:true}, async fixture => {
  const result = await sshKeyExchange({host:'127.0.0.1', port:fixture.port, kex:BOTH});
  assert.equal(result.kex, HYBRID_KEX);
  assert.equal(result.signatureValid, false);
}));

test('an unreachable server is reported as an error, not a result', async () => {
  const fixture = await startSshFixture({kex:BOTH});
  const port = fixture.port;
  await fixture.close();
  const result = await sshKeyExchange({host:'127.0.0.1', port, kex:BOTH, timeoutMs:2000});
  assert.ok(result.error, JSON.stringify(result));
});

// OpenSSH computes the exchange independently, so its acceptance proves the fixture (and the shared
// encoding the probe uses) matches the draft as OpenSSH implements it.
const opensshKex = spawnSync('ssh', ['-Q', 'kex'], {encoding:'utf8'});
const hasHybridClient = opensshKex.status === 0 && opensshKex.stdout.split(/\r?\n/).includes(HYBRID_KEX);
function opensshTrace(port, kex) {
  return new Promise(resolve => {
    const child = spawn('ssh', ['-vv', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', `KexAlgorithms=${kex}`,
      '-o', 'HostKeyAlgorithms=ssh-ed25519', '-p', String(port), 'probe@127.0.0.1', 'true']);
    let trace = '';
    child.stderr.on('data', chunk => { trace += chunk; });
    child.on('close', () => resolve(trace));
  });
}

test('the OpenSSH client accepts the fixture\'s hybrid exchange and rejects a corrupted one', {skip:hasHybridClient ? false : 'No OpenSSH client with mlkem768x25519-sha256 on this machine'}, async () => {
  await withFixture({kex:[HYBRID_KEX]}, async fixture => {
    const trace = await opensshTrace(fixture.port, HYBRID_KEX);
    assert.match(trace, /kex: algorithm: mlkem768x25519-sha256/);
    assert.match(trace, /SSH2_MSG_NEWKEYS sent/, 'OpenSSH verified the host signature over the hybrid exchange hash');
    assert.ok(trace.includes(fixture.fingerprint));
  });
  await withFixture({kex:[HYBRID_KEX], badSignature:true}, async fixture => {
    assert.match(await opensshTrace(fixture.port, HYBRID_KEX), /incorrect signature/);
  });
});
