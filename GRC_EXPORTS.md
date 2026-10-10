# GRC export packages

**Export for a GRC tool** on the Scorecard page builds a ZIP for Archer, ServiceNow GRC, Vanta, Drata, or Scrut. Each package follows the bulk-import formats that platform publicly documented on October 10, 2026, and includes a README naming what to load where. This page summarizes the mapping and records what could and could not be verified.

The file names on this page are files the export creates inside the ZIP. They are not files in this repository.

## What every package holds

- The platform files described below.
- A JSON copy of the complete review (pqc-review.json in the ZIP), for scripts or any field the platform files leave out.
- An evidence folder with the attached proof files, when the exporter chooses to include them, and a manifest giving each file's SHA-256.
- A README with load order, value mappings, unverified headings, and source links.

Every package holds the full review, including names, notes, and proof locations. It is for the buyer's own GRC tool. Use a share copy for anyone outside the organization.

CSV cells that begin with =, +, -, or @ get a leading apostrophe so a spreadsheet cannot run supplier text as a formula. Excel files store every value as text for the same reason.

## Why some records travel as a workbook

None of these platforms has a documented import for a buyer's observations of a supplier's product: test results, control results against a supplier, or supplier survey answers. Their control and test objects track the buyer's own compliance program, and loading supplier results there would count against the buyer in readiness rollups. Packages therefore map:

- the supplier to the platform's vendor or third-party object,
- gaps and failed tests to findings or issues,
- open actions to remediation plans or tasks,
- accepted risks to risk records with treatment Accept, or to exceptions,

and attach a review workbook (Summary, Survey, Controls, Tests, Evidence, Actions, Maturity criteria, Crypto map) to the vendor review.

## Platform mappings

| Platform | Files in the ZIP | Key choices | Not verified |
|---|---|---|---|
| Archer | One CSV per target application, numbered in load order: third-party profile, engagement, control standards, findings, remediation plans, exception requests, question library, questionnaire answers, evidence manifest | UTF-8, every value quoted, pipe removed from text for the values delimiter, MM/DD/YYYY dates, a stable ID column to use as the update key | Engagement, exception, and evidence field names; whether the Data Import wizard runs on SaaS tenants (the 2024.09 page says on-premises only; the 2025.12 page drops that) |
| ServiceNow GRC | One workbook with a sheet per target table, plus the same sheets as CSV: control objectives, controls, control tests, issues, policy exceptions, vendor, questionnaire, links, attachments | An External ID coalesce key on every row, yyyy-MM-dd dates, documented choice values (Compliant, Non-compliant, Not applicable; Effective, Ineffective, None; New, Respond, Closed Complete) | Dictionary column names: public pages give form labels only, so confirm each column in sys_dictionary before building transform maps |
| Vanta | Vendor, findings, and risk files as JSON for the API, a risk CSV, a review workbook, and an optional custom controls CSV | Only documented API fields, because the API rejects unknown properties; status IN_PROCUREMENT; riskStatus REMEDIATE or ACCEPT; treatment Accept | Vendor CSV headings, risk CSV headings other than "Risk Scenario" |
| Drata | Vendor, risk, and task CSVs, an API payload file, a review workbook, and an evidence index | Documented risk and task headings, PREFIX-NUMBER risk IDs, YYYY-MM-DD dates, the characters < > and \ removed, tasks only for open actions due today or later | Any vendor template columns beyond those documented; Assignee Email must be filled with a Drata user before loading |
| Scrut | A vendor import workbook (columns A to O), a questionnaire template workbook (columns A to F), a risk CSV, a review workbook, and an evidence index | DD MM YYYY dates, category Security, status Assessed when a decision is recorded | Questionnaire columns after F; whether the live vendor template's apostrophe in "Vendor's Category" is straight or curly |

OSCAL was considered. Vanta exports OSCAL only, ServiceNow imports OSCAL only in Continuous Authorization and Monitoring (system security plans and assessment results), and Archer, Drata, and Scrut document no OSCAL import. A supplier review has no system security plan to carry, so OSCAL is not used.

## Sources

Archer: [Data Import basics (2025.12)](https://help.archerirm.cloud/platform_2025_12/en-us/content/platform/integration/int_dimp_basics.htm), [preparing a data import](https://help.archerirm.cloud/platform_2024_09/en-us/content/platform/integration/int_dimp_preparing.htm), [running a data import](https://help.archerirm.cloud/platform_2025_04/en-us/content/platform/integration/int_dimp_importing.htm), [issues management fields](https://help.archerirm.cloud/audit_issues_2024.03/en-us/Content/Solutions/Audit/am_ism_upgrade.htm), [question library](https://help.archerirm.cloud/platform_2024_09/en-us/content/platform/questionnaires/quest_ql_adding.htm).

ServiceNow: [import set coalesce](https://www.servicenow.com/docs/bundle/yokohama-integrate-applications/page/administer/import-sets/concept/c_ImportSetCoalesce.html), [Import Set API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_ImportSetAPI.html), [Attachment API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_AttachmentAPI.html), [Easy Import](https://www.servicenow.com/docs/r/integrate-applications/easy-import/c_EasyImport.html).

Vanta: [create a vendor](https://developer.vanta.com/api-reference/vendors/create-a-vendor.md), [add a vendor finding](https://developer.vanta.com/api-reference/vendors/add-a-vendor-finding.md), [create a risk scenario](https://developer.vanta.com/api-reference/risk-scenarios/create-risk-scenario.md), [importing custom controls](https://help.vanta.com/en/articles/11345435-importing-custom-controls), [adding and managing risks](https://help.vanta.com/en/articles/12005142-adding-and-managing-risks).

Drata: [risk bulk import](https://help.drata.com/en/articles/12260817-import-risk-in-bulk-new-experience), [custom task bulk import](https://help.drata.com/en/articles/14744132-bulk-import-custom-tasks), [vendors overview](https://help.drata.com/en/articles/13557179-vendors-overview-in-drata-new-experience), [vendor security reviews API](https://developers.drata.com/openapi/reference/v2/tag/Vendor-Security-Reviews/).

Scrut: [adding a vendor](https://help.scrut.io/docs/adding-a-single-vendor), [questionnaire template import](https://help.scrut.io/docs/bulk-importing-template), [adding a risk](https://help.scrut.io/docs/adding-a-new-risk), [vendor documents](https://help.scrut.io/docs/adding-a-document).

## Before relying on a package

These mappings were built from public documentation and checked by automated tests against those documented formats. They have not been loaded into a live tenant of any of the five platforms. Load a package into a test tenant first, and report any heading or value your tenant rejects so the mapping can be corrected.
