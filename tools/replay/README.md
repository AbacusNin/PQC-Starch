# PQC replay harness

A command-line tool that runs repeatable key-establishment probes over TLS 1.3, SSH, and IKEv2 and writes down what happened: which method the server selected, whether it refused a client that offered only classical methods, and whether the server's identity checked out. The result is a JSON packet that the browser workbook imports as buyer-produced evidence.

The workbook itself is a static web page. A browser cannot open SSH or IKE connections, or choose TLS key-exchange groups, so the probes run here, on a machine you control, and the page only reads the packet.

It needs Node.js 24 or later built with OpenSSL 3.5 or later, which provides ML-KEM and the `X25519MLKEM768` TLS group. It has no other dependencies, needs no OpenSSH or strongSwan installation, and never writes a private key to disk.

## Two modes

`self-test` starts loopback servers with known settings and probes them. It proves the probes can tell hybrid from classical negotiation in all three protocols, catch a name mismatch, and refuse to count an SSH exchange whose host signature fails or an IKEv2 reply that does not decrypt. A self-test packet says nothing about any product, so the workbook refuses to import one as test evidence.

```bash
node tools/replay/replay.mjs self-test --out self-test.json
```

`probe` connects to one target you are authorized to test. It will not run without `--authorized`.

```bash
node tools/replay/replay.mjs probe --protocol tls --target lab-gateway.example.test:443 --authorized --require-hybrid --build "4.2.0 lab image" --ca lab-ca.pem --out tls.json
node tools/replay/replay.mjs probe --protocol ssh --target lab-gateway.example.test:22 --authorized --require-hybrid --host-key SHA256:... --out ssh.json
node tools/replay/replay.mjs probe --protocol ike --target lab-vpn.example.test:500 --authorized --require-hybrid --out ike.json
```

`--require-hybrid` states the buyer's policy that a classical-only client must be refused. For TLS, `--ca` supplies the certificate authority for a lab target; without it, identity checks on a privately issued certificate come back inconclusive. For SSH, `--host-key` is the fingerprint the supplier published, in the form `ssh-keygen -l` prints.

What each probe sends:

- **TLS:** ordinary handshakes, the same as a browser or `openssl s_client`.
- **SSH:** the version exchange, the algorithm lists, and one key exchange. It verifies the host's signature over the exchange hash, then disconnects. It never authenticates, so it is less than an ordinary `ssh` login attempt.
- **IKEv2:** IKE_SA_INIT and, when ML-KEM is chosen, one IKE_INTERMEDIATE exchange. It never sends IKE_AUTH, so it needs no credentials and creates no tunnel. The responder drops the half-open exchange after its own timeout.

## Probes and outcomes

| Protocol | Probe | Workbook tests | Expected result |
|---|---|---|---|
| TLS | Hybrid and classical groups offered | T01 | The hybrid group is selected |
| TLS | Only a classical group offered | T02, and T15 when hybrid is required | Refused when hybrid is required; otherwise recorded |
| TLS | Only `SecP384r1MLKEM1024` offered | T03 | Recorded |
| TLS | Certificate against the server name, and against a wrong name | T04 | Trusted and matching; wrong name refused |
| TLS | A second connection resuming the first session | T11 | Recorded |
| SSH | `mlkem768x25519-sha256` offered first, classical after | T19 | The hybrid method is negotiated and the host signature verifies |
| SSH | Post-quantum methods the server lists | T19 | Recorded |
| SSH | Only classical methods offered | T19, and T15 when hybrid is required | Refused when hybrid is required; otherwise recorded |
| SSH | Host key fingerprint | T19 | Matches `--host-key` when given; otherwise recorded |
| IKEv2 | ML-KEM-768 offered as an optional additional key exchange (RFC 9370) | T20 | ML-KEM-768 chosen, and the IKE_INTERMEDIATE reply carries its ciphertext |
| IKEv2 | No additional key exchange offered | T20, and T15 when hybrid is required | Refused when hybrid is required; otherwise recorded |
| IKEv2 | Only ML-KEM-1024 offered | T20 | Recorded |

Each probe ends in one of four outcomes. **matched** and **contradicted** compare the observation with a stated expectation. **recorded** means nothing was expected and the behavior is simply written down. **inconclusive** means the probe could not establish a result: a refused connection, a timeout, an untrusted certificate chain, an SSH host signature that did not verify, an IKEv2 reply that did not decrypt, or a responder that accepted none of the probe's cipher suites. An inconclusive probe is never reported as a product failure.

## What a packet does not show

A packet covers one target address, one client, and one point in time. It does not show internal network legs, other regions or tenants, resumed sessions beyond the one tried, certificate or host-key signature migration, user authentication, or FIPS validation.

- **SSH:** the host key and its signature are classical in every method tested.
- **IKEv2:** ML-KEM decapsulation cannot detect a malformed ciphertext. A completed exchange shows the responder returned an ML-KEM ciphertext of the right size inside a reply authenticated under the classical keys. It does not prove the post-quantum secret was mixed into later keys, because confirming that needs IKE_AUTH and credentials.

The workbook imports a packet as one unreviewed evidence record. A reviewer must confirm that the target was the offered build and path, link each test to its crypto use, and sign the result before the scorecard counts it.

The packet carries a SHA-256 digest over its contents. The workbook refuses a packet whose digest does not match, which catches edits made after the harness wrote it. The digest does not prove who ran the harness.

## Interoperability

The fixtures and the probes share code, so they were also checked against independent implementations: the OpenSSH 10.5 client against the SSH fixture, the probe against OpenSSH 10.0 servers, and the probe against strongSwan 6.1.0 responders. [INTEROP.md](INTEROP.md) records the versions, image digests, and results.

## Tests

```bash
node --test "tools/replay/test/*.test.mjs"
```

The tests include deliberate contradictions. Examples: a classical-only TLS fixture probed with a hybrid expectation, an SSH fixture with a corrupted host signature, and an IKEv2 responder whose reply is sealed with the wrong keys. Each must be flagged. That shows the harness can detect a difference instead of reporting success by default. When an OpenSSH client with `mlkem768x25519-sha256` is installed, the SSH tests also have it check the fixture.
