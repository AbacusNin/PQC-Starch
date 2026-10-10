# Buyer workflow and coverage review

Reviewed October 9, 2026. The 33 tests and 26 control checks are a buyer intake baseline for one product release and setup. They are original review prompts linked to primary sources. They do not reproduce an agency control catalog, certify a product, or make every test a universal purchasing requirement.

## How the records relate

| Record | Question it answers | Relationship |
|---|---|---|
| Vendor survey | What does the supplier claim for this release? | One answer creates one unreviewed supplier-statement record. Separate files or traces can link to that question. |
| Evidence | What artifact supports or contradicts a claim, and who checked it? | One artifact may support several questions, tests, or controls. Each use must match the product and path. |
| Test | What was observed on a named build and route? | One test can inform several controls. A passing handshake does not prove every identity, network, or lifecycle path. |
| Control proof | Has the buyer checked a meaningful expectation against its source, answer, proof, and relevant tests? | One control may need several answers and tests. Several controls may share one artifact. |
| Action | Who resolves a gap or blocked requirement? | Links to the missing proof or test and needs closure evidence. |

A one-to-one control-to-test or control-to-survey design would hide gaps. For example, the key-exchange control needs the negotiated group, every relevant connection leg, fallback behavior, and a negative control. A supplier's single "yes" answer cannot establish all four. The [CycloneDX CBOM guide](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf) distinguishes a component that *provides* an algorithm from an application that *uses* it. The [PKI Consortium vendor survey](https://pkic.org/wg/pqc/pqcmm/adoption/survey/) asks for a scoped report and criterion-level evidence, not an inferred maturity level from isolated answers.

## Why the catalog grew

The earlier 27 tests already covered TLS, SSH, IPsec, storage, backup, signing, PKI, hardware, inventory reconciliation, and KEM failure behavior. Six conditional cases now cover QUIC, staged mixed-version deployment, internal mutual TLS, constrained operational technology, validation claim lookup, and message-size compatibility. Their sources are [RFC 9001](https://datatracker.ietf.org/doc/html/rfc9001), [NIST NCCoE migration work](https://www.nccoe.nist.gov/applied-cryptography/migration-to-pqc), [NIST crypto agility guidance](https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final), [CISA's OT considerations](https://www.cisa.gov/sites/default/files/2024-10/Post-Quantum%20Considerations%20for%20Operational%20Technology%20%28508%29.pdf), [NIST CMVP](https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules), and the [PKI Consortium Level 2 criteria](https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/).

Four buyer checks were added for test governance, scoped assurance, path variants, and OT update safety. Their source IDs and suggested test IDs are visible in Control Proof and the Excel companion. The earlier 22 checks already synthesized [NSA CNSA 2.0](https://www.nsa.gov/Cybersecurity/Post-Quantum-Cybersecurity-Resources/), [CISA discovery guidance](https://www.cisa.gov/sites/default/files/2024-09/Strategy-for-Migrating-to-Automated-PQC-Discovery-and-Inventory-Tools.pdf), [NIST standards and migration work](https://www.nccoe.nist.gov/applied-cryptography/migration-to-pqc), [CISA/FBI product-security guidance](https://www.fbi.gov/file-repository/cyber/csa/product-security-bad-practices-011425.pdf), [GSA's buyer guide](https://buy.gsa.gov/api/system/files/documents/final-508c-pqc_buyer-s_guide_2025.pdf), IETF specifications, CycloneDX guides, and PKI Consortium criteria. The FBI source supports product-security and update practices; it is not presented as a PQC test standard.

The count is not a completeness metric. A buyer may need more tests for an email system, a custom protocol, an HSM integration, a mobile client, an air-gapped update process, or a specific national-security policy. Add those as sourced product-specific tests. Record the buyer rule that makes each one required. The [NIST NCCoE PQC project](https://www.nccoe.nist.gov/applied-cryptography/migration-to-pqc) separates cryptographic discovery from interoperability work, and its [FAQ](https://pages.nist.gov/nccoe-migration-post-quantum-cryptography/) says its inventory and test examples are not exhaustive.

## Questions the test lead must answer

Each test now asks: Is this a procurement condition? Who runs it? Which other teams must provide access or review? Who owns the buying decision? What build, setting, method, and pass rule apply? Is the test blocked? What prerequisite must be met first? What happens if a buyer-required result is missing by the decision date? A blocked test can be rescheduled, supported by alternate proof, or routed through a named risk/waiver decision. The workbook records that disposition; it does not approve it automatically.

## Import and proof boundary

Crypto Map, BOM register, and Evidence accept a JSON array or an .xlsx sheet after preview. BOM register also accepts a CycloneDX JSON document and extracts limited metadata. A CBOM can create *listed* cryptographic-asset candidates in Crypto Map. It cannot show that those algorithms ran on a buyer path. Imported evidence starts unreviewed, duplicate IDs are reassigned, and imported validation or signature claims are reset. The browser rejects apparent secret key material. Older binary .xls files require conversion to .xlsx.

Attaching a file keeps it in browser storage. Export with attachments places its full bytes in an unencrypted JSON download. The app does not upload that download; later email, sync, or upload can send it over a network. Use a protected channel suited to the artifact's sensitivity.

The next technical gate is full local CycloneDX schema and relationship validation and signature verification against an expected signer. A test packet importer now exists for the replay harness's TLS probes; its packets arrive as unreviewed buyer evidence. The current section import is an intake aid. Treat its output as a work item until a reviewer checks the original source.
