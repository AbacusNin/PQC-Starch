# Changelog

## October 10, 2026: look and wording

- **Theme:** the workbook uses the AudiOS dark theme: cyan and magenta accents, IBM Plex Sans and Mono (bundled under the SIL Open Font License), and square corners, without AudiOS's background grid. Printing stays black on white, and every contrast check still passes.
- **Licensing page:** "Publishing this workbook" now states the Apache 2.0 with Commons Clause license, links to the license, notices, and source on GitHub, and lists the PQCMM data and fonts among the bundled third-party files.
- **Scorecard:** "How counts are earned" is a numbered list of seven rules. Each rule is a dropdown that starts closed and opens with a click or Enter to show its detail, with lettered parts under the rules for qualifying proof, observed tests, and work that earns no credit.
- **Style switch:** a Style control in the header switches between AudiOS (dark, the default) and Regular (the original light navy and teal look). The choice is kept per browser. The path diagram's colors now come from the stylesheet, so they follow the chosen style, and a legend shows which line color means observed, configured, or listed.

## October 10, 2026: community release

### Release and hosting

- **License:** Apache License 2.0 with the Commons Clause, licensor Abacus. Anyone may use, change, and share the workbook free, including inside a company or agency. Nobody may sell it, host it for a fee, or sell a service built mainly on it. NOTICE lists the third-party files that keep their own licenses.
- **GitHub Pages:** a `pages` workflow publishes the site only after the test workflow passes on a push to `main`, with actions pinned to commit SHAs.
- **Framing protection:** GitHub Pages cannot send a frame-ancestors header, so the page now refuses to run inside another site's frame and stays hidden until that check runs.
- **Documentation:** a repository README, a roadmap (pilot, live GRC tenant checks, multiple local assessments, a hosted service), and a GRC export guide.

### Exports

- **Share copy:** by default it removes proof locations, notes, reviewer and owner names, and attached files, marking each removed value, while review outcomes stay. A share copy does not count as a backup, and importing one says what was removed.
- **GRC packages:** export packages for Archer, ServiceNow GRC, Vanta, Drata, and Scrut follow each platform's documented import formats. Each includes a README listing what was and was not verified, and CSV cells are protected against formula injection.
- **CBOM draft:** the manual crypto map exports a CycloneDX 1.7 CBOM marked inside as an unsigned, hand-built draft. Owner names are left out.

### BOM checks

- **Pinned schemas:** the CycloneDX schema is now the official 1.7.2 file, byte for byte, plus the SPDX, JSF, and cryptography schemas it references. Before this, the Python check fetched those three from cyclonedx.org over plain HTTP on every run; both checks now run offline.
- **Validation in the browser:** importing a CycloneDX BOM validates it in the browser. The validator's verdicts match Python's jsonschema on 600 valid and altered BOMs, and the comparison test was confirmed by planting 17 different validator bugs, each of which it caught. Both validators now check the URI format, without which every standard JSF signature failed the schema.
- **Signatures:** a single JSF signature is verified against the embedded key (ES, RS, PS, and Ed25519 families), and the record shows the key thumbprint to compare with the supplier's published key.
- **Dependency graph:** the graph is kept, and each crypto use names the BOM components that provide its asset.

### Maturity criteria

- **New section:** load the PKI Consortium PQC Maturity Model 1.0.1, verified against the release's SHA256SUMS and schema, or import your own criteria from JSON, CSV, or Excel.
- **What is kept:** each criterion keeps the level, tags, and source its file gives. Proof links to criteria by ID. Results are counted per stated level, and no overall level is computed.
- **CSV:** section imports now accept CSV as well.

### Replay harness 1.1

- **SSH:** mlkem768x25519-sha256 is completed and confirmed by the host's signature over the exchange hash (Ed25519, ECDSA P-256, RSA-SHA2). The probe also reports the server's advertised post-quantum methods, classical-only refusal, and the host key fingerprint.
- **IKEv2:** ML-KEM-768 or ML-KEM-1024 is offered as an additional key exchange (RFC 9370), with one IKE_INTERMEDIATE exchange (RFC 9242) and no IKE_AUTH.
- **Pure Node:** both probes are written in Node.js alone and need no OpenSSH or strongSwan.
- **Interoperability:** both were checked against OpenSSH and strongSwan; see `tools/replay/INTEROP.md`.

### Content and accessibility

- **NSA source:** the October 1, 2026 NSA release was confirmed in a browser and its wording matched; it attributes the 2027 and 2030 dates to CNSS Policy 15.
- **Terms table:** terms on Sources are plain text, removing 63 keyboard stops that repeated the definition beside them.
- **Schema version 5:** adds maturity criteria and the BOM dependency graph. Versions 1 to 4 still load.
- **Record IDs:** IDs in a saved or imported assessment are limited to letters, digits, hyphens, and dots, and the Tests page escapes linked proof IDs. Before this, a shared file could add markup to the page; the CSP already blocked scripts.

