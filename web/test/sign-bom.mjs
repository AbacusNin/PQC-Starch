// Test helper: signs a CycloneDX document with a JSF signature using Node's crypto module, independent of the
// browser's WebCrypto verifier. Both sides share only the RFC 8785 canonical form, which bom.test.mjs pins down.
import crypto from 'node:crypto';
import {jcs} from '../bom-check.js';

const TYPES = {ES256:['ec', {namedCurve:'P-256'}], ES384:['ec', {namedCurve:'P-384'}], Ed25519:['ed25519', {}], RS256:['rsa', {modulusLength:2048}], PS256:['rsa', {modulusLength:2048}]};

export function signBom(doc, algorithm = 'ES256', {excludes} = {}) {
  const [type, options] = TYPES[algorithm];
  const {privateKey, publicKey} = crypto.generateKeyPairSync(type, options);
  const signed = structuredClone(doc);
  signed.signature = {algorithm, publicKey:publicKey.export({format:'jwk'}), ...(excludes ? {excludes} : {})};
  // JSF leaves the value, the excludes list, and the excluded properties out of the signed data.
  const input = structuredClone(signed);
  delete input.signature.excludes;
  for (const name of excludes || []) delete input[name];
  const data = Buffer.from(jcs(input));
  const hash = algorithm === 'ES384' ? 'sha384' : algorithm === 'Ed25519' ? null : 'sha256';
  const key = algorithm.startsWith('ES') ? {key:privateKey, dsaEncoding:'ieee-p1363'}
    : algorithm.startsWith('PS') ? {key:privateKey, padding:crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength:32} : privateKey;
  signed.signature.value = crypto.sign(hash, data, key).toString('base64url');
  return signed;
}
