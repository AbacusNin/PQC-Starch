// Builds a throwaway self-signed P-256 certificate in memory for loopback fixtures.
// Node can sign but not issue certificates, and requiring the openssl command line would break
// on hosts that lack it or rewrite its arguments, so the DER is assembled here.
import crypto from 'node:crypto';

const length = n => {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let value = n; value > 0; value >>= 8) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), length(body.length), body]); };
const seq = (...parts) => tlv(0x30, ...parts);
const oid = dotted => {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * first + second];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let value = n >> 7; value > 0; value >>= 7) chunk.unshift((value & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
};
const utcTime = date => tlv(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));
const name = commonName => seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(commonName)))));

export function selfSignedCertificate(commonName, {ip = '127.0.0.1'} = {}) {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {namedCurve:'P-256'});
  const algorithm = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x40; // positive and minimally encoded
  const now = Date.now();
  const altNames = seq(tlv(0x82, Buffer.from(commonName)), tlv(0x87, Buffer.from(ip.split('.').map(Number))));
  const extensions = tlv(0xa3, seq(
    seq(oid('2.5.29.19'), tlv(0x01, Buffer.from([0xff])), tlv(0x04, seq(tlv(0x01, Buffer.from([0xff]))))), // basicConstraints, critical, CA
    seq(oid('2.5.29.17'), tlv(0x04, altNames))));
  const tbs = seq(tlv(0xa0, tlv(0x02, Buffer.from([2]))), tlv(0x02, serial), algorithm, name(commonName),
    seq(utcTime(new Date(now - 3600e3)), utcTime(new Date(now + 86400e3))), name(commonName),
    publicKey.export({type:'spki', format:'der'}), extensions);
  const der = seq(tbs, algorithm, tlv(0x03, Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)));
  return {
    cert:`-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`,
    key:privateKey.export({type:'pkcs8', format:'pem'}) // held in memory only; the harness never writes it to disk
  };
}
