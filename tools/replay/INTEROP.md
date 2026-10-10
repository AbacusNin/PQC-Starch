# Interoperability record

The harness's own fixtures and probes share code, so a mistake they share would pass the self-test. These checks
pair each side with an implementation written by someone else. Run on October 10, 2026, on one Windows 10
machine with Node.js 24.19.0 (OpenSSL 3.5.7) and harness 1.1.0. Servers ran in throwaway containers bound to
127.0.0.1 and were removed afterward.

## SSH: harness fixture checked by the OpenSSH client

OpenSSH_10.5p1 (OpenSSL 3.5.8) connected to the harness's loopback SSH fixture with `-vv`,
`KexAlgorithms` set to one method, and `HostKeyAlgorithms=ssh-ed25519`.

| Fixture | OpenSSH result |
|---|---|
| mlkem768x25519-sha256 | `kex: algorithm: mlkem768x25519-sha256`, host key fingerprint matched the fixture, `SSH2_MSG_NEWKEYS sent` (sent only after the host signature over the exchange hash verifies) |
| curve25519-sha256 | Same, for the classical method |
| mlkem768x25519-sha256 with a corrupted signature | `incorrect signature`; connection refused |

This shows the fixture computes the hybrid shared secret, K = SHA-256(K_PQ || K_CL) encoded as a string, and the
exchange hash the same way OpenSSH does. The SSH test file in this folder's `test` directory repeats the check
whenever an OpenSSH client with mlkem768x25519-sha256 is installed.

## SSH: harness probe against OpenSSH servers

`alpine:3.22` (`sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8`) with
openssh-server 10.0_p1-r10.

| Server policy | Offer | Result |
|---|---|---|
| Default | mlkem768x25519-sha256, then classical | mlkem768x25519-sha256 negotiated; host signature valid for ssh-ed25519, ecdsa-sha2-nistp256, rsa-sha2-512, and rsa-sha2-256 host keys |
| Default | curve25519-sha256 only; ecdh-sha2-nistp256 only | Negotiated; host signature valid |
| Default | Server's advertised post-quantum methods | mlkem768x25519-sha256, sntrup761x25519-sha512, sntrup761x25519-sha512@openssh.com |
| Default | Host key fingerprint | Matched `ssh-keyscan` output read through `ssh-keygen -l` |
| `KexAlgorithms=mlkem768x25519-sha256` | Classical methods only | Refused: no common key exchange method |

Packets: default server `da71ea5b0248cc01...`, hybrid-only server `badba6878ad73694...` (first 16 hex digits of
each packet digest).

## IKEv2: harness probe against strongSwan

`alpine:edge` (`sha256:020dfcbaaf4cc1078bf2d9c7ba31a8466e334061dcd2f248001d68f79e52c000`) with strongswan
6.1.0-r0, ML-KEM through its OpenSSL plugin. Each responder used a pre-shared key that exists only in the
container; the probe never reaches authentication.

| Responder proposal | Offer | Result |
|---|---|---|
| aes256gcm16-prfsha256-x25519-ke1_mlkem768 | ML-KEM-768 as optional ADDKE1 | ml-kem-768 chosen; strongSwan logged `parsed IKE_INTERMEDIATE request 1 [ KE ]` and `generating IKE_INTERMEDIATE response 1 [ KE ]`; the reply decrypted and carried a 1088-byte ML-KEM-768 ciphertext |
| Same | No additional key exchange | NO_PROPOSAL_CHOSEN |
| Same | ML-KEM-1024 only | NO_PROPOSAL_CHOSEN |
| ...-ke1_mlkem768-ke1_none | Optional ML-KEM-768 | ml-kem-768 chosen; IKE_INTERMEDIATE completed |
| ...-ke1_mlkem768-ke1_none | No additional key exchange | Accepted with none |
| aes256gcm16-prfsha256-x25519 | Optional ML-KEM-768 | Accepted with none; the probe reports a contradiction when hybrid is required |

strongSwan decrypting the probe's IKE_INTERMEDIATE request, and the probe decrypting strongSwan's reply, show both
sides derived the same keys from IKE_SA_INIT (RFC 7296 key derivation, AES-GCM per RFC 5282). Packets: required
responder `3c86af2eb057026f...`, classical responder `96e9921f1841b2a5...`.

## Not covered

- mlkem768nistp256-sha256 and mlkem1024nistp384-sha384 for SSH: the probe recognizes them in a server's list but
  does not complete them.
- IKEv2 responders that require ciphers other than AES-GCM, or SHA-1 PRFs: the probe reports these as
  inconclusive.
- IKE fragmentation (RFC 7383): ML-KEM-1024 messages fit in one datagram on the tested paths but may need
  fragmentation across a smaller MTU.
