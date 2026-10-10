// SSH key-exchange probe for the replay harness. It speaks just enough of the SSH transport protocol
// (RFC 4253) to see what a server offers, run one key exchange, and check the server's host-key signature
// over the exchange hash. It never authenticates, opens a session, or sends NEWKEYS: after the reply it
// disconnects. That is less than an ordinary "ssh" login attempt.
//
// Hybrid method: mlkem768x25519-sha256, draft-ietf-sshm-mlkem-hybrid-kex-10. C_INIT = ML-KEM-768
// encapsulation key || X25519 public key; S_REPLY = ML-KEM ciphertext || X25519 public key;
// K = SHA-256(K_PQ || K_CL), encoded as a string in the exchange hash. Classical: curve25519-sha256
// (RFC 8731) and ecdh-sha2-nistp256 (RFC 5656), with K encoded as an mpint.
import net from 'node:net';
import crypto from 'node:crypto';

export const HYBRID_KEX = 'mlkem768x25519-sha256';
export const PQ_KEX_NAMES = ['mlkem768x25519-sha256', 'mlkem768nistp256-sha256', 'mlkem1024nistp384-sha384', 'sntrup761x25519-sha512', 'sntrup761x25519-sha512@openssh.com'];
export const CLASSICAL_KEX = ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256'];
const HOST_KEYS = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256'];
const CIPHERS = ['chacha20-poly1305@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes256-ctr'];
const MACS = ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512'];
const MSG = {DISCONNECT:1, KEXINIT:20, NEWKEYS:21, KEX_INIT:30, KEX_REPLY:31};
const CLIENT_IDENT = 'SSH-2.0-PQCReplayHarness_1.1';
const MAX_PACKET = 256 * 1024;

// ---- Encoding (RFC 4251 section 5) ----
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; };
const sshString = value => { const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value); return Buffer.concat([u32(bytes.length), bytes]); };
const nameList = list => sshString(list.join(','));
function mpint(bytes) {
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start++;
  const trimmed = Buffer.from(bytes.subarray(start));
  return sshString(trimmed.length && trimmed[0] & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}
class Reader {
  constructor(bytes) { this.bytes = Buffer.from(bytes); this.at = 0; }
  need(count) { if (this.at + count > this.bytes.length) throw new Error('SSH message is truncated.'); }
  byte() { this.need(1); return this.bytes[this.at++]; }
  u32() { this.need(4); const value = this.bytes.readUInt32BE(this.at); this.at += 4; return value; }
  string() { const length = this.u32(); this.need(length); const value = this.bytes.subarray(this.at, this.at + length); this.at += length; return value; }
  names() { return this.string().toString('utf8').split(',').filter(Boolean); }
}
// Unencrypted binary packet: length, padding length, payload, at least 4 bytes of padding, block size 8.
function frame(payload) {
  let padding = 8 - ((5 + payload.length) % 8);
  if (padding < 4) padding += 8;
  return Buffer.concat([u32(1 + payload.length + padding), Buffer.from([padding]), payload, crypto.randomBytes(padding)]);
}

// Buffers a socket and hands out the identification line, then whole packets.
class Wire {
  constructor(socket, timeoutMs) {
    this.socket = socket; this.timeoutMs = timeoutMs; this.buffer = Buffer.alloc(0); this.ended = false; this.wake = () => {};
    socket.on('data', chunk => { this.buffer = Buffer.concat([this.buffer, chunk]); this.wake(); });
    socket.on('close', () => { this.ended = true; this.wake(); });
    socket.on('error', error => { this.error = error; this.ended = true; this.wake(); });
  }
  async until(ready) {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const value = ready();
      if (value !== undefined) return value;
      if (this.ended) throw Object.assign(new Error(this.error?.code || 'CLOSED'), {code:this.error?.code || 'CLOSED'});
      const left = deadline - Date.now();
      if (left <= 0) throw Object.assign(new Error('TIMEOUT'), {code:'TIMEOUT'});
      await new Promise(resolve => { const timer = setTimeout(resolve, left); this.wake = () => { clearTimeout(timer); resolve(); }; });
    }
  }
  // RFC 4253 lets a server send other lines before its version line.
  async identification() {
    for (let lines = 0; lines < 20; lines++) {
      const line = await this.until(() => {
        const end = this.buffer.indexOf(0x0a);
        if (end < 0) { if (this.buffer.length > 255) throw new Error('The peer sent an overlong line.'); return undefined; }
        const value = this.buffer.subarray(0, end).toString('utf8').replace(/\r$/, '');
        this.buffer = this.buffer.subarray(end + 1);
        return value;
      });
      if (line.startsWith('SSH-')) return line;
    }
    throw new Error('The peer sent no SSH version line.');
  }
  async packet() {
    return this.until(() => {
      if (this.buffer.length < 4) return undefined;
      const length = this.buffer.readUInt32BE(0);
      if (length < 5 || length > MAX_PACKET) throw new Error('The peer sent an invalid packet length.');
      if (this.buffer.length < 4 + length) return undefined;
      const padding = this.buffer[4];
      const payload = Buffer.from(this.buffer.subarray(5, 4 + length - padding));
      this.buffer = this.buffer.subarray(4 + length);
      return payload;
    });
  }
  send(payload) { this.socket.write(frame(payload)); }
}

