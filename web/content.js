// Shared assessment content extracted from the workbook builder.
// Regenerate after changing workbook questions or source mappings.

export const survey=[
  ['Scope','Which exact product, edition, version, and setup are you offering?','Release page, SKU/CPE/purl, configuration guide'],
  ['Scope','Is the PQC feature live for customers, optional, in preview, or planned?','Release note and support statement'],
  ['Scope','Does your proof cover the setup we will actually buy or run?','Product-to-evidence mapping'],
  ['PQCMM','What PQCMM level do you claim for this product?','Versioned product assessment report'],
  ['PQCMM','Who assessed that level, and when?','Assessor, date, method, report ID, PQCMM version'],
  ['PQCMM','Can you map every claimed criterion to proof, including lower levels?','Criteria-by-criteria evidence matrix'],
  ['PQCMM','Which next-level gaps remain, and who owns them?','Gap list with dates and owners'],
  ['Inventory','Where does this product use encryption or digital signatures?','Crypto inventory or CBOM and coverage statement'],
  ['Inventory','Which cryptographic parts come from another supplier?','Component list, versions, upstream owner'],
  ['Inventory','What could your discovery method have missed?','Tool coverage and manual reconciliation'],
  ['Algorithms','Which final NIST algorithms and parameter choices are in this release?','Algorithm identifiers and technical documentation'],
  ['Algorithms','Does any feature use an earlier draft or experimental name?','Wire IDs, OIDs, and migration note'],
  ['Key exchange','Which customer-to-service paths use hybrid or PQC key exchange today?','Path diagram and connection trace'],
  ['Key exchange','Which TLS group is selected by default on a fresh connection?','Redacted trace with client/server versions'],
  ['Key exchange','What happens when the other side cannot use the new method?','Fallback policy and negative-control test'],
  ['Key exchange','Can the buyer require the new method on a chosen path?','Configuration and enforcement test'],
  ['Authentication','How are the server and client identities verified?','Certificate chain and validation trace'],
  ['Authentication','Are PQC signatures used for identity, or only for key exchange?','Separate function-by-function algorithm list'],
  ['Updates','How are software, firmware, boot, and recovery updates signed?','Signing flow, sample artifact, verification result'],
  ['Updates','Can signing keys and trusted algorithms be changed without new hardware?','Migration procedure or test report'],
  ['Assurance','Which algorithm test certificates apply to this exact implementation?','CAVP certificate IDs and version mapping'],
  ['Assurance','Which validated cryptographic module applies to this exact setup?','CMVP certificate, Security Policy, approved-mode mapping'],
  ['Assurance','What independent interoperability tests cover this release?','Report, partner versions, method, limitations'],
  ['Operations','What changes in speed, size, reliability, or compatibility were measured?','Benchmark conditions and failure data'],
  ['Operations','How will you replace a broken algorithm across the product?','Crypto agility plan and tested update path'],
  ['Operations','When does support end, and how are crypto flaws reported?','Support policy, disclosure channel, update terms'],
  ['Procurement','What must the buyer buy or enable to get the claimed feature?','License tier, hardware needs, costs, entitlements'],
  ['Procurement','What milestones and dependencies remain before our target date?','Versioned roadmap and accountable owner'],
  ['Policy','If you claim federal or NSS readiness, which rule and version apply?','Policy crosswalk for this product and use'],
  ['Policy','For an NSS or CSfC claim, which exact parameters and package apply?','CNSA 2.0 mapping and package/evaluation evidence'],
  ['Reassessment','Which changes will trigger a fresh assessment?','Version, library, algorithm, setup, incident triggers'],
  ['Evidence handling','How can we review sensitive proof without publishing it?','Access method, redaction, retention agreement'],
  ['Supply chain','Do you assess downstream suppliers for their PQC readiness?','Supplier assessment method and coverage'],
  ['Sign-off','Who at the vendor stands behind these answers?','Named owner, date, written attestation'],
  ['BOM scope','Will you supply an SBOM and CBOM for the exact release, with document identity and declared completeness?','CycloneDX file, serial/version, release mapping, composition and redaction statement'],
  ['BOM scope','How were those inventories produced and checked?','Generation tool/version, lifecycle, schema check, source and signature verification'],
  ['BOM use','Which listed PQC parts are enabled and actually used on each buyer path?','Component and crypto-asset refs, configuration, and observed trace'],
  ['Licensing','Which component and content licenses limit use, testing, updates, or sharing the BOM?','Per-component license list, contract terms, distribution rules']
];

