# Roadmap

Planned work, roughly in order. Nothing here is built yet.

## 1. Buyer and reviewer pilot

Before adding features, watch real users work through a real review.

- **Who:** two or three procurement teams, each pairing a buyer with a technical reviewer. Arizona Clinic in a Box client engagements are a natural fit.
- **What:** each team takes one realistic vendor response from survey to decision, then loads the GRC package into the tool they use.
- **Watch for:** where people stall or misread a field; whether the rules on who produced the evidence and what qualifies as proof make sense without explanation; how long a review takes; which GRC headings or values a live tenant rejects.
- **Done when:** each team finishes one review, the findings are written up, and the top fixes are in the backlog with an owner.

## 2. Check GRC packages in live tenants

The Archer, ServiceNow GRC, Vanta, Drata, and Scrut packages follow public documentation and are checked by automated tests, but none has been loaded into a live tenant. Load each into a test tenant, record which headings and values load cleanly, and correct the mappings and [GRC_EXPORTS.md](GRC_EXPORTS.md). Add API load scripts that a buyer runs locally where the platform's bulk import cannot carry a record type.

## 3. Several assessments in one browser

A local library of assessments, so a reviewer can switch between products without exporting and importing. It keeps the current design: no account, no server, no network.

## 4. Shared hosted service

A hosted version where a buyer and reviewer work on the same assessment. This is a different product: it needs sign-in, access control, server storage of supplier evidence, data-handling terms, and an owner to run it. Decide the operator first, for example Arizona Clinic in a Box, then the design.

## 5. Replay harness

- **SSH:** complete the mlkem768nistp256-sha256 and mlkem1024nistp384-sha384 key exchanges. Today the harness only reports whether the server lists them.
- **IKEv2:** support IKE fragmentation (RFC 7383) for large ML-KEM messages on small-MTU paths, and responders that require AES-CBC with HMAC.
- **TLS:** report post-quantum certificate signatures (ML-DSA) when servers start presenting them.
- **Distribution:** offer the harness as a single downloadable file with a published checksum.

## 6. BOM checks

Verify multiple signers, signature chains, and X.509 certificate paths on CycloneDX signatures. Bundle the CycloneDX 1.6 schema so older BOMs are checked against their own version.

## 7. Content upkeep

- Load PQCMM 1.1.0 when the PKI Consortium releases it; its review is tracked in [pkic/pqcmm issue 26](https://github.com/pkic/pqcmm/issues/26).
- Update the certification wording after the PQCMM certification announcement planned for the PQC Conference in Amsterdam, December 1 to 3, 2026.
- Recheck every source date in the research record before each release.

## 8. Excel workbook parity

Bring the Excel companion up to the browser app: a maturity criteria sheet, BOM check columns, and share-copy guidance.

## 9. Handoff to Arizona Clinic in a Box

If the capability moves to Clinic in a Box, agree the terms the clinic receives from the copyright holder, the hosting address, branding, and who maintains the sources and tests.