function kexinit(kex, hostKeys) {
  return Buffer.concat([Buffer.from([MSG.KEXINIT]), crypto.randomBytes(16), nameList(kex), nameList(hostKeys), nameList(CIPHERS), nameList(CIPHERS),
    nameList(MACS), nameList(MACS), nameList(['none']), nameList(['none']), nameList([]), nameList([]), Buffer.from([0]), u32(0)]);
}
function parseKexinit(payload) {
  const reader = new Reader(payload);
  if (reader.byte() !== MSG.KEXINIT) throw new Error('Expected SSH_MSG_KEXINIT.');
  reader.at += 16;
  return {kex:reader.names(), hostKeys:reader.names()};
}
// RFC 4253 section 7.1: the first client algorithm the server also supports.
const choose = (client, server) => client.find(name => server.includes(name)) || null;
const disconnect = (reason, text) => Buffer.concat([Buffer.from([MSG.DISCONNECT]), u32(reason), sshString(text), sshString('')]);

// ---- Key exchange arithmetic shared by probe and fixture ----
const rawX25519 = key => Buffer.from(key.export({format:'jwk'}).x, 'base64url');
const x25519Public = bytes => crypto.createPublicKey({key:{kty:'OKP', crv:'X25519', x:Buffer.from(bytes).toString('base64url')}, format:'jwk'});
const p256Public = point => crypto.createPublicKey({key:{kty:'EC', crv:'P-256', x:Buffer.from(point.subarray(1, 33)).toString('base64url'), y:Buffer.from(point.subarray(33, 65)).toString('base64url')}, format:'jwk'});
const rawP256 = key => { const jwk = key.export({format:'jwk'}); return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]); };
const sha256 = (...parts) => crypto.createHash('sha256').update(Buffer.concat(parts)).digest();

function exchangeHash({clientIdent, serverIdent, clientKexinit, serverKexinit, hostKey, clientValue, serverValue, sharedSecret, hybrid}) {
  return sha256(sshString(clientIdent), sshString(serverIdent), sshString(clientKexinit), sshString(serverKexinit), sshString(hostKey),
    sshString(clientValue), sshString(serverValue), hybrid ? sshString(sharedSecret) : mpint(sharedSecret));
}

// Parses a host key blob and checks its signature over H. Returns {type, fingerprint, valid}.
export function verifyHostSignature(hostKey, signatureBlob, hash) {
  const key = new Reader(hostKey);
  const type = key.string().toString('utf8');
  const fingerprint = `SHA256:${crypto.createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`;
  const signature = new Reader(signatureBlob);
  const signatureType = signature.string().toString('utf8');
  const value = signature.string();
  let valid = false;
  if (type === 'ssh-ed25519' && signatureType === 'ssh-ed25519') {
    const publicKey = crypto.createPublicKey({key:{kty:'OKP', crv:'Ed25519', x:Buffer.from(key.string()).toString('base64url')}, format:'jwk'});
    valid = crypto.verify(null, hash, publicKey, value);
  } else if (type === 'ecdsa-sha2-nistp256' && signatureType === 'ecdsa-sha2-nistp256') {
    key.string();
    const publicKey = p256Public(key.string());
    const parts = new Reader(value);
    const fixed = bytes => { const trimmed = Buffer.from(bytes).subarray(Math.max(0, bytes.length - 32)); return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed]); };
    valid = crypto.verify('sha256', hash, {key:publicKey, dsaEncoding:'ieee-p1363'}, Buffer.concat([fixed(parts.string()), fixed(parts.string())]));
  } else if (type === 'ssh-rsa' && ['rsa-sha2-256', 'rsa-sha2-512'].includes(signatureType)) {
    const e = key.string(), n = key.string();
    const strip = bytes => Buffer.from(bytes).subarray(bytes[0] === 0 ? 1 : 0).toString('base64url');
    const publicKey = crypto.createPublicKey({key:{kty:'RSA', n:strip(n), e:strip(e)}, format:'jwk'});
    valid = crypto.verify(signatureType === 'rsa-sha2-512' ? 'sha512' : 'sha256', hash, publicKey, value);
  }
  return {type, signatureType, fingerprint, valid};
}