export const controls=[
 ['C01','The offered product and tested setup are identified exactly.','PKI-1','Q01-Q03'],
 ['C02','The vendor gives a product-specific assessment and criterion proof.','PKI-1','Q04-Q07'],
 ['C03','All important cryptographic uses are mapped, with blind spots named.','CISA-2; NIST-4','Q08-Q10'],
 ['C04','Algorithms and parameter choices match final applicable standards.','NIST-1; NIST-2; NIST-3','Q11-Q12'],
 ['C05','Key exchange is shown on the exact path and selected group.','RFC-1; RFC-2','Q13-Q16'],
 ['C06','Authentication and signatures are assessed separately.','RFC-2; RFC-4; NIST-2','Q17-Q18'],
 ['C07','Fallback and failed negotiation have a recorded result.','RFC-2','Q15-Q16'],
 ['C08','Software, firmware, boot, and recovery signing are covered.','CISA-1; FBI-1','Q19-Q20'],
 ['C09','Dependencies and CBOM evidence are linked to the product.','CBOM-1; CISA-2','Q08-Q09'],
 ['C10','Algorithm certificates are mapped to exact implementation versions.','NIST-8; NIST-5','Q21'],
 ['C11','Module validation is mapped to the offered configuration and mode.','NIST-5','Q22'],
 ['C12','Interoperability and realistic performance are documented.','PKI-1; GSA-1','Q23-Q24'],
 ['C13','The vendor can change cryptographic methods and trust anchors.','NIST-4','Q20; Q25'],
 ['C14','Support, security updates, and disclosure have owners and dates.','FBI-1; GSA-1','Q26'],
 ['C15','Licenses, hardware, cost, and roadmap dependencies are explicit.','GSA-1','Q27-Q28'],
 ['C16',"The buyer's actual policy context is recorded and checked.",'NSA-1; OMB-1','Q29-Q30'],
 ['C17','The buyer has a safe way to inspect and retain sensitive proof.','PKI-1','Q32'],
 ['C18','Reassessment triggers and downstream supplier coverage are named.','PKI-1','Q31; Q33'],
 ['C19','SBOM and CBOM identity, release scope, generation method, and completeness are reviewed.','CDX-SBOM-1; CDX-CBOM-1','Q35-Q36'],
 ['C20','Listed or provided PQC assets are separated from configured and observed use.','CDX-SBOM-1; CDX-CBOM-1','Q08; Q37'],
 ['C21','Key and certificate lifecycle is reviewable without exposing secret values.','CDX-CBOM-1; NIST-4','Q20; Q32'],
 ['C22','Component and content licenses have source records and sharing limits.','CDX-SBOM-1','Q27; Q38'],
 ['C23','Buyer-required tests have owners, pass rules, prerequisites, and blocked-test decisions.','GSA-1; PKI-3; NIST-7','Q23-Q24; Q28'],
 ['C24','The assurance method and report are authentic, current, and scoped to this release.','PKI-1; PKI-2','Q04-Q06; Q23'],
 ['C25','Cryptographic behavior is checked on relevant network and deployment variants.','NIST-7; CISA-2','Q08; Q13; Q23'],
 ['C26','OT device update and recovery limits are reviewed when the product uses constrained equipment.','CISA-3; CISA-1','Q19-Q20; Q24']
];

