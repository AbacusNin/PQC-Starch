// IKEv2 probe for the replay harness. It sends IKE_SA_INIT (RFC 7296) offering ML-KEM as an additional key
// exchange (RFC 9370), reads which methods the responder chose, and, when ML-KEM was chosen, runs one
// IKE_INTERMEDIATE exchange (RFC 9242) carrying the ML-KEM encapsulation key. A reply that decrypts under the
// keys from the classical exchange and carries an ML-KEM ciphertext of the right size shows the responder
// took part in the post-quantum exchange. The probe stops there: it never sends IKE_AUTH, so it needs no
// credentials and creates no tunnel. The responder drops the half-open SA after its own timeout.
//
// Code points from the IANA IKEv2 registry: ML-KEM-512/768/1024 = 35/36/37, Curve25519 = 31,
// IKE_INTERMEDIATE = 43, INTERMEDIATE_EXCHANGE_SUPPORTED = 16438, ADDKE1 = transform type 6.
import dgram from 'node:dgram';
import crypto from 'node:crypto';

export const KE = {NONE:0, P256:19, P384:20, X25519:31, MLKEM512:35, MLKEM768:36, MLKEM1024:37};
export const KE_NAMES = {0:'none', 19:'256-bit random ECP', 20:'384-bit random ECP', 31:'Curve25519', 35:'ml-kem-512', 36:'ml-kem-768', 37:'ml-kem-1024'};
const EXCHANGE = {SA_INIT:34, INTERMEDIATE:43};
const PAYLOAD = {NONE:0, SA:33, KE:34, NONCE:40, NOTIFY:41, SK:46};
const TRANSFORM = {ENCR:1, PRF:2, INTEG:3, KE:4, ADDKE1:6};
const ENCR_AES_GCM_16 = 20;
const PRF = {5:{hash:'sha256', length:32}, 6:{hash:'sha384', length:48}, 7:{hash:'sha512', length:64}};
const NOTIFY = {NO_PROPOSAL_CHOSEN:14, INVALID_KE_PAYLOAD:17, COOKIE:16390, INTERMEDIATE_EXCHANGE_SUPPORTED:16438};
const NOTIFY_NAMES = {7:'INVALID_SYNTAX', 14:'NO_PROPOSAL_CHOSEN', 17:'INVALID_KE_PAYLOAD', 24:'AUTHENTICATION_FAILED', 16390:'COOKIE', 16438:'INTERMEDIATE_EXCHANGE_SUPPORTED'};
const FLAG = {INITIATOR:0x08, RESPONSE:0x20};
const KEM = {35:{type:'ml-kem-512', ct:768}, 36:{type:'ml-kem-768', ct:1088}, 37:{type:'ml-kem-1024', ct:1568}};
const CLASSICAL = [KE.X25519, KE.P256, KE.P384];

// ---- Encoding ----
const u16 = value => { const out = Buffer.alloc(2); out.writeUInt16BE(value); return out; };
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; };
function header({spiI, spiR, next, exchange, flags, messageId, length}) {
  return Buffer.concat([spiI, spiR, Buffer.from([next, 0x20, exchange, flags]), u32(messageId), u32(length)]);
}
// Payloads are chained: each generic header names the type of the payload after it.
function chain(payloads) {
  return Buffer.concat(payloads.map(([, body], index) => Buffer.concat([Buffer.from([payloads[index + 1]?.[0] ?? PAYLOAD.NONE, 0]), u16(4 + body.length), body])));
}
function transform(type, id, keyLength) {
  const attribute = keyLength ? Buffer.concat([u16(0x8000 | 14), u16(keyLength)]) : Buffer.alloc(0);
  return {type, id, bytes:last => Buffer.concat([Buffer.from([last ? 0 : 3, 0]), u16(8 + attribute.length), Buffer.from([type, 0]), u16(id), attribute])};
}
function saPayload(transforms) {
  const body = Buffer.concat(transforms.map((item, index) => item.bytes(index === transforms.length - 1)));
  return Buffer.concat([Buffer.from([0, 0]), u16(8 + body.length), Buffer.from([1, 1, 0, transforms.length]), body]);
}
const kePayload = (group, data) => Buffer.concat([u16(group), u16(0), data]);
const notifyPayload = (type, data = Buffer.alloc(0)) => Buffer.concat([Buffer.from([0, 0]), u16(type), data]);

