# CycloneDX research and PQC test plan

## Decision

The next standalone public artifact should be a **PQC Claim Replay Kit**. It would compare what a supplier claims, what an SBOM or CBOM lists, what a configured product can use, and what a repeatable test actually observes. The buyer workbook would import the resulting evidence packet. A second general CBOM scanner would overlap with tools already listed in the [CycloneDX Tool Center](https://cyclonedx.org/tool-center/).

This is a design based on published documentation, not a benchmark result. No third-party scanner was run during this research pass. The Tool Center listed 316 tools on October 9, 2026, but its short descriptions sometimes lag project documentation. Pin a release or commit before comparing behavior.

## What the authoritative guides require

The [CBOM guide, second edition](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf) and [SBOM guide, third edition](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf) both cover CycloneDX 1.7. The browser workbook now has manual fields for the items below. A field is a place to record a finding; it does not validate an imported file or prove the finding.

| Need | Buyer question or input | Output and current status | Guide basis |
|---|---|---|---|
| BOM identity and scope | Which serial number, BOM version, product release, supplier, author, tool, creation time, and lifecycle phase apply? | BOM register; manual review | CBOM pp. 12-13, 35; SBOM pp. 11-12, 29-30 |
| Component identity | Which component name, version, PURL/CPE, supplier, and `bom-ref` supplies this use? | Crypto Map component and SBOM reference; manual link | SBOM pp. 29-30, 41-43, 59-60 |
| Cryptographic asset | Is this an algorithm, protocol, certificate, or related material? What family, variant, parameter, function, execution environment, and claimed security level apply? | Crypto Map asset type, method, parameter, protocol, and CBOM reference; detailed asset properties remain a next-build gap | CBOM pp. 9-10, 16-27 |
| Protocol path | Which connection leg, protocol version, cipher suite, key exchange, and identity method apply? | Separate Crypto Map uses and topology arrows; Tests T01-T06, T11-T12, T15 | CBOM pp. 19-22; [RFC 8446](https://datatracker.ietf.org/doc/html/rfc8446); [RFC 9954](https://datatracker.ietf.org/doc/html/rfc9954) |
| Key and certificate lifecycle | Who owns rotation, expiry, revocation, recovery, and custody? | Crypto Map lifecycle field and T14; manual review | CBOM pp. 11-15, 23-27 |
| Relationships | Does a component `dependOn` another part, or merely `provide` an algorithm? | BOM register notes, references, T13 and T18; graph import remains a next-build gap | CBOM pp. 5, 33-34; SBOM pp. 51-53 |
| Completeness | Is the inventory complete, incomplete, unknown, or redacted for components, services, and dependencies? What could discovery miss? | BOM register completeness and distribution fields; Crypto Map coverage; scorecard keeps manual coverage limits visible | SBOM pp. 12, 65-66; CBOM pp. 6, 35; [CISA discovery strategy](https://www.cisa.gov/sites/default/files/2024-09/Strategy-for-Migrating-to-Automated-PQC-Discovery-and-Inventory-Tools.pdf) |
| Evidence provenance | Was the item found in source, a manifest, a binary, runtime behavior, or supplier material? Does proof match this build and path? | Evidence register, test records, scorecard, CycloneDX claim drafts | SBOM pp. 33-37, 68-72; [attestation guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-Attestations-en.pdf) pp. 9-15 |
| Services and boundaries | Which external services, TLS termination points, devices, and trust boundaries sit outside the supplied product BOM? | Crypto Map source/destination/boundary and BOM register service notes | SBOM pp. 12, 51-53; CBOM pp. 27-35 |
| Licenses | Which licenses and commercial rights apply to each product, component, guide, or redistributed schema? | Repeatable license records with source/proof links; supplier support terms remain separate | SBOM pp. 43-45, 73 |

Two interpretation rules matter throughout the workbook. CycloneDX `provides` means a component implements a capability; it does not show that a deployed path used it. An omitted dependency record leaves the relationship unknown; an explicit empty `dependsOn` array has a different meaning ([SBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf), p. 52). A TLS cipher suite also does not establish the key exchange group or authentication algorithm ([CBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf), pp. 19-22). Keep vendor claim, listed asset, configured method, observed behavior, and buyer acceptance as separate states.

The CBOM guide's OpenSSL example on p. 27 appears to pair an asset named `ML-KEM-768` with `algorithmFamily: ML-DSA`. Treat examples as illustrations and check identifiers against the [CycloneDX 1.7 schema](https://cyclonedx.org/schema/bom-1.7.schema.json), [cryptography registry](https://cyclonedx.org/registry/cryptography/), and applicable FIPS standard before using them as test fixtures.

## Tool Center overlap and the remaining test opportunity

| Capability already documented | Examples | What this project should add |
|---|---|---|
| CBOM generation or inspection | [CBOMkit](https://github.com/cbomkit/cbomkit), [cdxgen CBOM mode](https://github.com/cdxgen/cdxgen/blob/master/docs/ADVANCED.md), [CBOM-Lens](https://github.com/OmniTrustILM/cbom-lens), [CipherIQ cbom-generator](https://github.com/CipherIQ/cbom-generator) | Same synthetic input for each tool; compare expected assets, extra assets, and unsupported scan scope. |
| PQC scan, conformance, and probing | [quantakrypto pqc-tools](https://github.com/quantakrypto/pqc-tools), [cbomctl](https://pypi.org/project/cbomctl/) | Tie results to the exact buyer build, path, release, configuration, negative control, and proof record. Do not call a local known-answer test a CAVP certificate. |
| General BOM validation and editing | [CycloneDX CLI](https://github.com/CycloneDX/cyclonedx-cli), [BOM Studio](https://github.com/CycloneDX/cyclonedx-bom-studio), [sbom-utility](https://github.com/CycloneDX/sbom-utility) | Check schema *and* cross-record meaning: unique references, relationship direction, declared coverage, secret-data handling, and claim-to-observation links. |
| SBOM generation and vulnerability work | The Tool Center lists Syft, Trivy, Grype, and Dependency-Track. | Join component identity to cryptographic assets and paths. Keep package vulnerabilities separate from proof of PQC deployment. |

Catalog descriptions are not a capability test. For example, [CBOMkit's current README](https://github.com/cbomkit/cbomkit) documents language coverage beyond its Tool Center summary, and [quantakrypto's README](https://github.com/quantakrypto/pqc-tools) includes tests and opt-in probing beyond the catalog blurb. The standalone kit should record each tool's version, command, fixture, output, and stated limits.

## Standalone PQC Claim Replay Kit

The workbook's 33 sourced tests are a conditional baseline, not an exhaustive protocol or product test suite. Reviewers can add sourced, product-specific test records for a path, deployment mode, algorithm, or supplier feature that the baseline does not cover. Each test now records whether the buyer requires it for procurement, who leads it, what blocks it, its prerequisites, and the pass rule. Those records participate in the test scorecard and can link to buyer proof.

**Inputs.** A synthetic fixture set, a supplier claim for one exact product release, one or more CycloneDX 1.7 SBOM/CBOM files, a declared deployment configuration, and optional local test traces. Store raw source files separately from the normalized buyer record. Record the producing tool, version, command, timestamp, file hash, trusted signature result if available, and distribution constraints.

**Core checks.** Validate the BOM against the official schema. Check reference uniqueness, links, component and asset identity, `dependsOn` versus `provides`, composition completeness, and BOM target matching. Compare the declared cryptography with configuration and observed test records. Report `matched`, `contradicted`, `not observed`, and `outside tool coverage` separately. A missing scanner finding in an unsupported language is not a clean result.

**Public synthetic fixtures.** Start with six small cases:

1. A PQC library is installed and listed as providing ML-KEM, but the product does not call it.
2. A client offers a hybrid TLS group while the negotiated group is classical.
3. A path uses PQC key establishment and classical certificate authentication.
4. A CBOM covers one release while the buyer is offered a later build.
5. A scanner analyzes a language or binary format outside its documented coverage.
6. A supplier BOM contains key-like material that must be rejected or stripped before storage or export.

Add a multi-leg edge-to-origin fixture and a resumed TLS session after the first pilot. Use only local services or explicit, authorized endpoints for active protocol tests. Never include real private keys or customer architecture in the public fixtures. A CycloneDX cryptographic-material field can hold a value, so the import boundary needs a secret-data check ([CBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf), pp. 20, 27).

**Outputs.** Emit a machine-readable comparison with fixture ID, product/build, tool/version, input hash, detected assets, expected assets, unsupported scope, false positives, false negatives, observations, counter-evidence, and remediation action. Emit a buyer-friendly HTML/JSON packet that the workbook can import as evidence, tests, and actions. A separate CycloneDX 1.7 declaration draft can carry claims, targets, and evidence. Do not add an assessor attestation, conformance score, affirmation, or signature until a real review and signing process exists ([CycloneDX 1.7 attestation example](https://cyclonedx.org/use-cases/attestations/)).

**Pilot order.** First run CBOMkit, cdxgen, and CBOM-Lens on the same source fixture. Then add a schema/registry check and one negative runtime fixture. Publish the fixture and expected results before publishing tool comparisons. This makes disagreements reproducible and gives tool maintainers a useful bug report rather than an unsupported ranking.

## What remains to build

Status on October 10, 2026:

- **BOM import:** importing a CycloneDX JSON BOM validates it in the browser against the official CycloneDX 1.7.2 schemas (bundled byte for byte, with the SPDX, JSF, and cryptography definitions they reference), verifies a single JSF signature against the embedded key, keeps the dependency graph, and rejects secret key material. The validator's verdicts are tested against Python's jsonschema on 600 valid and altered BOMs.
- **BOM signatures:** multiple signers, signature chains, certificate paths, and signatures inside components are reported as not checked.
- **Not compared:** two BOM releases are still not compared with each other.
- **CBOM export:** the manual crypto map exports a CycloneDX 1.7 CBOM marked inside as an unsigned draft built by hand.
- **Topology and scorecard:** the topology still comes from reviewer-entered source and destination fields. The scorecard measures the buyer record's completeness and linked proof, not full product coverage.
- **Claim export:** uses CycloneDX 1.7 declaration fields, is marked as an unsigned draft, and passes the bundled official schema in the project tests. It is not a signed attestation.

The replay kit in `tools/replay` now covers three protocols, each run against loopback fixtures or one authorized target:

- **TLS 1.3:** the selected key-establishment group, classical-only refusal, an unsupported hybrid group, certificate name checks, and session resumption.
- **SSH:** mlkem768x25519-sha256 negotiation confirmed by the host signature, advertised post-quantum methods, classical-only refusal, and the host key fingerprint.
- **IKEv2:** ML-KEM-768 as an additional key exchange (RFC 9370) with an IKE_INTERMEDIATE exchange, classical-only refusal, and ML-KEM-1024.

The SSH and IKEv2 code was checked against OpenSSH 10.0 and 10.5 and strongSwan 6.1.0; `tools/replay/INTEROP.md` records the results. Packets carry a digest, and the browser imports them as unreviewed buyer evidence. Change review compares an earlier assessment export with the current one, field by field.

Still to build: the six source-level fixtures listed above, release-to-release BOM comparison, and the harness items in `ROADMAP.md`. These are the parts that turn the manual workbook into a reusable buyer verification system.

## Source and license notes

The [CBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf) identifies © 2025 OWASP Foundation and CC BY 4.0; it notes IBM-contributed portions under Apache 2.0 (p. 2). The [SBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf) identifies © 2025 OWASP Foundation and CC BY 4.0 (p. 4). The [attestation guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-Attestations-en.pdf) identifies © 2024 OWASP Foundation and CC BY 4.0 (p. 2). This project links the guides and summarizes their concepts; it does not copy their figures or extended text. The bundled official 1.7 JSON Schema is covered by the [CycloneDX specification repository's Apache 2.0 statement](https://github.com/CycloneDX/specification/blob/master/README.md#copyright--license); its license text is included beside the schema. Decide this project's own public license before publishing.
