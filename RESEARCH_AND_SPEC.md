# PQC Claim Verification Kit: research baseline and release specification

Status: research and design, October 9, 2026. Intended destination: a new public GitHub repository. This file is a staging artifact. It does not certify products or establish legal requirements.

**Direction update, October 9, 2026:** The user expanded the requested artifact to a guided, plain-language PQC workbook with a vendor survey, crypto map, control-to-proof review, buyer record, tests, and action plan. The narrower TLS evidence bundle proposed below is now one verification module within that larger system. See [WORKBOOK_DESIGN.md](WORKBOOK_DESIGN.md) and the working spreadsheet. The original proposal remains here as research history.

## Decision

Build a buyer-run, reproducible **TLS 1.3 claim evidence bundle**. A reviewer should be able to take one precise vendor claim about a specific product build and deployment path, run a documented test, retain a redacted trace, and record exactly what the test established. The first release should cover hybrid post-quantum key establishment and record certificate authentication separately. Vendor documentation, FIPS algorithm testing, FIPS module validation, and operational observation remain distinct evidence classes.

This is narrower than a general PQC scanner or a new vendor questionnaire. The [PKI Consortium PQC Maturity Model (PQCMM)](https://pkic.org/wg/pqc/pqcmm/) already provides a product-level [survey, evidence matrix, and procurement guidance](https://pkic.org/wg/pqc/pqcmm/adoption/survey/). [CycloneDX CBOM](https://cyclonedx.org/capabilities/cbom/) already defines a cryptographic inventory format. [Cloudflare Radar](https://radar.cloudflare.com/post-quantum) and several open source scanners already probe hybrid TLS key exchange. The useful contribution is a reproducible, versioned **buyer evidence record** with negative controls, clear test limits, and links to existing assessments and inventories.

The likely first users are campus IT buyers, cyber clinics, small public agencies, and vendors preparing product-specific evidence. Federal agencies and National Security System (NSS) owners may use the method, subject to their own acquisition and evaluation rules. The kit should be designed to export findings to the [PQCA Readiness Tracking Working Group](https://pqca.org/blog/2026/announcing-the-pqc-readiness-tracking-working-group/) rather than start another product readiness database.

Other work to coordinate with: [NIST NCCoE's migration project](https://www.nccoe.nist.gov/applied-cryptography/migration-to-pqc) has discovery and interoperability workstreams; [PKI Consortium's CBOM Profiles Working Group](https://pkic.org/2026/06/08/pki-consortium-launches-the-cbom-profiles-working-group/) is developing reusable inventory profiles; and the [Post-Quantum Cryptography Alliance](https://pqca.org/blog/2026/announcing-the-pqc-readiness-tracking-working-group/) is building a public readiness tracker. [ETSI TS 103 744](https://www.etsi.org/deliver/etsi_TS/103700_103799/103744/01.02.01_60/ts_103744v010201p.pdf) is relevant to a later hybrid key-establishment profile beyond TLS. [Open Quantum Safe](https://github.com/open-quantum-safe/oqs-provider) is useful for laboratory experimentation, but its provider explicitly cautions against treating its prototype as a production security or standards certification result. Version 1 should map to these efforts and leave broader protocol profiles for later releases.

## Source status and policy boundaries

| Authority | Current finding | Consequence for the kit |
| --- | --- | --- |
| [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [204](https://csrc.nist.gov/pubs/fips/204/final), [205](https://csrc.nist.gov/pubs/fips/205/final) | Final standards for ML-KEM, ML-DSA, and SLH-DSA, August 2024. | Capture exact standard, algorithm, and parameter set. The marketing names Kyber and Dilithium do not by themselves establish conformance to final FIPS. |
| [NIST SP 800-227](https://csrc.nist.gov/pubs/sp/800/227/final) | Final key encapsulation guidance, September 2025. | Implementation review should address key checking, randomness, authentication, key derivation, and hybrid construction. A wire trace alone cannot establish these internals. |
| [NIST IR 8547](https://csrc.nist.gov/pubs/ir/8547/ipd) | Initial public draft as checked October 9, 2026. | Label its proposed algorithm transition schedule as draft; use issued policy for applicable deadlines. |
| [NIST CSWP 39 update 1](https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final) | Final crypto agility guidance, updated June 2026. | Ask how an algorithm is changed or disabled across software, firmware, certificates, and operations. |
| [RFC 9954](https://datatracker.ietf.org/doc/html/rfc9954) | Published hybrid TLS key exchange design, July 2026. It explicitly excludes authentication. | A successful hybrid key exchange cannot be reported as proof of post-quantum certificate authentication. |
| [RFC 10024](https://datatracker.ietf.org/doc/html/rfc10024) | Published Proposed Standard, August 2026. Defines TLS 1.3 groups `X25519MLKEM768`, `SecP256r1MLKEM768`, and `SecP384r1MLKEM1024`. | Test and record the selected group. Identify prestandard `X25519Kyber768Draft00` separately; RFC 10024 obsoletes it. |
| [RFC 9881](https://datatracker.ietf.org/doc/html/rfc9881) | Published ML-DSA X.509 certificate/CRL identifiers. | Record certificate public-key and signature algorithms; do not infer that a particular TLS stack accepts them. |
| [ML-DSA in TLS 1.3](https://datatracker.ietf.org/doc/draft-ietf-tls-mldsa/) | Internet-Draft in RFC Editor queue on the research date. | Track protocol status by version; do not call this a published RFC yet. |
| [NIST CMVP validated modules](https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules) | NIST explicitly distinguishes CAVP algorithm certificates from FIPS 140-3 module validation. | Require exact module certificate, security policy, version, operating environment, approved mode, and vendor mapping from the offered product to the module. |
| [NSA CNSA 2.0 FAQ v2.1](https://media.defense.gov/2022/Sep/07/2003071836/-1/1/1/CSI_CNSA_2.0_FAQ_.PDF) and [NSA October 1, 2026 announcement](https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/4615285/nsa-announces-post-quantum-cryptography-measures-to-safeguard-national-security/) | NSS-specific: under CNSS Policy 15, new commercial NSS must be able to support quantum-resistant algorithms starting in 2027, and legacy systems that cannot are to be phased out by 2030. FAQ also describes mandated protocol use by 2031 and a 2035 goal. | The kit must select policy context before assessing compliance. General TLS `X25519MLKEM768` evidence does not establish CNSA 2.0, which calls for ML-KEM-1024 and other NSA-selected algorithms. |
| [NSA approved CSfC capability packages](https://www.nsa.gov/Resources/Commercial-Solutions-for-Classified-Program/capability-packages/) | Current March 2026 packages mark several CNSA 2.0 additions as **objective** requirements. | Record package version and threshold/objective status. An evaluated CSfC product is not automatically shown to implement an objective function. |
| [CISA product categories](https://www.cisa.gov/resources-tools/resources/product-categories-technologies-use-post-quantum-cryptography-standards), [CISA release notice](https://content.govdelivery.com/accounts/USDHSCISA/bulletins/405c246) | January 2026 categories guide purchases. Broad availability of key establishment does not imply broad deployment of PQC signatures or authentication. | Treat category status as market guidance, not a certificate for any product. Record capability per function. |
| [CISA/NSA/NIST quantum-readiness guidance](https://www.nccoe.nist.gov/sites/default/files/2023-08/quantum-readiness-fact-sheet.pdf) | Joint guidance asks for cryptographic discovery, vendor engagement, and software/firmware signing coverage. | Ask vendors about embedded crypto, upgrade paths, integration dates, and costs; an endpoint test covers only the tested path. |
| [CISA automated discovery strategy](https://www.cisa.gov/sites/default/files/2024-09/Strategy-for-Migrating-to-Automated-PQC-Discovery-and-Inventory-Tools.pdf) | Automated discovery has material blind spots; no single tool establishes a complete inventory. | Require method and coverage statements for inventory claims. An empty scan is not evidence of absence. |
| [OMB M-26-15](https://www.whitehouse.gov/wp-content/uploads/2026/06/M-26-15-Execution-of-the-Migration-to-Post-Quantum-Cryptography.pdf) and [Executive Order 14412](https://www.whitehouse.gov/presidential-actions/2026/06/securing-the-nation-against-advanced-cryptographic-attacks/) | Civilian federal high-value/high-impact key establishment by December 31, 2030; signatures by December 31, 2031; remaining migration through 2035. OMB memo excludes NSS. A proposed FAR contractor rule and CISA/NIST CBOM minimum elements are future deliverables as of this date. | Record buyer/system applicability. Do not output a universal "2030 compliant" label or present future FAR/CBOM text as effective. |
| [GSA PQC buyer's guide](https://buy.gsa.gov/api/system/files/documents/final-508c-pqc_buyer-s_guide_2025.pdf) and [GSA procurement page](https://www.gsa.gov/technology/it-contract-vehicles-and-purchasing-programs/it-security/postquantum-cryptography) | GSA calls for procurement visibility, vendor support, interoperability, costs, and crypto agility. | Include product SKU, support period, update rights, included license tier, validation evidence, and acceptance tests. |
| [CISA/FBI Product Security Bad Practices](https://www.fbi.gov/file-repository/cyber/csa/product-security-bad-practices-011425.pdf) | Voluntary joint product guidance, January 2025. Calls for standardized PQC support, a disclosure policy, support periods, and logs. | Ask for product-specific disclosure and update commitments. Do not characterize this as an FBI PQC mandate. |
| [PKI Consortium PQCMM](https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/) | Existing Level 2 calls for conformance, independent interoperability, functional, and representative performance evidence. | Map bundle records to PQCMM criteria without assigning a maturity level. Formal certification availability was not verified as launched on October 9, 2026. |

Source access note: the CISA category page returned HTTP 403 through the research browser. Its official release notice was available; table detail was cross-checked against an [independent republication](https://www.assurantcyber.com/blog/product-categories-technologies-use-post-quantum-cryptography-standards/) and a [government annex](https://dst.gov.in/sites/default/files/Report_TaskForce_PQMigration_4Feb26%20%28v1%29.pdf). The [CNSS Policy 15 site](https://www.cnss.gov/CNSS/issuances/Policies.cfm) returned HTTP 502. Before publishing verbatim tables or policy language, obtain and check those original texts. The accessible NSA FAQ and announcement support the dates summarized above.

Second source check, October 9, 2026, during the five-perspective review. Confirmed against the publishers: RFC 10024 is a Proposed Standard that defines `X25519MLKEM768`, `SecP256r1MLKEM768`, and `SecP384r1MLKEM1024`; RFC 9954 is an Informational RFC that defines the general hybrid construction and names no particular post-quantum algorithm; RFC 9881 is the Standards Track ML-DSA certificate profile; SP 800-227 was finalized on September 18, 2025; OMB M-26-15 was issued on June 24, 2026 and covers civilian agencies only; Executive Order 14412 was signed on June 22, 2026 and published in the Federal Register on June 25, 2026; CSWP 39 upd1 carries updates as of June 29, 2026. The ML-KEM hybrid key exchange for SSH (`draft-ietf-sshm-mlkem-hybrid-kex`) was still an Internet-Draft, and RFC 9370 defines multiple key exchanges in IKEv2. Reconfirmed October 10, 2026: the NSA press release linked in the table, which had refused automated access, opened in a browser. It is dated October 1, 2026. It attributes both dates to CNSS Policy 15: from 2027 all new commercial NSS must be able to support quantum-resistant algorithms, and legacy systems that cannot are to be phased out by 2030. It cites Executive Order 14412 and speaks of quantum-resistant algorithms without naming CNSA 2.0.

## Exact claim model

One record represents one cryptographic function on one product build and deployment path. A vendor's organization-wide statement is an input claim, not the unit of verification.

Required identity fields:

- Manufacturer; product and SKU; edition; software/firmware version and build; deployment mode; region or operating environment; license tier; support end date.
- Cryptographic function: key establishment, server authentication, client authentication, certificate issuance or verification, software/firmware signing or verification, backup/key wrapping, or another explicitly named function.
- Direction and path: client-to-edge, edge-to-origin, service mesh, backend, management plane, device-to-controller, or other named segment. Include TLS termination owner, SNI, hostname, resolved IP, port, and relevant proxy/CDN.
- Algorithm and parameter set; FIPS or protocol identifier; relevant RFC/group code point; classical, hybrid, or PQC-only mode; default/optional/preview/production state.
- Claimed effective date and vendor statement URL or document; exact quotation span or page reference if needed; date accessed.
- Buyer context: general commercial, civilian federal, NSS, CSfC, defense supplier supporting an NSS, or other. A product can be evaluated under more than one context with separate conclusions.

Required evidence fields:

- Evidence kind: vendor assertion, product documentation, local observation, independent interoperability report, CAVP algorithm certificate, CMVP module certificate, NIAP evaluation, or other named source.
- Evidence identity: issuer/observer, date, tested version, environment, method, source link or retained local file, redaction status, and a checksum for change detection. A checksum preserves file integrity; it does not establish who made the claim.
- Test method: tool version, exact invocation or machine-readable procedure, client/server configuration, test fixtures, expected result, observed result, and negative-control result.
- Scope limits: untested IPs/regions, client populations, resumed sessions, edge-to-origin leg, authentication, internal signing, and hardware state as applicable.
- Conclusion for this single claim: observed, supported by documentation, vendor-attested, contradicted, inconclusive, or untested. Store independent validation status in separate fields. Never turn a timeout or unsupported test client into a product failure.

Example of an honest conclusion: "Version X negotiated `X25519MLKEM768` on a fresh TLS 1.3 client-to-edge connection with the stated configuration. The observed certificate chain used conventional signatures. Edge-to-origin traffic and resumed sessions were not tested. No FIPS module validation claim was assessed."

A synthetic record might look like this; the schema and field names are provisional:

```yaml
claim_id: tls-ke-001
subject:
  product: Example Web Gateway
  version: 2.4.1
  configuration: lab-profile-a
  hostname: gateway.example.test
  path: client-to-edge
claim:
  function: tls13-key-establishment
  group: X25519MLKEM768
  availability: opt-in-production
observation:
  method: fresh-handshake
  selected_group: X25519MLKEM768
  certificate_signature: ECDSA
  raw_trace: evidence/tls-ke-001-redacted.txt
  negative_control: evidence/tls-ke-001-classical-client.txt
assurance:
  cavp_certificate: unknown
  cmvp_module_certificate: unknown
limits:
  - edge-to-origin-unobserved
  - resumed-sessions-unobserved
conclusion: key-establishment-observed-on-tested-path
```

## Vendor questions and the proof to request

Use the [PQCMM vendor survey](https://pkic.org/wg/pqc/pqcmm/adoption/survey/) for general supplier maturity. These questions obtain the implementation detail needed for a buyer-run test. Ask them **per product version and cryptographic function**.

| Question | Minimum proof or honest answer |
| --- | --- |
| 1. What exact product, SKU, edition, build, platform, and deployment configuration is offered? | Release identifier, configuration guide, and support date. |
| 2. Is each PQC feature production, opt-in, preview, beta, roadmap, or a capability of an underlying library only? | Release note and feature configuration; production support statement. |
| 3. Which traffic leg terminates TLS, and who owns every subsequent encrypted leg? | Architecture diagram and owner for edge, proxy, origin, service mesh, backend, and management paths. |
| 4. Which functions use PQC today: key establishment, server/client authentication, certificate chain, software updates, firmware, boot, identity, backups? | Function-by-function inventory or CBOM references; separate algorithm and version for each. |
| 5. Which final NIST algorithms and parameter sets are implemented? Are any names or wire identifiers prestandard? | Standards and parameter mapping; supported group/OID list; implementation release note. |
| 6. For TLS 1.3, which hybrid named groups can be offered and which are negotiated by default? | Config export and redacted handshake trace with selected group and client/server versions. |
| 7. What happens with a classical-only peer, an unsupported group, or a failed hybrid negotiation? | Reproducible negative-control trace and documented fallback policy. |
| 8. Can a customer require hybrid or PQC-only key establishment on a defined path? | Exact switch, policy, and a test showing permitted/blocked behavior. |
| 9. Does the deployment use the same algorithms in every region, IP, tenant, or service tier? | Deployment matrix and sample tests across representative variants. |
| 10. Which certificate public-key and signature algorithms authenticate server and client? | Certificate chain and validation trace. Record key establishment separately. |
| 11. Who signs updates, firmware, boot images, recovery media, and packages, and who verifies them? | Signed test artifact, verification result, trust-anchor design, and update-path documentation. |
| 12. Can trust anchors and algorithms be changed without replacing hardware? | Supported migration procedure and a demonstrated update or test report. |
| 13. Which cryptographic components are first-party, operating-system, cloud, HSM, or other vendor dependencies? | Embedded component inventory/CBOM, versions, owners, and upgrade commitments. |
| 14. Which CAVP algorithm certificates apply? | Certificate IDs and exact implementation/function mapping; no inference of module validation. |
| 15. Which active FIPS 140-3 CMVP module certificate applies in the offered configuration? | Certificate ID, Security Policy, version, operating environment, approved mode, boundary, and signed vendor product-to-module mapping. |
| 16. For an NSS or CSfC claim, which CNSA 2.0 parameters and current package requirements apply? | Exact policy/package version, threshold/objective status, Security Target or evaluation report, tested configuration, and exceptions if applicable. |
| 17. What independent interoperability and functional security tests cover this version? | Partner implementation/version, procedure, results, limitations, and date. |
| 18. What performance and compatibility changes occur with realistic handshake sizes and network conditions? | Defined benchmark conditions, failure rates, latency, CPU/memory use, and protocol/middlebox issues. |
| 19. How will the vendor change algorithms or disable a broken one? | Crypto agility procedure across software, firmware, certificates, dependent services, and rollback. |
| 20. Which customer actions, licenses, hardware replacements, and costs are required to reach the claimed state? | Versioned roadmap, contract/support terms, upgrade entitlement, milestones, and accountable owner. |
| 21. What is the product's support end date and cryptographic vulnerability reporting path? | Product-scoped vulnerability disclosure policy, support statement, security update commitment, and log export method. |
| 22. Where is the inventory incomplete or inaccessible to discovery tools? | Coverage statement, manual reconciliation, blind spots, and date of last review. |

For civilian federal inventory alignment, [OMB M-23-02](https://www.whitehouse.gov/wp-content/uploads/2022/11/M-23-02-M-Memo-on-Migrating-to-Post-Quantum-Cryptography.pdf) expects system impact and asset identifiers, vulnerable algorithm/use and key size, product provenance, OS and hosting details, data type and protection life, and notes. Those identifiers and a full CBOM can reveal sensitive infrastructure. Public examples should use synthetic data and publish redacted findings only.

## Version 1 test profile: buyer-controlled TLS 1.3

Run tests in a local lab or against a service the tester is authorized to assess. Use established TLS tools and parsers; the project should package and verify their outputs rather than implement a new TLS stack or a generic Internet scanner. Preserve raw redacted output alongside parsed fields so a reviewer can check interpretation.

| Test | Expected evidence | What it does not prove |
| --- | --- | --- |
| Baseline fresh handshake with RFC 10024 hybrid group offered | TLS 1.3 handshake result; offered groups; **selected** group; SNI, destination, client/server versions; full trace or capture. | Authentication algorithm, origin/backend traffic, FIPS status, every client path. |
| Forced classical-only client | Successful classical negotiation or documented rejection; exact group and policy. | That a fallback is a vulnerability in every buyer context. |
| Forced hybrid-required client | Hybrid negotiation or explicit failure. | That every client uses this policy by default. |
| Unsupported or obsolete group | Defined failure/fallback behavior; distinguish `X25519Kyber768Draft00` from RFC 10024 groups. | Broad protocol conformance from one negative case. |
| Certificate and hostname validation | Leaf and chain public-key/signature algorithms; hostname, chain, trust, expiration result; deliberate bad-hostname fixture. | Post-quantum signatures in other workflows. |
| SNI and deployment variation | Repeat by documented hostname, IP, region, or tenant; record edge/CDN changes. | Internal origin path unless tested from its side or documented by operator evidence. |
| Interoperability with an independent implementation | Both implementations and versions, negotiated result, repeatable setup. | Complete implementation security or side-channel resistance. |

The [RFC 9954](https://datatracker.ietf.org/doc/html/rfc9954) backward-compatibility design permits a hybrid-aware peer to negotiate classical key exchange when policy allows it. The kit should report this behavior and the buyer's required policy, then state whether the observation meets that policy. For a CDN or reverse proxy, test each owned leg separately where authorized. A public edge handshake cannot establish the edge-to-origin algorithm; [Cloudflare documents distinct visitor and origin behavior](https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-cloudflare-products/).

Session resumption and 0-RTT should have a required **untested/optional extension** field in version 1. [TLS 1.3 RFC 8446](https://datatracker.ietf.org/doc/html/rfc8446) gives resumed sessions different key-establishment properties; a fresh hybrid handshake does not establish properties of all resumed traffic. Do not turn a future resumption test into a claim about stored data, firmware signing, or the full application stack.

## Evidence interpretation rules

Keep three axes separate:

1. **Capability and deployment:** documented, configured, and actually negotiated are different states. "The library contains ML-KEM" establishes less than "this product build negotiated the RFC 10024 group on this path."
2. **Assurance:** a lab trace, independent interoperability result, CAVP algorithm certificate, CMVP module certificate, and NIAP evaluation answer different questions. [NIST explicitly warns](https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules) that an algorithm certificate alone does not validate the module or product. Check certificate status and exact version before using it.
3. **Policy applicability:** civilian federal, NSS/CNSA, CSfC, and general commercial use have different requirements. An RFC 10024 `X25519MLKEM768` test is useful for general TLS key exchange; it does not by itself demonstrate NSS CNSA 2.0 ML-KEM-1024 compliance. The [NSA FAQ](https://media.defense.gov/2022/Sep/07/2003071836/-1/1/1/CSI_CNSA_2.0_FAQ_.PDF) is the source for the latter profile.

Additional claim traps to include in fixtures and documentation:

- A PQC-capable category is not a product certification. CISA's listing also leaves significant signature and authentication gaps.
- A browser-to-CDN hybrid handshake does not describe CDN-to-origin or backend traffic.
- A current TLS feature does not protect software/firmware update signatures. An update verifier and signing service must each be examined.
- A "FIPS compliant algorithm" statement does not establish an active FIPS 140-3 module certificate for the exact offered version and operating environment.
- A NIAP or CSfC listing does not prove an objective PQC option was in the evaluated configuration.
- A failed client handshake can result from client configuration, network path, SNI, or middlebox behavior. Classify it as inconclusive until the cause is established.
- QKD is a different technology. [NSA does not recommend it for NSS data transmission under current limitations](https://www.nsa.gov/Cybersecurity/Post-Quantum-Cryptography-Resource-Hub/Article-Display/Article/4616320/quantum-cryptographic-solutions-are-limited-compared-to-post-quantum-algorithms/); a QKD deployment does not evidence CNSA 2.0 algorithm support.

## Release contents and acceptance criteria

Proposed repository layout for a new repository:

```text
README.md                  Purpose, users, scope, start here
docs/sources.md            Dated primary source ledger and policy status
docs/claims.md             Atomic claim model and interpretation rules
docs/vendor-evidence.md    Questions and required supporting artifacts
profiles/tls13-hybrid.md   Reproducible positive and negative test procedure
schema/claim.schema.json   Machine-readable evidence record schema
examples/                 Synthetic pass, partial, inconclusive, and contradiction cases
fixtures/                 Local TLS endpoints and known expected outcomes
tools/                    Small capture/normalization and report generator
tests/                    Schema, parser, and fixture assertions
SECURITY.md                Testing scope, evidence handling, disclosure route
```

Version 1 is ready for public release when:

1. A reviewer can run all local fixtures and reproduce the expected report without contacting a public target.
2. A hybrid key-exchange fixture is reported as **key establishment observed**, while its classical certificate chain remains plainly visible.
3. A classical-only fixture, an unsupported group, a bad certificate, and a client/tool failure produce different, accurate outcomes. Unknown never becomes "absent" or "pass."
4. The record captures exact version, configuration, SNI/path, timestamp, tool versions, raw redacted evidence, and test limits. The parser does not invent missing observations.
5. CAVP and CMVP evidence appear as separate fields, with active certificate checks and exact product-to-module mapping left for vendor documentation.
6. One buyer and one vendor can review the fields, and an independent tester can reproduce the lab result. Record their requested changes and unresolved disagreements.
7. Sources and tests are reviewed against the latest issued NIST/IETF/NSA/CISA text immediately before release. Draft guidance and future acquisition rules remain labeled as such.

The first semester can be divided into source/claim schema, lab fixtures and capture, then a pilot with a real buyer and vendor. Publish the full research trail, test fixtures, failures, and known blind spots. Submit useful evidence-format feedback to the [PQCA readiness group](https://pqca.org/blog/2026/announcing-the-pqc-readiness-tracking-working-group/) and map the final fields to [PQCMM](https://pkic.org/wg/pqc/pqcmm/) and [CycloneDX CBOM](https://cyclonedx.org/capabilities/cbom/) rather than proposing a competing maturity score or inventory standard.

## Open research and release gates

- Retrieve the original CNSSP 15 policy text and current CISA category table before quoting either verbatim. Both official sites blocked the available research browser during this pass.
- Check the current NIAP Policy #33 text. Its announcement was visible on the [NIAP homepage](https://www.niap-ccevs.org/), but the policy letter was not accessible through the research tool.
- Confirm current CMVP certificate records, RFC errata, TLS signature draft status, and PQCMM certification availability at the time of release. These can change.
- Decide whether the initial pilot targets a campus-operated TLS service, a vendor lab instance, or both. Get the owner's authorization and configuration details before running live tests.
- Decide whether public example bundles show synthetic product names only or include a vendor-approved real product case. Do not publish sensitive CBOMs, internal hostnames, secrets, or raw private network captures.