## October 9, 2026: fixes from the five-perspective review

Every change below has a test that failed against the pre-review code and passes now, except the documentation and content edits.

### Records and data integrity

- Record IDs are canonical upper case, and IDs are issued from a counter so a deleted record's ID is never reused.
- Deleting a record lists the records that link to it and removes those links. Evidence flags any link that points at nothing, and saving proof with an unknown linked ID says so.
- Evidence linked to a BOM, action, or license record now shows on that record.
- Control cards say whether each proof item was linked to the check directly or through one of its questions.
- Clearing a survey answer removes its untouched supplier statement.
- An unreadable saved assessment is kept and offered for download instead of being overwritten by the next edit.
- A save in one tab appears in any other open tab.
- Whole-assessment imports show what the file contains and which fields cannot be imported, and offer to export the current assessment before replacing it. Clearing the assessment makes the same offer.
- Excel date cells import as calendar dates, imported IDs above 999 are kept, phonetic reading text is dropped from Excel strings, and an Excel part is capped by the bytes actually inflated rather than its header.
- Schema version 4 adds the evidence producer, risk-acceptance fields, ID counters, and the last export time. Versions 1 to 3 still load.

### Scorecard and false-assurance controls

- Evidence records who produced it. Qualifying proof is grouped by producer, and an observed test counts only with buyer or independent proof.
- Test results are labeled as reviewer-recorded, and the app says plainly that it does not run tests.
- Supported yes answers are counted against yes answers. Not-applicable controls and tests leave the totals. Rejected or wrong-scope proof is counted as counter-evidence instead of as rework. Failed and inconclusive tests are counted separately.
- Bars remain only for completeness measures.
- Accepted risks record an approver, scope, and expiry, and the scorecard flags any without them.
- Choosing Proceed while buyer-required tests are unresolved, actions are open, or claims carry counter-evidence shows a warning.
- Overview and print counts use the scorecard's definitions, and accepted risks are listed apart from open actions.

### Exports, imports, and secrets

- Exports can be encrypted with a passphrase (AES-256-GCM, PBKDF2-SHA-256, 600,000 iterations).
- A full export completes even when an attachment is missing and names the missing file. The header shows when changes have not been exported.
- Private key material is refused on every dialog save, inline field, section import, whole-assessment import, and replay import. Private JWKs are detected as well as PEM blocks.
- Attachments must match their declared type by content.
- Claim draft export works on plain-HTTP hosts, leaves out drafts that lack scope detail, carries a machine-readable unsigned-draft marker, can leave out proof locations, and no longer doubles punctuation after the configuration text.

### New capabilities

- `tools/replay`: a TLS 1.3 replay harness with loopback fixtures, negative controls, outcome classes that never turn a probe failure into a product failure, and digest-protected packets. The browser imports authorized-target packets as unreviewed buyer evidence and refuses self-test packets and edited packets.
- Change review compares an earlier export with the current assessment.
- The print record carries survey answers, the evidence register, and test negative controls and limits.

### Accessibility and display

- Every form control has an accessible name. Selected list items are announced as current.
- Typing in a control's owner or rationale no longer loses focus after one character.
- Help text and list headings meet WCAG AA contrast, and small labels are at least 11 px.
- Topology treats node names that differ only in case or spacing as one system. Invalid source addresses render as text. A malformed save time no longer shows "Invalid Date".

### Build, tests, and content

- The Excel builder uses the public `exceljs` library instead of a private tool and reads `web/content.js`, which is now the single content source. The regex extractor is gone. Workbook version 5 adds the producer column, a "Qualifies?" column, the crypto map path and status columns, risk-acceptance columns, rows for product-specific tests, and locked formula cells; its open-action count now includes blocked actions.
- The test suite starts its own server, `jszip` is a declared test dependency, lockfiles exist, and a CI workflow runs everything with actions pinned to commit SHAs. A `uuid` override clears the only audit finding.
- Sources: added the NIST CAVP program for algorithm certificates, RFC 9370 for IKEv2, RFC 9881 on the authentication check, and the SSH ML-KEM draft (labeled as a draft). RFC 9954 and RFC 10024 now show their status. The NSA announcement is marked as not reverified.
- The fictional example records blocked and unrun tests as not run, backs its replay test with the buyer's own trace, keeps one supplier-produced comparison as a teaching case, and shows a complete accepted risk.
- Deployment guidance and a `_headers` file add framing protection that a meta CSP cannot provide.
