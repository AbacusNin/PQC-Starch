# PQC Buyer Workbook

A free tool for procurement and purchasing staff, and the technical reviewers who support them, to check what a vendor says about post-quantum cryptography (PQC) before buying. It turns "we support PQC" into specific questions, links each answer to proof, records what was actually observed, and produces a decision record.

It is given to the community to help organizations prepare for the move to post-quantum cryptography. It does not certify products, assign maturity levels, or replace FIPS validation.

## Use it

Open the workbook at **https://abacusnin.github.io/PQC-Starch/**. Everything stays in your browser: there is no account, no server, and no telemetry. Export a JSON copy to keep or share your work.

The workbook guides one review of one product and deployment:

1. Define the exact product, version, and deployment under review.
2. Ask the supplier 38 questions, and record proof for each answer.
3. Map where cryptography is used, and check supplied SBOMs and CBOMs against the official CycloneDX schema and their signatures.
4. Record test observations. TLS, SSH, and IKEv2 probe results can come from the replay harness.
5. Review 26 buyer control expectations, and optionally the PKI Consortium PQC Maturity Model criteria.
6. Track gaps and accepted risks, then record the decision.
7. Export a full backup, a share copy with sensitive details removed, a CBOM draft, claim drafts, or a package for Archer, ServiceNow GRC, Vanta, Drata, or Scrut.

## Probe your own systems

[tools/replay](tools/replay/README.md) is a command-line harness that checks, from a machine you control, whether a server actually negotiates hybrid post-quantum key exchange:

- **TLS 1.3:** X25519MLKEM768
- **SSH:** mlkem768x25519-sha256
- **IKEv2:** ML-KEM as an additional key exchange

It also checks whether the server refuses clients that offer only classical methods. It needs only Node.js 24. Its results import into the workbook as evidence. [INTEROP.md](tools/replay/INTEROP.md) records its checks against OpenSSH and strongSwan.

## Repository layout

| Path | What it is |
|---|---|
| [web/](web/README.md) | The browser workbook, published to GitHub Pages |
| [tools/replay/](tools/replay/README.md) | The TLS, SSH, and IKEv2 probe harness |
| tools/pqcmm/ | The PKI Consortium PQCMM 1.0.1 release and its converter |
| build_workbook.mjs | Builds the Excel companion workbook |
| examples/ | Builds the fictional HarborLink example assessment |
| [RESEARCH_AND_SPEC.md](RESEARCH_AND_SPEC.md) | Policy and standards research, with sources |
| [WORKBOOK_DESIGN.md](WORKBOOK_DESIGN.md) | Survey, evidence, and decision rules |
| [GRC_EXPORTS.md](GRC_EXPORTS.md) | How each GRC package maps the review |
| [ROADMAP.md](ROADMAP.md) | Planned work, starting with a buyer and reviewer pilot |
| [CHANGELOG.md](CHANGELOG.md) | What changed |

## Run it locally and test it

```bash
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix web
npx --prefix web playwright install chromium
python -m pip install jsonschema
npm test
```

To open the workbook without the tests, serve `web/` with any static web server, for example `python -m http.server 8765 --bind 127.0.0.1` from that folder.

## Publish

The `pages` workflow publishes `web/` to GitHub Pages after the `test` workflow passes on `main`. Enable it once under Settings, Pages, Build and deployment, Source: GitHub Actions. Actions are pinned to commit SHAs.

## License

Apache License 2.0 with the Commons Clause. Anyone, including a company or a government agency, may use, change, and share the workbook free of charge, for example to review the products it buys. Nobody may sell it, host it for a fee, or sell a product or service, including consulting or support, whose value comes entirely or substantially from it. This makes it source-available rather than OSI open source. See [LICENSE](LICENSE) for the terms and [NOTICE](NOTICE) for third-party files, which keep their own licenses.

## Limits

- The workbook records a buyer's review. Its scorecard measures how complete and traceable that review is, not how good the product is.
- A reviewer-recorded test result is not an independent test report.
- The HarborLink example is fictional.
- Sources were checked on the dates the research record gives. Recheck them before relying on a policy date.
