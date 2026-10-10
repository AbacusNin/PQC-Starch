// Best-effort detection of private key material in typed text or imported JSON.
// It catches common encodings; it cannot prove a file is free of secrets.
const PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i;
const KEY_NAMES = /^(?:privateKey|private_key|secretKey|secret_key|keyMaterial|keyValue)$/i;
const JWK_PRIVATE = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

export function containsSecret(value) {
  let examined = 0;
  const walk = (item, insideMaterial, depth) => {
    if (typeof item === 'string') return PEM.test(item);
    if (!item || typeof item !== 'object' || depth > 30 || ++examined > 50000) return false;
    if (!Array.isArray(item) && typeof item.kty === 'string' && JWK_PRIVATE.some(name => typeof item[name] === 'string' && item[name])) return true;
    for (const [name, child] of Object.entries(item)) {
      if (!Array.isArray(item) && KEY_NAMES.test(name) && child) return true;
      // A CycloneDX related-crypto-material value can hold the key itself.
      const material = insideMaterial || name === 'relatedCryptoMaterialProperties';
      if (material && name === 'value' && child) return true;
      if (walk(child, material, depth + 1)) return true;
    }
    return false;
  };
  return walk(value, false, 0);
}