export const tests=[
 ['T01','Fresh hybrid TLS connection','Capture offered and selected group on a full handshake','Client-to-edge','RFC-1; RFC-2'],
 ['T02','Classical-only peer','Record allowed fallback or enforced rejection against written policy','Same path as T01','RFC-2; NIST-4'],
 ['T03','Unsupported hybrid group','Record rejection or selected alternative and any downgrade','Same path as T01','RFC-2; RFC-3'],
 ['T04','Server identity check','Verify trust chain, certificate algorithm, and failure on an untrusted identity','Same path as T01','RFC-3; NIST-2'],
 ['T05','Edge-to-origin leg','Capture selected group and authentication on each internal leg','Origin path','CISA-2; VENDOR-1'],
 ['T06','Client-authentication path','Verify client certificate and rejection of an unauthorized identity','Client-auth path','RFC-3; NIST-2'],
 ['T07','Software or firmware update','Verify a valid signature and rejection of a changed or untrusted artifact','Update path','FBI-1; NIST-2'],
 ['T08','Second implementation','Record independent peer, versions, parameters, and result','Representative path','RFC-2; PKI-2'],
 ['T09','Representative load','Record handshake size, latency, failure rate, and test conditions','Representative path','GSA-1; PKI-2'],
 ['T10','Algorithm change','Exercise configuration change, update, and safe rollback','Representative path','NIST-4; GSA-1'],
 ['T11','Resumed connection','Compare full and resumed handshakes; state which cryptography was actually rerun','Client-to-edge','RFC-3'],
 ['T12','Certificate failure paths','Reject expired, revoked, wrong-name, or untrusted certificates as applicable','Identity path','RFC-3; NIST-2'],
 ['T13','CBOM and SBOM reconciliation','Match observed crypto uses to component and crypto-asset references; record missing links','Product build','CDX-CBOM-1; CDX-SBOM-1; CISA-2'],
 ['T14','Cryptographic material lifecycle','Verify key or certificate rotation, expiry, revocation, and recovery without exposing secrets','Representative asset','CDX-CBOM-1; NIST-4'],
 ['T15','Negotiation enforcement','Set the required group or signature policy and show older methods are rejected','Chosen deployment path','RFC-2; NSA-1'],
 ['T16','Discovery blind-spot check','Compare automated findings to configuration, live traces, and supplier inventory','Representative system','CISA-2; CDX-CBOM-1'],
 ['T17','Supplier claim replay','Repeat a vendor claim on the offered build, edition, entitlement, and settings','Buyer setup','PKI-2; GSA-1'],
 ['T18','Provider-only negative control','Show that a library listed as providing PQC does not count as observed use','Representative component','CDX-CBOM-1; CDX-SBOM-1'],
 ['T19','SSH negotiation and identity','Capture SSH key exchange and host/user authentication separately','SSH path','IETF-SSH-1; CDX-CBOM-1; NSA-1'],
 ['T20','IPsec or IKEv2 negotiation','Capture negotiated key establishment and authentication on each tunnel','VPN path','RFC-6; CDX-CBOM-1; NSA-1'],
 ['T21','Stored-data migration','Rewrap or re-encrypt a sample and verify old and new access rules','Storage path','NIST-4; CISA-1'],
 ['T22','Backup and archive recovery','Restore protected data with current keys and record long-lived exposure','Backup path','NIST-4; CISA-1'],
 ['T23','Certificate issuance and revocation','Issue, validate, rotate, and revoke a representative certificate','PKI path','RFC-4; NIST-2'],
 ['T24','Boot and recovery signature','Accept a trusted image and reject changed or untrusted boot/recovery images','Device path','FBI-1; NIST-2'],
 ['T25','Hardware crypto boundary','Check the HSM or TPM path, version, mode, and failure behavior','Hardware path','CDX-CBOM-1; NIST-5'],
 ['T26','Release change and BOM drift','Compare two releases for crypto assets, component versions, paths, and coverage changes','Release pair','CDX-SBOM-1; NIST-4'],
 ['T27','KEM failure handling','Check malformed or failed encapsulation handling and verify no secret is exposed','Key establishment path','NIST-6; NIST-1'],
 ['T28','QUIC transport path','Record the negotiated TLS key establishment and identity method over QUIC, including failed or blocked paths','QUIC path','RFC-5; RFC-2; NIST-7'],
 ['T29','Mixed-version rollout','Exercise new and old peers during staged deployment; record fallback, rejection, rollback, and service recovery','Cluster or fleet','NIST-4; GSA-1'],
 ['T30','Service-to-service mutual authentication','Check key exchange and both endpoint identities on a representative internal service path','Internal mTLS path','RFC-3; NIST-7'],
 ['T31','Constrained OT update','Test the update and recovery route on representative constrained equipment under its operational safety rules','OT device path','CISA-3; CISA-1'],
 ['T32','Validation claim lookup','Match any CAVP or CMVP claim to the exact algorithm, module version, operating environment, and approved mode','Claimed implementation','NIST-8; NIST-5; PKI-3'],
 ['T33','Message-size compatibility','Measure handshake and certificate size across the real path, including proxies, packet limits, and failure behavior','Representative network path','NIST-7; GSA-1']
];