// ---- Parsing ----
function parseHeader(message) {
  if (message.length < 28) throw new Error('IKE message is too short.');
  return {spiI:message.subarray(0, 8), spiR:message.subarray(8, 16), next:message[16], exchange:message[18], flags:message[19], messageId:message.readUInt32BE(20), length:message.readUInt32BE(24)};
}
function parsePayloads(bytes, first) {
  const found = [];
  let type = first, at = 0;
  while (type !== PAYLOAD.NONE) {
    if (at + 4 > bytes.length) throw new Error('IKE payload chain is truncated.');
    const next = bytes[at], length = bytes.readUInt16BE(at + 2);
    if (length < 4 || at + length > bytes.length) throw new Error('IKE payload length is invalid.');
    found.push({type, body:bytes.subarray(at + 4, at + length), header:bytes.subarray(at, at + 4)});
    at += length; type = next;
    if (found.length > 64) throw new Error('Too many IKE payloads.');
  }
  return found;
}
function parseProposal(body) {
  const transforms = [];
  const count = body[7], spiSize = body[6];
  let at = 8 + spiSize;
  for (let index = 0; index < count; index++) {
    const length = body.readUInt16BE(at + 2);
    const item = {type:body[at + 4], id:body.readUInt16BE(at + 6), keyLength:null};
    if (length > 8 && body.readUInt16BE(at + 8) === (0x8000 | 14)) item.keyLength = body.readUInt16BE(at + 10);
    transforms.push(item);
    at += length;
  }
  return transforms;
}
const notifies = payloads => payloads.filter(item => item.type === PAYLOAD.NOTIFY).map(item => ({type:item.body.readUInt16BE(2), data:item.body.subarray(4)}));

// ---- Key material ----
function classicalKeys(group) {
  if (group === KE.X25519) {
    const pair = crypto.generateKeyPairSync('x25519');
    return {data:Buffer.from(pair.publicKey.export({format:'jwk'}).x, 'base64url'),
      secret:peer => crypto.diffieHellman({privateKey:pair.privateKey, publicKey:crypto.createPublicKey({key:{kty:'OKP', crv:'X25519', x:Buffer.from(peer).toString('base64url')}, format:'jwk'})})};
  }
  const curve = group === KE.P256 ? 'P-256' : 'P-384', size = group === KE.P256 ? 32 : 48;
  const pair = crypto.generateKeyPairSync('ec', {namedCurve:curve});
  const jwk = pair.publicKey.export({format:'jwk'});
  // RFC 5903: the public value is x || y, and the shared secret is the x coordinate.
  return {data:Buffer.concat([Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]),
    secret:peer => crypto.diffieHellman({privateKey:pair.privateKey, publicKey:crypto.createPublicKey({key:{kty:'EC', crv:curve,
      x:Buffer.from(peer.subarray(0, size)).toString('base64url'), y:Buffer.from(peer.subarray(size, 2 * size)).toString('base64url')}, format:'jwk'})})};
}
const prf = (id, key, data) => crypto.createHmac(PRF[id].hash, key).update(data).digest();
function prfPlus(id, key, seed, length) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(blocks).length < length; counter++) {
    previous = prf(id, key, Buffer.concat([previous, seed, Buffer.from([counter])]));
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}
// RFC 7296 section 2.14, with AES-GCM keying material of key plus 4-byte salt (RFC 5282).
export function deriveKeys({prfId, keyLength, nonceI, nonceR, spiI, spiR, sharedSecret}) {
  const seed = prf(prfId, Buffer.concat([nonceI, nonceR]), sharedSecret);
  const size = PRF[prfId].length, encr = keyLength / 8 + 4;
  const material = prfPlus(prfId, seed, Buffer.concat([nonceI, nonceR, spiI, spiR]), size + 2 * encr + 2 * size);
  const ei = material.subarray(size, size + encr), er = material.subarray(size + encr, size + 2 * encr);
  return {d:material.subarray(0, size), ei:{key:ei.subarray(0, -4), salt:ei.subarray(-4)}, er:{key:er.subarray(0, -4), salt:er.subarray(-4)}};
}

