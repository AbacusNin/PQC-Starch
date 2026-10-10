# PQC Buyer Workbook: browser app

This is the browser version of the PQC buyer verification workbook. It walks a buyer through one product and deployment setup, from vendor questions to a decision record. It runs as a static site. Answers and attachments stay in the browser unless a person exports them or follows an external source link.

## Open it locally

From this folder, start a local web server:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/` in a browser. Python serves the static files; the assessment is saved by the browser. The app makes no API calls, has no account, and sends no telemetry. Browser storage is tied to the page's origin, so export a JSON copy before changing the URL, browser profile, or device.

Use `localhost`, `127.0.0.1`, or an HTTPS address. Browsers treat those as secure, and passphrase encryption, replay-packet digest checks, and BOM signature checks need a secure page. On a plain-HTTP address the rest of the app still works, and those features say they are unavailable.

## Who does what

A buyer or procurement lead can complete the scope, survey, licensing, and decision. A technical reviewer should check the crypto map, the evidence, BOM check results, and every test result before the buyer relies on them.

## Work through an assessment

1. Name the product, version, configuration, buyer, and policy setting on Buyer record.
2. Answer the 38 vendor questions. Choosing an answer creates one linked, unreviewed supplier statement in Evidence. Clearing the answer removes that statement if nobody has worked on it. Add the actual proof separately and check it.
3. Map each cryptographic use and traffic or signing path. Enter source and destination to draw the manual path diagram. Record each supplied SBOM or CBOM and connect use records to its component or asset references. Importing a CycloneDX BOM checks it (see below). **Export CBOM draft** turns the manual map into a CycloneDX 1.7 CBOM marked inside as an unsigned draft built by hand.
4. Add evidence manually or import proof rows from JSON, CSV, or .xlsx. Record who produced each item: the supplier, the buyer, an independent third party, or a validation authority. Review whether each item matches the offered product version and setup. Imported proof starts unreviewed.
5. Plan and record tests, including procurement requirement, lead team, supporting teams, blocker, prerequisites, pass rule, test setting, negative control, and untested areas. This app does not run tests: a reviewer records each result. Results from the [replay harness](../tools/replay/README.md), which probes TLS, SSH, and IKEv2 from a machine you control, can be imported as a packet. The 33 sourced tests are conditional starting cases. Add product-specific tests for paths or deployment modes they miss.
6. Review the 26 buyer control expectations. Each card links primary sources, relevant vendor questions, proof, and suggested tests, and says whether each proof item was linked to the check directly or through one of its questions.
7. Optionally, on Maturity criteria, load the PKI Consortium PQC Maturity Model 1.0.1 or import your own criteria, and record whether proof meets each one.
8. Assign gaps. An accepted risk needs a named approver, a scope, and an expiry date. Then write the buyer conclusion. Choosing Proceed while buyer-required tests are unresolved, actions are open, or claims carry counter-evidence shows a warning; the buyer can still proceed.
9. Check license and support terms, add a separate record for each applicable license, then review the evidence scorecard and suggested claim drafts.

The app does not calculate a PQCMM level or decide that a product is compliant.

Hover, keyboard-focus, or tap underlined terms to open a visible in-page definition. Press Escape or move away to close it. Every form control has a label that screen readers announce.

## How the scorecard counts

The scorecard reports record quality, not a product grade. Bars appear only for completeness: scope fields, mapped uses, and answered questions. Proof and support appear as counts with their source, because a bar would read like a grade.

- A supported yes answer needs buyer acceptance and linked qualifying proof. The count is shown against the number of yes answers.
- Qualifying proof is accepted, matches the exact product and path, names its artifact, issuer, and date, and has a file or source location. The scorecard groups qualifying proof by who produced it, so supplier statements cannot hide behind one total.
- An observed test counts as supported only when it has its tested crypto use, build, tool version, observation, negative control, limits, reviewer, and linked qualifying proof produced by the buyer or an independent party. A supplier's own log restates the claim; it does not check it.
- Controls and tests marked not applicable leave the totals.
- Rejected or wrong-scope proof is counted separately as counter-evidence. Accepted proof that does not qualify is counted as needing rework.
- Accepted risks without an approver or expiry are flagged.

## BOM checks

Importing a CycloneDX JSON BOM into the BOM register checks it in the browser, with nothing sent anywhere:

- **Schema:** the file is validated against the official CycloneDX 1.7.2 JSON Schema, including the SPDX license list, JSF signature, and cryptography definitions it references. The four schema files are bundled in `schema/` byte for byte as published. The validator interprets the schema directly, because the page's Content-Security-Policy forbids generated code. Its verdicts are tested against Python's `jsonschema` on 600 valid and altered BOMs.
- **Signature:** a single JSF signature on the BOM (ES256/384/512, RS256/384/512, PS256/384/512, or Ed25519) is verified with the public key embedded in the file. A valid signature shows the file is unchanged since signing. It does not show who signed it, so the record shows the key's RFC 7638 thumbprint to compare with the supplier's published key. Multiple signers, signature chains, certificate paths, and signatures inside components are reported as not checked.
- **Dependency graph:** which component depends on or provides which is kept on the BOM record, and each crypto use with a matching CBOM reference names the components that bring in its asset.

The checks show a file is well formed and, if signed, unchanged. They do not show the BOM is complete or that the product uses what it lists.

## Local data, export, and import

- Text answers autosave in browser local storage. If the saved data cannot be read, for example after a newer version wrote it, the app keeps the original unchanged and offers it for download from Buyer record instead of overwriting it.
- When the same assessment is open in two tabs, a save in one tab appears in the other.
- Evidence files are stored in IndexedDB, with a 10 MB limit per file and 30 MB per assessment. PDF, text, CSV, JSON, PNG, JPEG, WebP, Word, and Excel files are accepted, and the file's leading bytes must match its type. Files are not uploaded.
- **Export with attachments** writes one JSON file containing the assessment and base64-encoded attachment bytes. **Export answers only** omits file data. Both are full backups. If an attachment is missing from browser storage, the export still completes and names the missing file. The header shows when changes have not been backed up.
- **Export share copy** is for people outside the review team. By default it removes proof locations, notes, reviewer and owner names, and attached files, replacing each value with "Removed from share copy" so a recipient can tell removed from never recorded. Review outcomes stay. The sender can keep any category. A share copy does not count as a backup, and importing one says what the sender removed.
- Any export can be encrypted with a passphrase of at least 12 characters, using AES-256-GCM with a key derived by PBKDF2-SHA-256 at 600,000 iterations. Without the passphrase nobody can open the file, including you.
- **Import** checks the format, file sizes, file contents, and secret key material, then shows what the file contains and any fields it cannot import. It offers to export the current assessment before replacing it. **Clear this assessment** makes the same offer.
- **Section imports** add up to 100 Crypto Map, BOM register, or Evidence rows from a JSON array, CSV, or .xlsx sheet after preview. The Excel sheet must be named for the section, or be the only sheet. Excel date cells import as calendar dates. The app rejects apparent secret key material, reassigns duplicate IDs, and does not carry over imported acceptance, validation, or signature claims. Section imports do not copy attachments.
- **Maturity criteria** load the bundled PQCMM 1.0.1 release with one click, or import a PQCMM model file (JSON) or your own list (JSON, CSV, or Excel with columns ID, Level, Level name, Criterion, Tags, and Source). Each criterion keeps the level, tags, and source the file gives it; a criterion without a level is listed under "No level stated". Proof links to a criterion by its ID, for example PQCMM-2.1.3. Results are counted per stated level. No overall level is computed.
- **Import replay packet** on Tests accepts a packet from the replay harness's `probe` mode for TLS, SSH, or IKEv2. The packet becomes one unreviewed evidence record produced by the buyer, and the mapped tests are filled without overwriting any result already recorded. Self-test packets and packets whose digest does not match are refused.
- **Compare with an earlier export** on Scorecard lists what changed since that export: scope fields, crypto uses, evidence, BOMs, actions, licenses, survey answers, test results, and control results.
- **Export for a GRC tool** on Scorecard builds a ZIP for Archer, ServiceNow GRC, Vanta, Drata, or Scrut. Each package uses the file formats, column headings, values, and date formats that platform documents for bulk import, includes a README naming what to load where and which headings could not be verified, and carries the full review as JSON. See [GRC_EXPORTS.md](../GRC_EXPORTS.md).
- **Print record** uses the browser's print or Save as PDF feature. It includes the buyer decision, survey answers, the evidence register with producers, tests with their negative controls and limits, open actions, accepted risks, the scorecard, license terms, and draft claims. Attachments are not printed.
- **Export claim drafts** writes a CycloneDX 1.7 declaration document marked inside as an unsigned draft. It leaves out drafts that lack the scope detail a claim needs and can leave out proof locations. Review deployment paths and issuers before sharing. `python test/schema-check.py <export.json>` checks a file against the bundled official schema, offline, after installing `jsonschema`.

Record IDs are upper case and never reissued, even after a record is deleted. Deleting a record lists the records that linked to it and removes those links; Evidence flags any remaining link that points at nothing.

The app is designed for one active assessment per browser profile. Export separate JSON files for separate products. Clearing site data removes the local copy.

## Current scope

This release implements the guided survey, manual crypto map and topology, SBOM/CBOM review register with in-browser schema, signature, and dependency checks, CBOM draft export, evidence and attachment register with producers, 33 sourced baseline tests plus product-specific tests, replay-packet import for TLS, SSH, and IKEv2, 26 buyer control checks, maturity criteria review, action tracker with risk acceptance, process flow, repeatable license records, evidence scorecard, claim drafts, change review, GRC export packages, glossary, local save, encrypted, plain, or share-copy JSON transfer, and print record. Assessment schema version 5 reads earlier version 1 to 4 exports and local records. Do not copy a public PQCA component readiness label into a buyer conclusion without checking the exact offered product.

The [workbook design](../WORKBOOK_DESIGN.md) explains the claim and evidence rules. The [workflow and coverage review](../WORKFLOW_AND_COVERAGE_REVIEW.md) explains why controls, tests, answers, and proof have many-to-many links. The [CycloneDX research and test plan](../CYCLONEDX_RESEARCH_AND_TEST_PLAN.md) maps CBOM/SBOM requirements and the replay work. The [research record](../RESEARCH_AND_SPEC.md) lists policy and standards sources. `content.js` holds the questions, controls, tests, terms, and source IDs; the Excel builder reads the same file.

## Verify locally

The tests need Node.js 24 or later, Playwright's Chromium, and Python with `jsonschema`. From the project root:

```powershell
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix web
npx --prefix web playwright install chromium
python -m pip install jsonschema
npm test
```

The test suite starts its own local server. It covers the scoring and export logic, linked records, reload, export and import with attachments, encrypted export, share copies, section JSON, CSV, and Excel imports, invalid and hostile imports, migration from older schema versions, accessible names, contrast, mobile navigation, field help, topology, BOM schema, signature, and graph checks, CBOM export, maturity criteria, GRC packages, license records, scorecard rules, claim drafts against the official schema, replay packets, change review, print content, framing protection, untrusted text rendering, and the replay harness for all three protocols.

## Deploy

The app is a static site. The repository's `pages` workflow publishes it to GitHub Pages after the test workflow passes on `main`; it copies only the files the page loads, plus LICENSE and NOTICE. Turn it on once under Settings, Pages, Build and deployment, Source: GitHub Actions.

The page's meta Content-Security-Policy blocks scripts from other origins and all network connections. A meta tag cannot stop other sites from framing the page, and GitHub Pages cannot send custom headers, so the page checks for itself: inside a frame it shows only a link to open it in its own tab, and the stylesheet keeps the page hidden until that check runs. On a host that can send headers, also send the ones in [`_headers`](_headers); hosts that read a `_headers` file apply it directly.

## Source and license boundary

The workbook is licensed under Apache 2.0 with the Commons Clause: anyone may use, change, and share it free, including inside a company or agency, and nobody may sell it or sell a service built mainly on it. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).

The workflow is informed by the [PKI Consortium PQC Maturity Model](https://pkic.org/wg/pqc/pqcmm/), [PQCA readiness tracking](https://github.com/PQCA/wg-readiness-tracking), and [CycloneDX](https://cyclonedx.org/). Third-party files keep their own licenses: the CycloneDX 1.7.2 schemas in `schema/` (Apache 2.0, license in that folder), JSZip 3.10.1 in `vendor/` (used under its MIT option), and the PQCMM 1.0.1 data in `data/` (MIT, PKI Consortium, license in that folder). The linked CycloneDX guides identify CC BY 4.0 terms.