export const terms=[
 ['PQC','Cryptography designed to resist attacks from a future large quantum computer.'],
 ['Hybrid','A design that combines a classical method with a post-quantum method.'],
 ['Key establishment','How two parties agree on a secret for a secure connection.'],
 ['Authentication','How a party proves its identity. Key exchange alone does not prove identity.'],
 ['Digital signature','A check that a message or update came from the expected signer and was not changed.'],
 ['CBOM','Cryptographic bill of materials: a structured inventory of crypto assets and relationships.'],
 ['SBOM','Software bill of materials: a list of software components in a product.'],
 ['PQCMM',"PKI Consortium model for assessing a product's PQC maturity against criteria and proof."],
 ['CAVP','NIST program that tests cryptographic algorithm implementations.'],
 ['CMVP','NIST/CCCS program that validates cryptographic modules under FIPS 140-3.'],
 ['FIPS 203 / 204 / 205','Final NIST standards for ML-KEM, ML-DSA, and SLH-DSA.'],
 ['FIPS 203','NIST standard for ML-KEM key establishment.'],
 ['FIPS 204','NIST standard for ML-DSA digital signatures.'],
 ['FIPS 205','NIST standard for SLH-DSA digital signatures.'],
 ['ML-KEM','NIST standardized post-quantum key encapsulation method.'],
 ['ML-DSA','NIST standardized post-quantum digital signature method.'],
 ['SLH-DSA','NIST standardized stateless hash-based signature method.'],
 ['CNSA 2.0','NSA algorithm suite and transition guidance for National Security Systems.'],
 ['NSS','National Security System, a legal/policy category requiring separate applicability review.'],
 ['TLS group','The named key exchange method selected during a TLS connection.'],
 ['Negative control','A deliberate test of an older or unsupported condition to show fallback or rejection.'],
 ['Crypto agility','The ability to change algorithms, keys, and trust anchors without a disruptive rebuild.'],
 ['Data protection life','How long information must remain confidential or trustworthy.']
 ,['BOM-Link','A CycloneDX reference that connects an item in one bill of materials to an item in another.']
 ,['bom-ref','A unique label for an item inside a CycloneDX bill of materials.']
 ,['Certificate','A signed record that binds an identity to a public key.']
 ,['Cipher suite','The set of symmetric encryption and hash choices named in a protocol negotiation. It does not by itself identify key exchange or authentication.']
 ,['Composition','A CycloneDX statement about how complete an inventory is for a product or set of parts.']
 ,['CPE','A standardized product identifier often used for vulnerability matching.']
 ,['Dependency','A component or service another component needs to work.']
 ,['Evidence','A document, configuration, trace, or observation used to check a claim.']
 ,['FIPS 140-3','A U.S. standard for cryptographic module security requirements. A product does not inherit validation merely by using a listed algorithm.']
 ,['Hash','A compact value used to detect change against a trusted reference. A hash alone does not prove who supplied a file.']
 ,['HSM','Hardware security module: a device used to protect and use cryptographic keys.']
 ,['Interoperability','Whether independent implementations can work together under specified conditions.']
 ,['Key lifecycle','The creation, storage, use, rotation, expiration, and disposal of a key.']
 ,['KEM','Key encapsulation mechanism: a method for establishing a shared secret.']
 ,['PURL','Package URL: a standard way to identify a software package and version.']
 ,['Provenance','Information about where an artifact came from, who produced it, and how.']
 ,['Provides','A CycloneDX relationship saying a component implements a capability. It does not prove the product uses that capability.']
 ,['SBOM lifecycle','The stage when a software inventory was made, such as design, build, or operations.']
 ,['Signature','Cryptographic proof of a signed message or artifact when the signer and trust chain are checked.']
 ,['SPDX','An open standard for describing software components and licenses.']
 ,['Trust boundary','A point where ownership, policy, or control changes between systems.']
 ,['VEX','A machine-readable statement about whether a vulnerability affects a particular product.']
 ,['Attestation','A formal statement tied to a target, requirements, evidence, assessor, and possibly a signature.']
 ,['Counter-evidence','An artifact or observation that challenges a claim.']
 ,['Coverage','The portion of a product, path, or inventory actually examined. Unexamined areas remain unknown.']
 ,['Cryptographic asset','A tracked algorithm, protocol, certificate, or related key material.']
 ,['Declared license','A license reported by the component supplier or its metadata.']
 ,['Observed license','A license identified by inspecting the distributed package or files.']
 ,['Concluded license','A license selected after a human review resolves conflicting or incomplete license evidence.']
 ,['Component','A software, hardware, or service part of the product being assessed.']
 ,['Algorithm','A specified cryptographic method, such as ML-KEM or ML-DSA.']
 ,['Algorithm test certificate','A certificate for a specific implementation and algorithm test; it is separate from module validation.']
 ,['Module validation','An assessment of a cryptographic module and its approved configuration, with a certificate and security policy.']
 ,['Secret key','Key material that must remain private and should never be pasted into this workbook.']
 ,['Endpoint','A device or service at one end of a communication path.']
 ,['Buyer evidence record','The buyer\'s linked account of scope, claims, proof, tests, gaps, and decision.']
 ,['Blocked test','A test that cannot run yet because access, equipment, a supplier release, or another prerequisite is missing.']
 ,['Test dependency','Something that must be ready before a test can produce a meaningful result.']
 ,['Procurement requirement','A buyer-selected condition that must be met or explicitly resolved before a purchase decision.']
 ,['XLSX','The current Excel workbook file format. Older .xls files must be saved as .xlsx before this app imports them.']
];