// An encrypted message: header, then an SK payload holding IV, ciphertext, and the 16-byte ICV.
// The AAD is the IKE header plus the SK payload's generic header (RFC 5282 section 5.1).
function sealMessage({spiI, spiR, exchange, flags, messageId, keys, inner, innerFirst}) {
  const plaintext = Buffer.concat([inner, Buffer.from([0])]);
  const iv = crypto.randomBytes(8);
  const skLength = 4 + 8 + plaintext.length + 16;
  const head = header({spiI, spiR, next:PAYLOAD.SK, exchange, flags, messageId, length:28 + skLength});
  const skHeader = Buffer.concat([Buffer.from([innerFirst, 0]), u16(skLength)]);
  const cipher = crypto.createCipheriv(`aes-${keys.key.length * 8}-gcm`, keys.key, Buffer.concat([keys.salt, iv]), {authTagLength:16});
  cipher.setAAD(Buffer.concat([head, skHeader]));
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([head, skHeader, iv, sealed, cipher.getAuthTag()]);
}
function openMessage(message, keys) {
  const head = parseHeader(message);
  if (head.next !== PAYLOAD.SK) throw new Error('The reply is not encrypted.');
  const sk = message.subarray(28);
  const skLength = sk.readUInt16BE(2);
  const iv = sk.subarray(4, 12), body = sk.subarray(12, skLength - 16), tag = sk.subarray(skLength - 16, skLength);
  const decipher = crypto.createDecipheriv(`aes-${keys.key.length * 8}-gcm`, keys.key, Buffer.concat([keys.salt, iv]), {authTagLength:16});
  decipher.setAAD(Buffer.concat([message.subarray(0, 28), sk.subarray(0, 4)]));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  const padding = plaintext[plaintext.length - 1];
  return parsePayloads(plaintext.subarray(0, plaintext.length - 1 - padding), sk[0]);
}

// ---- Probe ----
function exchange(socket, host, port, message, timeoutMs, accept) {
  return new Promise(resolve => {
    let tries = 0, timer;
    const done = value => { clearTimeout(timer); socket.removeListener('message', onMessage); resolve(value); };
    const onMessage = reply => { try { if (accept(reply)) done({reply}); } catch { /* not ours */ } };
    const send = () => {
      if (tries++ === 3) return done({error:'TIMEOUT'});
      socket.send(message, port, host, error => { if (error) done({error:error.code || error.message}); });
      timer = setTimeout(send, timeoutMs / 3);
    };
    socket.on('message', onMessage);
    send();
  });
}