// ---- Probe ----
// Returns what the server offered, what was negotiated, and whether the exchange completed with a valid
// host signature. Errors from the network are returned as {error}, never thrown.
export async function sshKeyExchange({host, port, kex, hostKeys = HOST_KEYS, timeoutMs = 8000}) {
  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const connection = net.connect({host, port});
      connection.setNoDelay(true);
      connection.once('connect', () => resolve(connection));
      connection.once('error', reject);
      setTimeout(() => reject(Object.assign(new Error('TIMEOUT'), {code:'TIMEOUT'})), timeoutMs);
    });
  } catch (error) { return {error:error.code || error.message}; }
  const wire = new Wire(socket, timeoutMs);
  const result = {offered:kex};
  try {
    socket.write(`${CLIENT_IDENT}\r\n`);
    result.serverIdent = await wire.identification();
    const clientKexinit = kexinit(kex, hostKeys);
    wire.send(clientKexinit);
    let serverKexinit;
    while (!serverKexinit) { const payload = await wire.packet(); if (payload[0] === MSG.KEXINIT) serverKexinit = payload; else if (payload[0] === MSG.DISCONNECT) throw new Error('DISCONNECTED'); }
    const offeredByServer = parseKexinit(serverKexinit);
    result.serverKex = offeredByServer.kex;
    result.serverHostKeys = offeredByServer.hostKeys;
    result.kex = choose(kex, offeredByServer.kex);
    result.hostKeyAlgorithm = choose(hostKeys, offeredByServer.hostKeys);
    if (!result.kex || !result.hostKeyAlgorithm) {
      // No common method: the server must end the connection. Wait for it, so the refusal is observed.
      try { for (;;) { const payload = await wire.packet(); if (payload[0] === MSG.DISCONNECT) break; } } catch { /* closed, as expected */ }
      return {...result, rejected:true, reason:result.kex ? 'no common host key algorithm' : 'no common key exchange method'};
    }
    const hybrid = result.kex === HYBRID_KEX;
    let clientValue, finish;
    if (hybrid) {
      const kem = crypto.generateKeyPairSync('ml-kem-768'), ecdh = crypto.generateKeyPairSync('x25519');
      clientValue = Buffer.concat([Buffer.from(kem.publicKey.export({format:'jwk'}).pub, 'base64url'), rawX25519(ecdh.publicKey)]);
      finish = reply => {
        if (reply.length !== 1088 + 32) throw new Error('S_REPLY has the wrong length for mlkem768x25519-sha256.');
        const pq = crypto.decapsulate(kem.privateKey, reply.subarray(0, 1088));
        const classical = crypto.diffieHellman({privateKey:ecdh.privateKey, publicKey:x25519Public(reply.subarray(1088))});
        return sha256(pq, classical);
      };
    } else if (result.kex.startsWith('curve25519-sha256')) {
      const ecdh = crypto.generateKeyPairSync('x25519');
      clientValue = rawX25519(ecdh.publicKey);
      finish = reply => crypto.diffieHellman({privateKey:ecdh.privateKey, publicKey:x25519Public(reply)});
    } else if (result.kex === 'ecdh-sha2-nistp256') {
      const ecdh = crypto.generateKeyPairSync('ec', {namedCurve:'P-256'});
      clientValue = rawP256(ecdh.publicKey);
      finish = reply => crypto.diffieHellman({privateKey:ecdh.privateKey, publicKey:p256Public(reply)});
    } else {
      wire.send(disconnect(11, 'probe complete'));
      return {...result, rejected:false, completed:false, reason:`the harness cannot complete ${result.kex}; agreement was read from the method lists`};
    }
    wire.send(Buffer.concat([Buffer.from([MSG.KEX_INIT]), sshString(clientValue)]));
    let reply;
    while (!reply) {
      const payload = await wire.packet();
      if (payload[0] === MSG.KEX_REPLY) reply = payload;
      else if (payload[0] === MSG.DISCONNECT) { const reader = new Reader(payload); reader.byte(); return {...result, rejected:true, reason:`server disconnected (code ${reader.u32()}): ${reader.string().toString('utf8').slice(0, 200)}`}; }
    }
    const reader = new Reader(reply);
    reader.byte();
    const hostKey = reader.string(), serverValue = reader.string(), signature = reader.string();
    const sharedSecret = finish(serverValue);
    const hash = exchangeHash({clientIdent:CLIENT_IDENT, serverIdent:result.serverIdent, clientKexinit, serverKexinit, hostKey, clientValue, serverValue, sharedSecret, hybrid});
    const check = verifyHostSignature(hostKey, signature, hash);
    wire.send(disconnect(11, 'probe complete'));
    return {...result, rejected:false, completed:true, hostKey:{type:check.type, signatureType:check.signatureType, fingerprint:check.fingerprint}, signatureValid:check.valid};
  } catch (error) {
    return {...result, error:error.code || error.message};
  } finally { socket.end(); setTimeout(() => socket.destroy(), 200).unref(); }
}

