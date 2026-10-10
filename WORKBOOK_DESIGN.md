# PQC buyer verification workbook: design and release path

Research checked October 9, 2026. The current Excel companion is version 5, written by `build_workbook.mjs` (`npm run build:workbook`) from the same `web/content.js` the browser app uses. This document states what it does, where its content came from, and what the browser version must preserve.

## The job

A buyer should be able to answer a narrow question: **What does this exact product version do with cryptography, what proof did we inspect, what remains unknown, and what must happen before we rely on the claim?**

One workbook assesses one offered product or service and its named deployment setup. A vendor-wide claim is a lead to investigate. A green status in a public library tracker is a lead to investigate. Neither is proof that the buyer's deployed path uses a specified algorithm.

The first users are a campus buyer, a cyber clinic, a small public agency, and a supplier preparing a response. The primary reader may not be a cryptographer. The reviewer who accepts technical proof should be able to trace every conclusion back to a document or repeatable test.

## Work path

1. **Buyer Record:** identify product, version, setup, vendor, buyer setting, reviewer, and decision. Counts show work completed; they are not a readiness score.
2. **Vendor Survey:** ask 38 short questions. Each answer has a requested proof type, proof ID, buyer review, and follow-up. The survey combines the [PKI Consortium's product-specific PQCMM intake approach](https://pkic.org/wg/pqc/pqcmm/adoption/survey/) with the implementation questions needed for a buyer-run verification.
3. **Crypto Map:** identify every known use of cryptography, its path, purpose, current method, component, owner, data life, future target, and coverage gap. This is a manual intake map. A complete machine-readable CBOM should use [CycloneDX CBOM](https://cyclonedx.org/capabilities/cbom/).
4. **Evidence:** register each document, trace, report, inventory, or certificate once. The reviewer records whether its product version and path match the claim, its sensitivity, and the review result.
5. **Tests:** record what was expected, observed, and not tested. The included tests cover hybrid TLS key exchange, fallback, authentication, signing, interoperability, performance, and algorithm change. They are plans until someone runs them on an authorized target. A reviewer records each result, or imports one from the replay harness in `tools/replay`.
6. **Control Proof:** review 26 plain-language expectations, each linked to source IDs and vendor questions. An accepted row is a buyer review result, not a FIPS, PQCMM, CNSA, or policy certification.
7. **Actions:** assign gaps, target dates, dependencies, and closure proof. The buyer conclusion names conditions and reassessment triggers.
8. **Terms & Sources:** definitions and links keep the main sheets short. Excel Notes on terms and selected technical prompts appear on hover in supported spreadsheet apps.

The [PQCA readiness tracker](https://github.com/PQCA/wg-readiness-tracking) is useful for discovering libraries and public project links. Its current [template is an early draft](https://github.com/PQCA/wg-readiness-tracking/blob/main/tracking-template.md), and its own cryptography page describes seed data as incomplete and not fully vetted. Import its link and version as a lead, then inspect the original project documentation and the offered product. The buyer's record should never silently inherit the tracker's status.

## Evidence rules

Every claim should bind these fields:

- The product, SKU or stable identifier, edition, build, deployment mode, license tier, and configuration.
- The cryptographic function and path. Key establishment, identity checking, signing, and encryption need separate conclusions.
- The claimed algorithm and parameter choice, standards version, availability state, and the date of the vendor claim.
- The proof ID, issuer or observer, date, method, product/version match, path match, and sensitivity.
- The buyer review result: accepted, needs clarification, rejected, or not reviewed. A test can separately be observed, failed, inconclusive, not run, or not applicable.
- The limitation: untested traffic leg, region, client, resumed connection, signing path, or module configuration.

An answer of `Unknown` is useful. An empty scan does not establish that no cryptography is present. A successful hybrid TLS handshake establishes the selected key exchange for that connection; it does not establish post-quantum certificate authentication or FIPS module validation. A CAVP algorithm certificate and a CMVP module certificate answer different questions. The [NIST CMVP registry](https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules) and exact module security policy are needed to evaluate a module claim.

Proof may expose infrastructure, software composition, or customer data. Keep the workbook's record as a reference, and store sensitive source files in the buyer's approved system. Public examples must use synthetic products and redacted traces. Do not put full private CBOMs, credentials, internal network maps, or unredacted customer data in a public repository.

## Policy boundary

The workbook asks the buyer to choose a setting and cite the rule that applies. It does not infer a universal 2030 deadline. [OMB M-26-15](https://www.whitehouse.gov/wp-content/uploads/2026/06/M-26-15-Execution-of-the-Migration-to-Post-Quantum-Cryptography.pdf) addresses civilian federal migration. [NSA CNSA 2.0](https://media.defense.gov/2022/Sep/07/2003071836/-1/1/1/CSI_CNSA_2.0_FAQ_.PDF) addresses National Security Systems. Their scopes and algorithm choices differ. Procurement teams should verify applicability and current text for their system and contract.

The workbook's control rows are original summaries linked to authorities. They do not reproduce or replace official requirements. It does not calculate a PQCMM level. A supplier claiming a PQCMM level should provide the actual product assessment and a criterion-by-criterion matrix.

## Browser version: the AudiOS pattern

[AudiOS](https://github.com/AbacusNin/AudiOS) demonstrates a useful local workflow: a guided assessment, hover glossary, evidence log, action milestones, local storage, whole-assessment export/import, and a printable decision record. The PQC browser version should use the same user-facing pattern while retaining its own data model and source mappings. AudiOS is AGPL-3.0 licensed; copying its code would require a license decision and compliance with that license. This workbook copies no AudiOS code.

**Build status, October 9, 2026, after the five-perspective review:** The local browser app in `web/` has the guided survey, product record, manual crypto map, linked evidence with producers, local attachments, tests, replay-packet import, control review, actions with risk acceptance, field tooltips, process flow, license intake, evidence scorecard, suggested claim drafts, change review, encrypted or plain JSON export and import, autosave, and print record. AudiOS is absent from the app's resource library and source ID list. The scorecard measures review evidence, not product compliance. Claim draft exports use CycloneDX 1.7 declaration fields, pass the bundled official schema, and are marked inside as unsigned drafts. They are not signed attestations.

The Excel v5 file shares its questions, controls, tests, terms, and sources with the browser app. Its Evidence sheet records who produced each item and calculates whether it qualifies under the scorecard rule. The process, scorecard, claim-draft, replay, and change-review views remain browser features.

The browser version should provide:

- A one-question-at-a-time view for nontechnical users, with plain definitions beside any acronym.
- A product page and a crypto-use page. One product may have many cryptographic uses and paths.
- A claim page where vendor words, supporting documents, observed tests, and reviewer conclusions are visibly distinct.
- A proof drawer that shows product/version match, source, date, confidentiality, and linked claims.
- A criteria matrix that imports or references a real PQCMM report without inventing a maturity level.
- An action tracker with milestones, owner, due date, closure proof, and accepted-risk sign-off.
- A local JSON export with schema version and stable IDs. A print/PDF buyer record should omit sensitive attachments by default.
- Optional CycloneDX CBOM import and export mapping. Preserve unknown fields; do not claim a manual map is a standards-compliant CBOM.
- A curated link to PQCA component readiness entries, with checked date and source. Do not create a second unverified product database.
- A change log that says which product version, evidence, tests, or policy source changed since the previous review.

Local-first storage should remain a deliberate design choice. The app should explain where information is saved and make export and deletion clear. If attachments are added, set size limits, validate file type and content, store them locally, and require an explicit decision before an export includes them. No telemetry or network submission should be added by default.

## Gaps after the first browser release, and where they stand

1. **Atomic claim trail:** still open. Vendor statement, build and path, algorithm, proof, observed test, buyer conclusion, and limits live in separate records. Claim drafts join them per crypto use, and a single wrong-scope proof item demotes a draft, but there is no claim card that a reviewer edits as one unit.
2. **Full evidence packet:** mostly closed. The print record now carries survey answers, the evidence register with producers, tests with negative controls and limits, open actions, and accepted risks. The claim export can leave out proof locations. A redaction preview for the full assessment export remains open.
3. **Repeatable lab method:** closed for TLS 1.3. The replay harness in `tools/replay` builds loopback fixtures, records the selected group, refuses to treat a probe failure as a product failure, includes negative controls, and writes a digest-protected packet the browser imports as unreviewed buyer evidence. SSH and IKEv2 probes remain open.
4. **Exchange with existing standards:** partly closed. Claim draft exports pass the official CycloneDX 1.7 schema. BOM import still does not validate the supplied file or keep its dependency graph, and a PQCMM criterion matrix remains open. The [CycloneDX attestation guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-Attestations-en.pdf) and [current use-case example](https://cyclonedx.org/use-cases/attestations/) separate a claim from an assessor's conformance, confidence, and signature.
5. **Change and link integrity:** mostly closed. Change review compares an earlier export with the current assessment. Deleted IDs are never reissued, deleting a record removes links to it, and Evidence flags links that point at nothing. Checked dates on PQCA references remain open.
6. **Risk acceptance and privacy:** closed. Accepted risks record an approver, scope, and expiry, and the scorecard flags any without them. Exports can be encrypted with a passphrase. Attachments must match their declared type by content, and secret key material is refused on every save and import path.
7. **Public release checks:** open, and these need the project owner. Choose a project license, run a synthetic buyer and reviewer pilot, and verify spreadsheet Notes in the target Excel and LibreOffice versions. Sources were rechecked on October 9, 2026; see the research record.

## Next release checks

Before a public release, run a clinic pilot with a nontechnical buyer and a technical reviewer on one synthetic product. Observe where either person misunderstands `PQC support`, `hybrid`, `certificate`, `validated`, or `2030`. Revise the wording. Check every source version. Exercise a negative control and record one deliberately inconclusive test. Confirm the exported buyer record preserves all limitations and does not suggest certification. Test spreadsheet Notes in the target Excel version and LibreOffice; hover behavior varies by application.