// addke: ML-KEM transform IDs to offer as ADDKE1, plus KE.NONE to make it optional. [] offers none.
export async function ikeProbe({host, port = 500, addke = [KE.MLKEM768, KE.NONE], timeoutMs = 6000}) {
  const socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
  socket.on('error', () => {});
  await new Promise(resolve => socket.bind(0, resolve));
  const spiI = crypto.randomBytes(8), nonceI = crypto.randomBytes(32);
  const transforms = [transform(TRANSFORM.ENCR, ENCR_AES_GCM_16, 256), transform(TRANSFORM.ENCR, ENCR_AES_GCM_16, 128),
    ...Object.keys(PRF).map(id => transform(TRANSFORM.PRF, Number(id))), ...CLASSICAL.map(id => transform(TRANSFORM.KE, id)),
    ...addke.map(id => transform(TRANSFORM.ADDKE1, id))];
  const result = {offered:{classical:CLASSICAL.map(id => KE_NAMES[id]), additional:addke.map(id => KE_NAMES[id])}};
  try {
    let group = KE.X25519, cookie = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ke = classicalKeys(group);
      const payloads = [...(cookie ? [[PAYLOAD.NOTIFY, notifyPayload(NOTIFY.COOKIE, cookie)]] : []), [PAYLOAD.SA, saPayload(transforms)], [PAYLOAD.KE, kePayload(group, ke.data)],
        [PAYLOAD.NONCE, nonceI], ...(addke.length ? [[PAYLOAD.NOTIFY, notifyPayload(NOTIFY.INTERMEDIATE_EXCHANGE_SUPPORTED)]] : [])];
      const body = chain(payloads);
      const request = Buffer.concat([header({spiI, spiR:Buffer.alloc(8), next:payloads[0][0], exchange:EXCHANGE.SA_INIT, flags:FLAG.INITIATOR, messageId:0, length:28 + body.length}), body]);
      const {reply, error} = await exchange(socket, host, port, request, timeoutMs, message => parseHeader(message).spiI.equals(spiI) && message[18] === EXCHANGE.SA_INIT);
      if (error) return {...result, error};
      const head = parseHeader(reply);
      const items = parsePayloads(reply.subarray(28, head.length), head.next);
      const notes = notifies(items);
      const cookieNote = notes.find(item => item.type === NOTIFY.COOKIE);
      if (cookieNote) { cookie = Buffer.from(cookieNote.data); continue; }
      const invalidKe = notes.find(item => item.type === NOTIFY.INVALID_KE_PAYLOAD);
      if (invalidKe && invalidKe.data.length >= 2 && CLASSICAL.includes(invalidKe.data.readUInt16BE(0))) { group = invalidKe.data.readUInt16BE(0); continue; }
      const errorNote = notes.find(item => item.type < 16384);
      if (errorNote) return {...result, rejected:true, reason:NOTIFY_NAMES[errorNote.type] || `error notify ${errorNote.type}`};
      const sa = items.find(item => item.type === PAYLOAD.SA), keR = items.find(item => item.type === PAYLOAD.KE), nonce = items.find(item => item.type === PAYLOAD.NONCE);
      if (!sa || !keR || !nonce) return {...result, error:'INCOMPLETE_REPLY'};
      const chosen = parseProposal(sa.body);
      const pick = type => chosen.find(item => item.type === type);
      const additional = pick(TRANSFORM.ADDKE1)?.id ?? KE.NONE;
      Object.assign(result, {rejected:false, chosen:{encryption:`AES-GCM-16 ${pick(TRANSFORM.ENCR)?.keyLength || ''}`.trim(), prf:PRF[pick(TRANSFORM.PRF)?.id]?.hash || 'unknown',
        classical:KE_NAMES[pick(TRANSFORM.KE)?.id] || 'unknown', additional:KE_NAMES[additional] || `transform ${additional}`},
        intermediateSupported:notes.some(item => item.type === NOTIFY.INTERMEDIATE_EXCHANGE_SUPPORTED)});
      if (!KEM[additional]) return result;
      const prfId = pick(TRANSFORM.PRF)?.id, keyLength = pick(TRANSFORM.ENCR)?.keyLength;
      if (!PRF[prfId] || pick(TRANSFORM.ENCR)?.id !== ENCR_AES_GCM_16 || ![128, 256].includes(keyLength)) return {...result, intermediate:{completed:false, reason:'the chosen cipher or PRF is not one the probe offered'}};
      const sharedSecret = ke.secret(keR.body.subarray(4));
      const keys = deriveKeys({prfId, keyLength, nonceI, nonceR:nonce.body, spiI, spiR:head.spiR, sharedSecret});
      const kem = crypto.generateKeyPairSync(KEM[additional].type);
      const ek = kem.publicKey.export({format:'raw-public'});
      const intermediate = sealMessage({spiI, spiR:head.spiR, exchange:EXCHANGE.INTERMEDIATE, flags:FLAG.INITIATOR, messageId:1, keys:keys.ei,
        inner:chain([[PAYLOAD.KE, kePayload(additional, ek)]]), innerFirst:PAYLOAD.KE});
      const second = await exchange(socket, host, port, intermediate, timeoutMs, message => parseHeader(message).spiI.equals(spiI) && message[18] === EXCHANGE.INTERMEDIATE);
      if (second.error) return {...result, intermediate:{completed:false, reason:second.error}};
      let inner;
      try { inner = openMessage(second.reply, keys.er); }
      catch { return {...result, intermediate:{completed:false, reason:'the reply did not decrypt under the keys from the classical exchange'}}; }
      const innerNotes = notifies(inner);
      if (innerNotes.some(item => item.type < 16384)) return {...result, intermediate:{completed:false, reason:`responder sent ${NOTIFY_NAMES[innerNotes[0].type] || `error notify ${innerNotes[0].type}`}`}};
      const keReply = inner.find(item => item.type === PAYLOAD.KE);
      const ciphertext = keReply?.body.subarray(4);
      const ok = keReply && keReply.body.readUInt16BE(0) === additional && ciphertext.length === KEM[additional].ct;
      if (ok) crypto.decapsulate(kem.privateKey, ciphertext);
      return {...result, intermediate:{completed:Boolean(ok), method:KE_NAMES[additional], ciphertextBytes:ciphertext?.length || 0,
        reason:ok ? '' : 'the reply carried no ML-KEM ciphertext of the expected size'}};
    }
    return {...result, error:'TOO_MANY_RETRIES'};
  } finally { socket.close(); }
}