// ---- Loopback fixture server ----
// Offers the given key exchange methods with an Ed25519 host key and answers one exchange. badSignature
// corrupts the host signature, which the probe must not report as a confirmed exchange.
export async function startSshFixture({kex, badSignature = false}) {
  const host = crypto.generateKeyPairSync('ed25519');
  const hostKey = Buffer.concat([sshString('ssh-ed25519'), sshString(Buffer.from(host.publicKey.export({format:'jwk'}).x, 'base64url'))]);
  const serverIdent = 'SSH-2.0-PQCReplayFixture_1.1';
  const server = net.createServer(socket => serve(socket).catch(() => socket.destroy()));
  async function serve(socket) {
    socket.on('error', () => {});
    const wire = new Wire(socket, 10000);
    socket.write(`${serverIdent}\r\n`);
    const clientIdent = await wire.identification();
    const serverKexinit = kexinit(kex, ['ssh-ed25519']);
    wire.send(serverKexinit);
    let clientKexinit;
    while (!clientKexinit) { const payload = await wire.packet(); if (payload[0] === MSG.KEXINIT) clientKexinit = payload; }
    const offered = parseKexinit(clientKexinit);
    const method = choose(offered.kex, kex);
    if (!method || !offered.hostKeys.includes('ssh-ed25519')) { wire.send(disconnect(3, 'no matching key exchange method found')); socket.end(); return; }
    let init;
    while (!init) { const payload = await wire.packet(); if (payload[0] === MSG.KEX_INIT) init = new Reader(payload); }
    init.byte();
    const clientValue = init.string();
    let serverValue, sharedSecret;
    if (method === HYBRID_KEX) {
      if (clientValue.length !== 1184 + 32) { wire.send(disconnect(3, 'bad C_INIT length')); socket.end(); return; }
      const kem = crypto.encapsulate(crypto.createPublicKey({key:clientValue.subarray(0, 1184), format:'raw-public', asymmetricKeyType:'ml-kem-768'}));
      const ecdh = crypto.generateKeyPairSync('x25519');
      serverValue = Buffer.concat([kem.ciphertext, rawX25519(ecdh.publicKey)]);
      sharedSecret = sha256(kem.sharedKey, crypto.diffieHellman({privateKey:ecdh.privateKey, publicKey:x25519Public(clientValue.subarray(1184))}));
    } else {
      const ecdh = crypto.generateKeyPairSync('x25519');
      serverValue = rawX25519(ecdh.publicKey);
      sharedSecret = crypto.diffieHellman({privateKey:ecdh.privateKey, publicKey:x25519Public(clientValue)});
    }
    const hash = exchangeHash({clientIdent, serverIdent, clientKexinit, serverKexinit, hostKey, clientValue, serverValue, sharedSecret, hybrid:method === HYBRID_KEX});
    const signature = crypto.sign(null, hash, host.privateKey);
    if (badSignature) signature[0] ^= 0xff;
    wire.send(Buffer.concat([Buffer.from([MSG.KEX_REPLY]), sshString(hostKey), sshString(serverValue), sshString(Buffer.concat([sshString('ssh-ed25519'), sshString(signature)]))]));
    // Wait for the client to disconnect or send NEWKEYS, then close.
    try { await wire.packet(); } catch { /* client closed */ }
    socket.end();
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {port:server.address().port, fingerprint:`SHA256:${crypto.createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`,
    close:() => new Promise(resolve => server.close(resolve))};
}
