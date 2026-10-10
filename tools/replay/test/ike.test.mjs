// IKEv2 probe against loopback responder fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ikeProbe, startIkeFixture, KE} from '../ike.mjs';

async function withResponder(options, run) {
  const responder = await startIkeFixture(options);
  try { return await run(responder); } finally { await responder.close(); }
}

test('a responder that supports ML-KEM-768 chooses it as ADDKE1 and answers IKE_INTERMEDIATE with a ciphertext', () => withResponder({support:[KE.MLKEM768]}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port, addke:[KE.MLKEM768, KE.NONE]});
  assert.equal(result.rejected, false, JSON.stringify(result));
  assert.equal(result.chosen.classical, 'Curve25519');
  assert.equal(result.chosen.additional, 'ml-kem-768');
  assert.equal(result.intermediateSupported, true);
  assert.deepEqual(result.intermediate, {completed:true, method:'ml-kem-768', ciphertextBytes:1088, reason:''});
}));

test('a classical-only proposal is refused by a responder that requires ML-KEM', () => withResponder({support:[KE.MLKEM768], require:true}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port, addke:[]});
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'NO_PROPOSAL_CHOSEN');
}));

test('a responder that allows classical-only exchanges accepts a proposal without ML-KEM', () => withResponder({support:[KE.MLKEM768]}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port, addke:[]});
  assert.equal(result.rejected, false);
  assert.equal(result.chosen.additional, 'none');
  assert.equal(result.intermediate, undefined);
}));

test('offering only ML-KEM-1024 to a responder limited to ML-KEM-768 is refused', () => withResponder({support:[KE.MLKEM768], require:true}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port, addke:[KE.MLKEM1024]});
  assert.equal(result.rejected, true);
}));

test('a responder whose IKE_INTERMEDIATE reply does not decrypt is not counted as completing ML-KEM', () => withResponder({support:[KE.MLKEM768], wrongKeys:true}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port});
  assert.equal(result.chosen.additional, 'ml-kem-768');
  assert.equal(result.intermediate.completed, false);
  assert.match(result.intermediate.reason, /did not decrypt/);
}));

test('ML-KEM-1024 completes against a responder that supports it', () => withResponder({support:[KE.MLKEM1024]}, async responder => {
  const result = await ikeProbe({host:'127.0.0.1', port:responder.port, addke:[KE.MLKEM1024]});
  assert.equal(result.intermediate.completed, true);
  assert.equal(result.intermediate.ciphertextBytes, 1568);
}));

test('no responder gives an error after retries, not a result', async () => {
  const responder = await startIkeFixture();
  const port = responder.port;
  await responder.close();
  const result = await ikeProbe({host:'127.0.0.1', port, timeoutMs:900});
  assert.equal(result.error, 'TIMEOUT');
});