// ---- Loopback responder fixture ----
// support: ML-KEM IDs the responder accepts as ADDKE1; require: refuse proposals without one.
// wrongKeys encrypts the IKE_INTERMEDIATE reply under unrelated keys, which the probe must not accept.
export async function startIkeFixture({support = [KE.MLKEM768], require = false, wrongKeys = false} = {}) {
  const socket = dgram.createSocket('udp4');
  const sessions = new Map();
  socket.on('message', (message, peer) => {
    try {
      const head = parseHeader(message);
      const reply = (bytes) => socket.send(bytes, peer.port, peer.address);
      if (head.exchange === EXCHANGE.SA_INIT && !(head.flags & FLAG.RESPONSE)) {
        const items = parsePayloads(message.subarray(28, head.length), head.next);
        const offered = parseProposal(items.find(item => item.type === PAYLOAD.SA).body);
        const keI = items.find(item => item.type === PAYLOAD.KE), nonceI = items.find(item => item.type === PAYLOAD.NONCE).body;
        const spiR = crypto.randomBytes(8);
        const error = type => { const body = chain([[PAYLOAD.NOTIFY, notifyPayload(type, type === NOTIFY.INVALID_KE_PAYLOAD ? u16(KE.X25519) : Buffer.alloc(0))]]);
          reply(Buffer.concat([header({spiI:head.spiI, spiR:Buffer.alloc(8), next:PAYLOAD.NOTIFY, exchange:EXCHANGE.SA_INIT, flags:FLAG.RESPONSE, messageId:0, length:28 + body.length}), body])); };
        const encr = offered.find(item => item.type === TRANSFORM.ENCR && item.id === ENCR_AES_GCM_16 && item.keyLength === 256);
        const prfId = offered.find(item => item.type === TRANSFORM.PRF && item.id === 5);
        const classical = offered.find(item => item.type === TRANSFORM.KE && item.id === KE.X25519);
        const addkeOffered = offered.filter(item => item.type === TRANSFORM.ADDKE1).map(item => item.id);
        const additional = addkeOffered.find(id => support.includes(id)) ?? (addkeOffered.length === 0 || addkeOffered.includes(KE.NONE) ? KE.NONE : null);
        if (!encr || !prfId || !classical || additional === null || (require && additional === KE.NONE)) return error(NOTIFY.NO_PROPOSAL_CHOSEN);
        if (keI.body.readUInt16BE(0) !== KE.X25519) return error(NOTIFY.INVALID_KE_PAYLOAD);
        const ke = classicalKeys(KE.X25519), nonceR = crypto.randomBytes(32);
        const chosen = [transform(TRANSFORM.ENCR, ENCR_AES_GCM_16, 256), transform(TRANSFORM.PRF, 5), transform(TRANSFORM.KE, KE.X25519), ...(additional !== KE.NONE ? [transform(TRANSFORM.ADDKE1, additional)] : [])];
        const payloads = [[PAYLOAD.SA, saPayload(chosen)], [PAYLOAD.KE, kePayload(KE.X25519, ke.data)], [PAYLOAD.NONCE, nonceR],
          ...(additional !== KE.NONE ? [[PAYLOAD.NOTIFY, notifyPayload(NOTIFY.INTERMEDIATE_EXCHANGE_SUPPORTED)]] : [])];
        const body = chain(payloads);
        reply(Buffer.concat([header({spiI:head.spiI, spiR, next:PAYLOAD.SA, exchange:EXCHANGE.SA_INIT, flags:FLAG.RESPONSE, messageId:0, length:28 + body.length}), body]));
        const keys = deriveKeys({prfId:5, keyLength:256, nonceI, nonceR, spiI:head.spiI, spiR, sharedSecret:ke.secret(keI.body.subarray(4))});
        sessions.set(head.spiI.toString('hex'), {spiR, keys, additional});
      } else if (head.exchange === EXCHANGE.INTERMEDIATE && !(head.flags & FLAG.RESPONSE)) {
        const session = sessions.get(head.spiI.toString('hex'));
        if (!session) return;
        const inner = openMessage(message, session.keys.ei);
        const ek = inner.find(item => item.type === PAYLOAD.KE).body.subarray(4);
        const {ciphertext} = crypto.encapsulate(crypto.createPublicKey({key:ek, format:'raw-public', asymmetricKeyType:KEM[session.additional].type}));
        const keys = wrongKeys ? {key:crypto.randomBytes(32), salt:crypto.randomBytes(4)} : session.keys.er;
        reply(sealMessage({spiI:head.spiI, spiR:session.spiR, exchange:EXCHANGE.INTERMEDIATE, flags:FLAG.RESPONSE, messageId:1, keys,
          inner:chain([[PAYLOAD.KE, kePayload(session.additional, ciphertext)]]), innerFirst:PAYLOAD.KE}));
      }
    } catch { /* malformed input is ignored, as a responder would */ }
  });
  await new Promise(resolve => socket.bind(0, '127.0.0.1', resolve));
  return {port:socket.address().port, close:() => new Promise(resolve => socket.close(resolve))};
}