export const sources=[
 ['PKI-1','PKI Consortium PQCMM vendor survey','https://pkic.org/wg/pqc/pqcmm/adoption/survey/'],
 ['PQCA-1','PQCA readiness tracking template','https://github.com/PQCA/wg-readiness-tracking/blob/main/tracking-template.md'],
 ['CBOM-1','CycloneDX CBOM','https://cyclonedx.org/capabilities/cbom/'],
 ['NIST-1','NIST FIPS 203 (ML-KEM)','https://csrc.nist.gov/pubs/fips/203/final'],
 ['NIST-2','NIST FIPS 204 (ML-DSA)','https://csrc.nist.gov/pubs/fips/204/final'],
 ['NIST-3','NIST FIPS 205 (SLH-DSA)','https://csrc.nist.gov/pubs/fips/205/final'],
 ['NIST-4','NIST crypto agility considerations','https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final'],
 ['NIST-5','NIST CMVP validated modules','https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules'],
 ['NIST-6','NIST SP 800-227 KEM guidance','https://csrc.nist.gov/pubs/sp/800/227/final'],
 ['NIST-7','NIST NCCoE PQC migration and interoperability project','https://www.nccoe.nist.gov/applied-cryptography/migration-to-pqc'],
 ['NIST-8','NIST CAVP algorithm validation program and certificate search','https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program'],
 ['CISA-1','CISA/NSA/NIST quantum readiness fact sheet','https://www.nccoe.nist.gov/sites/default/files/2023-08/quantum-readiness-fact-sheet.pdf'],
 ['CISA-2','CISA automated discovery strategy','https://www.cisa.gov/sites/default/files/2024-09/Strategy-for-Migrating-to-Automated-PQC-Discovery-and-Inventory-Tools.pdf'],
 ['CISA-3','CISA post-quantum considerations for operational technology','https://www.cisa.gov/sites/default/files/2024-10/Post-Quantum%20Considerations%20for%20Operational%20Technology%20%28508%29.pdf'],
 ['FBI-1','CISA/FBI product security bad practices','https://www.fbi.gov/file-repository/cyber/csa/product-security-bad-practices-011425.pdf'],
 ['NSA-1','NSA CNSA 2.0 FAQ','https://media.defense.gov/2022/Sep/07/2003071836/-1/1/1/CSI_CNSA_2.0_FAQ_.PDF'],
 ['OMB-1','OMB M-26-15 migration memo','https://www.whitehouse.gov/wp-content/uploads/2026/06/M-26-15-Execution-of-the-Migration-to-Post-Quantum-Cryptography.pdf'],
 ['GSA-1','GSA PQC buyer guide','https://buy.gsa.gov/api/system/files/documents/final-508c-pqc_buyer-s_guide_2025.pdf'],
 ['RFC-1','RFC 10024 TLS hybrid groups (Proposed Standard)','https://datatracker.ietf.org/doc/html/rfc10024'],
 ['RFC-2','RFC 9954 hybrid TLS key exchange design (Informational)','https://datatracker.ietf.org/doc/html/rfc9954'],
 ['RFC-4','RFC 9881 ML-DSA in X.509','https://datatracker.ietf.org/doc/html/rfc9881'],
 ['RFC-5','RFC 9001 QUIC TLS','https://datatracker.ietf.org/doc/html/rfc9001'],
 ['RFC-6','RFC 9370 multiple key exchanges in IKEv2','https://datatracker.ietf.org/doc/html/rfc9370'],
 ['IETF-SSH-1','ML-KEM hybrid key exchange in SSH (Internet-Draft when reviewed)','https://datatracker.ietf.org/doc/draft-ietf-sshm-mlkem-hybrid-kex/'],
 ['CDX-ATT-1','CycloneDX guide to attestations','https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-Attestations-en.pdf'],
 ['CDX-CBOM-1','CycloneDX authoritative guide to CBOM','https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf'],
 ['CDX-SBOM-1','CycloneDX authoritative guide to SBOM','https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf'],
 ['CDX-SCHEMA-1','CycloneDX 1.7 JSON schema','https://cyclonedx.org/schema/bom-1.7.schema.json'],
 ['RFC-3','RFC 8446 TLS 1.3','https://datatracker.ietf.org/doc/html/rfc8446'],
 ['PKI-2','PKI Consortium PQCMM evaluation','https://pkic.org/wg/pqc/pqcmm/adoption/evaluation/'],
 ['PKI-3','PKI Consortium PQCMM Level 2 testing criteria','https://pkic.org/wg/pqc/pqcmm/levels/2-foundational/'],
 ['VENDOR-1','Cloudflare PQC product documentation','https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-cloudflare-products/'],
];
