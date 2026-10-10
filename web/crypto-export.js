// Optional passphrase encryption for whole-assessment exports. AES-256-GCM authenticates the
// ciphertext, so a wrong passphrase and a tampered file fail the same way.
export const FORMAT = 'pqc-buyer-workbook-encrypted';
export const PBKDF2_ITERATIONS = 600000;
export const MIN_PASSPHRASE = 12;
const encoder = new TextEncoder(), decoder = new TextDecoder();

export const encryptionAvailable = () => Boolean(globalThis.crypto?.subtle);

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(String(value));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}

export async function encryptExport(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, encoder.encode(plaintext)));
  return {format:FORMAT, version:1, kdf:{name:'PBKDF2', hash:'SHA-256', iterations:PBKDF2_ITERATIONS, salt:toBase64(salt)},
    cipher:{name:'AES-GCM', iv:toBase64(iv)}, data:toBase64(data)};
}

export async function decryptExport(payload, passphrase) {
  const kdf = payload?.kdf, cipher = payload?.cipher;
  // Refuse settings an attacker could lower to make a stolen file cheaper to guess.
  if (payload?.format !== FORMAT || payload.version !== 1 || kdf?.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' ||
    !Number.isInteger(kdf.iterations) || kdf.iterations < PBKDF2_ITERATIONS || kdf.iterations > 10000000 || cipher?.name !== 'AES-GCM')
    throw new Error('This encrypted export uses unsupported settings.');
  let plain;
  try {
    const key = await deriveKey(passphrase, fromBase64(kdf.salt), kdf.iterations);
    plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:fromBase64(cipher.iv)}, key, fromBase64(payload.data));
  } catch { throw new Error('That passphrase did not open this file.'); }
  return JSON.parse(decoder.decode(plain));
}
