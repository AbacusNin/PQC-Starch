// Builds the Excel companion from the same content the browser app uses, with public tooling only.
// Usage: node build_workbook.mjs [output directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ExcelJS from 'exceljs';
import {survey, controls, tests, terms, sources} from './web/content.js';
import {resources} from './web/resources.js';
import {controlTests} from './web/control-links.js';
import {PRODUCERS} from './web/storage.js';

export const VERSION = 'v5';
const C = {navy:'FF17324D', blue:'FF24577C', pale:'FFEAF1F6', amber:'FFFFF2C6', ink:'FF1C2D3A', muted:'FF506878', line:'FFD9E2E8', white:'FFFFFFFF'};
const font = (extra = {}) => ({name:'Arial', size:10, color:{argb:C.ink}, ...extra});
const fill = argb => ({type:'pattern', pattern:'solid', fgColor:{argb}});
const CUSTOM_TEST_ROWS = 12;

function title(sheet, name, subtitle, end) {
  sheet.views = [{showGridLines:false}];
  sheet.getCell('A2').value = name;
  sheet.getCell('A2').font = font({size:15, bold:true, color:{argb:C.navy}});
  sheet.getCell('A3').value = subtitle;
  sheet.getCell('A3').font = font({italic:true, color:{argb:C.muted}});
  for (const cell of cellsIn(sheet, `A3:${end}3`)) cell.border = {bottom:{style:'thin', color:{argb:C.line}}};
  sheet.getRow(1).height = 12; sheet.getRow(2).height = 28; sheet.getRow(3).height = 24;
}
function cellsIn(sheet, range) {
  const [start, end] = range.split(':');
  const from = sheet.getCell(start), to = sheet.getCell(end || start);
  const cells = [];
  for (let row = from.row; row <= to.row; row++) for (let col = from.col; col <= to.col; col++) cells.push(sheet.getCell(row, col));
  return cells;
}
function header(sheet, labels, row = 5) {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = label;
    cell.font = font({bold:true, color:{argb:C.white}});
    cell.fill = fill(C.navy);
    cell.alignment = {vertical:'middle', wrapText:true};
  });
  sheet.getRow(row).height = 28;
}
function body(sheet, range) { for (const cell of cellsIn(sheet, range)) { cell.font = font(); cell.alignment = {vertical:'middle', wrapText:true}; } }
function input(sheet, range) { for (const cell of cellsIn(sheet, range)) { cell.fill = fill(C.amber); cell.protection = {locked:false}; } }
function widths(sheet, columns) { for (const [column, width] of Object.entries(columns)) sheet.getColumn(column).width = width; }
function list(sheet, range, values) { sheet.dataValidations.add(range, {type:'list', allowBlank:true, formulae:[`"${values.join(',')}"`]}); }
function note(sheet, address, text) { sheet.getCell(address).note = text; }
function band(sheet, range, text) {
  const [first] = range.split(':');
  sheet.getCell(first).value = text;
  for (const cell of cellsIn(sheet, range)) { cell.fill = fill(C.pale); cell.font = font({size:11, bold:true, color:{argb:C.navy}}); }
}
const freeze = (sheet, rows) => { sheet.views = [{showGridLines:false, state:'frozen', ySplit:rows}]; };
const formula = (sheet, address, text) => { sheet.getCell(address).value = {formula:text}; };

export async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PQC Buyer Workbook';
  // Excel computes the formulas on open; this library writes formulas but does not evaluate them.
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = name => workbook.addWorksheet(name);
  const lastSurvey = 5 + survey.length, lastControl = 5 + controls.length, lastTest = 5 + tests.length + CUSTOM_TEST_ROWS;

  // Buyer record: one product and assessed configuration per workbook.
  {
    const s = sheet('Buyer Record');
    title(s, 'PQC buyer record', 'Work from left to right through the tabs. Yellow cells are yours to complete.', 'H');
    widths(s, {A:26, B:36, C:3, D:27, E:39, F:3, G:26, H:42});
    for (const [labelAddress, label, answerAddress] of [['A5','Organization / buyer','B5'],['A6','Product or service','B6'],['A7','Version, edition, SKU','B7'],
      ['A8','Deployment / configuration','B8'],['A9','Vendor','B9'],['A10','Review owner','B10'],['D5','Buyer setting','E5'],['D6','Data protection life','E6'],
      ['D7','Target decision date','E7'],['D8','Policy / contract reference','E8'],['D9','Assessment date','E9']]) {
      s.getCell(labelAddress).value = label; input(s, answerAddress);
    }
    s.getCell('E7').numFmt = 'mm/dd/yyyy'; s.getCell('E9').numFmt = 'mm/dd/yyyy';
    list(s, 'E5', ['Commercial / campus','US civilian federal','National Security System','Defense supplier','Other / unsure']);
    note(s, 'E5', 'Choose the setting for this purchase. The workbook does not decide whether a law or policy applies. A federal official or counsel should confirm applicability.');
    note(s, 'E6', 'How long must the data stay secret? Long-lived sensitive data can need earlier migration because an attacker may store encrypted traffic now.');
    band(s, 'A12:H12', 'Decision snapshot');
    const metrics = [
      ['A14','Vendor questions answered','B14',['Yes','No','Partial','Unknown','N/A'].map(v => `COUNTIFS('Vendor Survey'!E6:E${lastSurvey},"${v}")`).join('+')],
      ['A15','Questions needing buyer review','B15',`COUNTIFS('Vendor Survey'!H6:H${lastSurvey},"Clarify")+COUNTIFS('Vendor Survey'!H6:H${lastSurvey},"Reject")`],
      ['A16','Crypto uses recorded','B16',`COUNTIFS('Crypto Map'!A6:A55,"<>")`],
      ['A17','Proof items accepted','B17',`COUNTIFS(Evidence!K6:K65,"Accepted")`],
      ['A18','Proof items that qualify','B18',`COUNTIFS(Evidence!N6:N65,"Yes")`],
      ['D14','Controls accepted','E14',`COUNTIFS('Control Proof'!G6:G${lastControl},"Accepted")`],
      ['D15','Controls needing follow-up','E15',`COUNTIFS('Control Proof'!G6:G${lastControl},"Clarify")+COUNTIFS('Control Proof'!G6:G${lastControl},"Gap")`],
      ['D16','Tests with a reviewer-recorded observation','E16',`COUNTIFS(Tests!I6:I${lastTest},"Observed")`],
      ['D17','Open or blocked actions','E17',`COUNTIFS(Actions!F6:F45,"Open")+COUNTIFS(Actions!F6:F45,"In progress")+COUNTIFS(Actions!F6:F45,"Blocked")`],
      ['D18','Accepted risks','E18',`COUNTIFS(Actions!F6:F45,"Accepted risk")`],
      ['D19','Buyer-required tests','E19',`COUNTIFS('Test Planning'!C6:C${lastTest},"Yes")`],
      ['D20','Blocked required tests','E20',`COUNTIFS('Test Planning'!C6:C${lastTest},"Yes",'Test Planning'!E6:E${lastTest},"Yes")`]
    ];
    for (const [labelAddress, label, valueAddress, text] of metrics) {
      s.getCell(labelAddress).value = label;
      formula(s, valueAddress, text);
      s.getCell(valueAddress).font = font({size:12, bold:true, color:{argb:C.blue}});
    }
    note(s, 'B18', 'A proof item qualifies when it is accepted, matches the product and path, and names its artifact, issuer, date, and location. See the Qualifies? column on Evidence.');
    band(s, 'A22:H22', 'Buyer conclusion');
    for (const [labelAddress, label, answerAddress, hint] of [['A24','Decision','B24','Select: proceed / conditional / pause / no decision. The buyer decides; counts do not.'],
      ['A25','What was verified','B25','State exact product version, function, and tested path.'],['A26','What remains unknown','B26','Name missing proof, untested paths, and policy questions.'],
      ['A27','Conditions before purchase','B27','Link action IDs and acceptance tests.'],['A28','Next review trigger','B28','Version, configuration, supplier, or policy change.']]) {
      s.getCell(labelAddress).value = label; input(s, answerAddress); note(s, answerAddress, hint);
    }
    list(s, 'B24', ['Proceed','Conditional','Pause','No decision']);
    band(s, 'A31:H31', 'How to work through this');
    ['1. Name the exact product and buyer setting above.', '2. Send Vendor Survey to the supplier; ask for a proof ID with each yes/no answer.',
      '3. Map each use of cryptography in Crypto Map. State what discovery missed.', '4. Register evidence and run only authorized Tests. Record each limit and who produced each proof item.',
      '5. Review each Control Proof row against the linked evidence and tests.', '6. Assign gaps in Actions. Then write the buyer conclusion above.',
      'A buyer or procurement lead can complete scope, survey, licensing, and the decision. A technical reviewer should check the crypto map, evidence, and test results.']
      .forEach((text, index) => { s.getCell(`A${33 + index}`).value = text; });
    s.getCell('A41').value = "A 2030 date is not a universal product certification. Apply the buyer's actual policy and record the source and scope.";
    s.getCell('A41').font = font({italic:true, color:{argb:C.muted}});
    s.properties.tabColor = {argb:C.navy};
    // Locks only the formula cells; yellow inputs stay editable. No password, so this guards against accidents only.
    await s.protect('', {selectLockedCells:true, selectUnlockedCells:true, formatColumns:true, formatRows:true});
  }

  {
    const s = sheet('Vendor Survey');
    title(s, 'Vendor survey', 'Ask one supplier about one product and version. Write proof IDs in column G.', 'I');
    header(s, ['ID','Topic','Ask the vendor','Proof to request','Answer','Vendor detail','Proof ID(s)','Buyer review','Follow-up']);
    survey.forEach((q, i) => s.getRow(6 + i).values = [`Q${String(i + 1).padStart(2, '0')}`, q[0], q[1], q[2], '', '', '', '', '']);
    body(s, `A6:I${lastSurvey}`);
    widths(s, {A:8, B:16, C:68, D:48, E:15, F:46, G:18, H:17, I:38});
    input(s, `E6:I${lastSurvey}`);
    list(s, `E6:E${lastSurvey}`, ['Yes','No','Partial','Unknown','N/A']);
    list(s, `H6:H${lastSurvey}`, ['Accepted','Clarify','Reject','Not reviewed']);
    freeze(s, 5);
    note(s, 'E5', 'Answer what is true for this exact product version. Choose Unknown when the supplier has not shown enough information.');
    note(s, 'G5', 'Use stable IDs from the Evidence tab, for example EV-001. A link alone does not tell a reviewer what was checked.');
    note(s, 'H5', 'Accepted means a buyer checked that the proof matches the claimed product, version, setup, and function.');
    const row = n => 5 + n;
    note(s, `C${row(4)}`, 'PQCMM is the PKI Consortium Post-Quantum Cryptography Maturity Model. A claimed level needs a product-specific assessment and criterion-level proof.');
    note(s, `C${row(8)}`, 'CBOM means cryptographic bill of materials: a structured list of algorithms, keys, certificates, and related components.');
    note(s, `C${row(14)}`, 'A TLS group is the named key exchange method selected for a connection. Record what the server actually chose.');
    note(s, `C${row(15)}`, 'A negative control tries a classical-only or unsupported peer. It shows whether the system falls back, rejects, or whether the test was inconclusive.');
    note(s, `C${row(17)}`, 'Authentication proves identity. Hybrid key exchange can be observed while the certificate chain still uses classical signatures.');
    note(s, `C${row(21)}`, 'CAVP tests an algorithm implementation. It does not by itself validate a whole cryptographic module.');
    note(s, `C${row(22)}`, 'CMVP validates a cryptographic module under FIPS 140-3. Check its exact version, operating environment, and approved mode.');
    note(s, `C${row(25)}`, 'Crypto agility means the vendor can change algorithms, certificates, and trust anchors when needed. Ask how it is tested and rolled back.');
    note(s, `C${row(30)}`, 'CNSA 2.0 is NSA guidance for National Security Systems. General commercial hybrid TLS evidence does not establish CNSA 2.0 conformance.');
    s.properties.tabColor = {argb:C.blue};
  }

  {
    const s = sheet('Crypto Map');
    title(s, 'Crypto map', 'One row for each cryptographic use and path. This is a practical intake map, not a full CycloneDX CBOM.', 'W');
    header(s, ['Use ID','Product / system','What is protected or verified?','Where is it used?','Source system','Destination system','Trust boundary','Function','Current method',
      'Parameter or key size','Protocol and version','Cipher suite','Component and version','Package URL (PURL)','SBOM component reference','CBOM asset reference','CBOM asset type',
      'Use status','Key or certificate lifecycle','Owner','Data life or exposure','PQC target or plan','Discovery coverage and blind spots']);
    body(s, 'A6:W55'); input(s, 'A6:W55');
    widths(s, {A:10, B:25, C:32, D:30, E:20, F:20, G:22, H:22, I:26, J:20, K:16, L:24, M:26, N:24, O:24, P:22, Q:18, R:16, S:30, T:18, U:22, V:28, W:40});
    list(s, 'H6:H55', ['Key establishment','Server authentication','Client authentication','Data encryption','Software signing','Firmware signing','Boot verification','Certificate issuance','Certificate validation','Backup / key wrap','Other']);
    list(s, 'Q6:Q55', ['algorithm','protocol','certificate','related-crypto-material']);
    list(s, 'R6:R55', ['Vendor claim','CBOM listed','Configured','Observed','Buyer accepted']);
    note(s, 'A5', 'Assign a stable ID, such as CU-001, to each cryptographic use. A product may need many rows.');
    note(s, 'D5', 'Name the connection or system path, such as user-to-edge, edge-to-origin, device-to-controller, or update signer-to-device.');
    note(s, 'E5', 'Where this path starts. The browser workbook draws a path diagram from the source and destination columns.');
    note(s, 'I5', 'Record the method in use now, even if it is classical. Do not list only future PQC plans.');
    note(s, 'R5', 'How strongly this path is supported. Rows imported into the browser workbook start as Vendor claim or CBOM listed until a reviewer confirms them.');
    note(s, 'S5', 'Rotation, expiry, revocation, and custody details. Never enter raw private keys or secrets.');
    note(s, 'U5', 'Record how long the protected data must remain secret and whether traffic could be captured now.');
    note(s, 'W5', 'State what scans, vendor lists, or interviews covered, plus known blind spots. An empty scan is not proof that crypto is absent.');
    freeze(s, 5);
  }

  {
    const s = sheet('SBOM and CBOM Register');
    title(s, 'Inventory review register', 'One row for each supplied SBOM or CBOM. Check the original file before trusting its claims.', 'T');
    header(s, ['BOM record ID','BOM kind','BOM serial number','BOM version','BOM target product','BOM target release','BOM supplier','BOM author','BOM creation date','BOM lifecycle',
      'Generation tool and version','Source or evidence ID','Schema validation result','Signature verification result','Declared completeness','External services and boundaries',
      'Dependency and provides review','Sharing or redaction limits','BOM reviewer','BOM review notes']);
    body(s, 'A6:T55'); input(s, 'A6:T55');
    widths(s, {A:17, B:20, C:43, D:15, E:31, F:25, G:28, H:28, I:20, J:20, K:30, L:25, M:28, N:28, O:30, P:44, Q:48, R:38, S:24, T:45});
    s.getColumn('I').numFmt = 'mm/dd/yyyy';
    list(s, 'B6:B55', ['SBOM','CBOM','Combined SBOM and CBOM']);
    list(s, 'J6:J55', ['Design','Pre-build','Build','Post-build','Operations','Discovery','Other']);
    note(s, 'C5', 'Record the CycloneDX document identity. This sheet does not validate the source file or its signature.');
    note(s, 'N5', 'State whether a real signature and expected signer were checked. A hash alone is not signer proof.');
    note(s, 'O5', 'Mark completeness as claimed by the producer. Check components, services, and dependencies separately.');
    note(s, 'Q5', 'A component that provides an algorithm may never use it on the deployed path.');
    freeze(s, 5);
  }

  {
    const s = sheet('Evidence');
    title(s, 'Evidence register', 'One row per document, trace, report, or certificate. Store sensitive files in an approved location.', 'N');
    header(s, ['Proof ID','Linked IDs, separated by commas','Proof type','Produced by','What is the artifact?','Issuer or observer','Date','Product/version match?','Path/setup match?',
      'Location or URL','Buyer result','Sensitivity','Review note','Qualifies?']);
    body(s, 'A6:N65'); input(s, 'A6:M65');
    widths(s, {A:12, B:26, C:22, D:22, E:39, F:24, G:14, H:18, I:18, J:44, K:16, L:20, M:42, N:12});
    s.getColumn('G').numFmt = 'mm/dd/yyyy';
    list(s, 'C6:C65', ['Vendor statement','Product documentation','Release note','Assessment report','CBOM / inventory','Configuration','Test trace','Independent test','CAVP certificate','CMVP certificate','Contract / roadmap','Other']);
    list(s, 'D6:D65', PRODUCERS);
    list(s, 'H6:H65', ['Yes','No','Unsure']); list(s, 'I6:I65', ['Yes','No','Unsure']);
    list(s, 'K6:K65', ['Accepted','Clarify','Rejected','Not reviewed']);
    list(s, 'L6:L65', ['Public','Customer confidential','NDA / secure portal','Redacted','Assessor only']);
    for (let row = 6; row <= 65; row++) formula(s, `N${row}`, `IF(A${row}="","",IF(AND(K${row}="Accepted",H${row}="Yes",I${row}="Yes",E${row}<>"",F${row}<>"",G${row}<>"",J${row}<>""),"Yes","No"))`);
    note(s, 'A5', 'Give every proof item a stable ID, such as EV-001. Link the ID from the survey, controls, crypto map, or tests.');
    note(s, 'D5', 'Who created the artifact. Supplier documents restate the claim; buyer or independent proof checks it. Only buyer or independent proof can back an observed test.');
    note(s, 'H5', 'A genuine certificate or report can still be irrelevant if it covers a different product version or module build.');
    note(s, 'J5', 'Link to the approved record. Do not paste secrets, private architecture, full CBOMs, or customer data into a public GitHub issue.');
    note(s, 'K5', 'Accepted means reviewed for relevance, scope, and source. A hash alone proves file consistency against a known value, not the identity of its issuer.');
    note(s, 'N5', 'Calculated. Yes when the item is accepted, matches the product and path, and names its artifact, issuer, date, and location. This is the browser scorecard rule.');
    freeze(s, 5);
  }

  {
    const s = sheet('Tests');
    title(s, 'Verification tests', 'Run only on systems you are authorized to test. A result applies to its recorded path and setup.', 'M');
    header(s, ['Test ID','Test idea','Expected proof','Path to test','Source IDs','Product / build','Tool + version','Raw proof ID','Result','Observed detail','Negative control','Limit / untested area','Reviewer + date']);
    tests.forEach((t, i) => s.getRow(6 + i).values = [...t, '', '', '', '', '', '', '', '']);
    body(s, `A6:M${lastTest}`); input(s, `F6:M${lastTest}`); input(s, `A${6 + tests.length}:E${lastTest}`);
    widths(s, {A:10, B:33, C:54, D:28, E:22, F:24, G:24, H:18, I:17, J:46, K:36, L:46, M:25});
    for (let row = 6; row <= lastTest; row++) s.getRow(row).height = 42;
    list(s, `I6:I${lastTest}`, ['Observed','Failed','Inconclusive','N/A']);
    note(s, 'A5', `Rows ${6 + tests.length} to ${lastTest} are for product-specific tests. Use an XT-### ID and name a source for each.`);
    note(s, 'E5', 'Use the source IDs in Terms & Sources to read the original guidance. The test description is a buyer-oriented synthesis.');
    note(s, 'I5', 'Leave blank until the test runs. Observed means a reviewer recorded the expected behavior on this one path; it counts only with buyer or independent proof. A blocked test stays blank, not Inconclusive.');
    note(s, 'K5', 'A negative control deliberately tries an older or unsupported condition so the tester can see fallback, rejection, or a test-tool limitation.');
    note(s, 'L5', 'State which paths, client versions, resumed sessions, regions, and authentication steps were not tested.');
    freeze(s, 5);
  }

  {
    const s = sheet('Test Planning');
    title(s, 'Test planning and dependencies', 'The buyer decides which tests are procurement requirements. Name teams, blockers, and pass rules.', 'Q');
    header(s, ['Test ID','Test idea','Required for procurement?','Requirement or rationale','Blocked?','Blocker and owner','Blocked-test decision','Has dependencies?','Prerequisite IDs and details',
      'Lead team or tester','Other teams needed','Decision owner','Planned date','Test setting','Test method','Acceptance rule','Suggested control IDs']);
    for (let row = 6; row <= lastTest; row++) {
      formula(s, `A${row}`, `IF(Tests!A${row}="","",Tests!A${row})`);
      formula(s, `B${row}`, `IF(Tests!B${row}="","",Tests!B${row})`);
      const id = tests[row - 6]?.[0];
      if (id) s.getCell(`Q${row}`).value = Object.entries(controlTests).filter(([, ids]) => ids.includes(id)).map(([control]) => control).join(', ');
    }
    body(s, `A6:Q${lastTest}`); input(s, `C6:P${lastTest}`);
    widths(s, {A:12, B:35, C:22, D:40, E:14, F:40, G:26, H:20, I:43, J:28, K:28, L:25, M:18, N:30, O:55, P:50, Q:25});
    s.getColumn('M').numFmt = 'mm/dd/yyyy';
    list(s, `C6:C${lastTest}`, ['Yes','No','Undecided']);
    list(s, `E6:E${lastTest}`, ['Yes','No']);
    list(s, `G6:G${lastTest}`, ['Pending','Reschedule','Use alternate proof','Accept risk','Waive with approval']);
    list(s, `H6:H${lastTest}`, ['Yes','No','Unknown']);
    note(s, 'C5', 'The buyer or procurement authority decides. A source paper alone does not make a test a universal buying requirement.');
    note(s, 'G5', 'A waiver or accepted risk needs a named approver, rationale, and linked action or proof.');
    note(s, 'P5', 'State the pass and fail observations for the exact build, route, and setting.');
    note(s, 'Q5', 'Suggested links from the shared catalog. Reviewers decide applicability.');
    freeze(s, 5);
  }

  {
    const s = sheet('Control Proof');
    title(s, 'Control and proof review', 'One buyer check may draw on several questions, proof items, and tests. This is not a certification.', 'I');
    header(s, ['ID','What needs to be true','Source ID(s)','Vendor question(s)','Applies?','Proof ID(s)','Buyer result','Gap / action ID','Suggested test IDs']);
    controls.forEach((c, i) => s.getRow(6 + i).values = [...c, '', '', '', '', (controlTests[c[0]] || []).join('; ')]);
    body(s, `A6:I${lastControl}`); input(s, `E6:H${lastControl}`);
    widths(s, {A:9, B:70, C:26, D:25, E:14, F:22, G:17, H:30, I:32});
    list(s, `E6:E${lastControl}`, ['Yes','No','Unsure']);
    list(s, `G6:G${lastControl}`, ['Accepted','Clarify','Gap','N/A']);
    note(s, 'G5', 'Leave blank until reviewed. Accepted means the buyer checked the linked proof for the offered product and setup. It is not a PQCMM level or FIPS certificate.');
    note(s, 'C5', 'Source IDs point to official standards or guidance in Terms & Sources. These rows summarize buyer checks; they are not quoted control text.');
    note(s, 'I5', 'Suggested links, not universal requirements. Mark required tests, blockers, teams, and pass rules in Test Planning.');
    freeze(s, 5);
  }

  {
    const s = sheet('Actions');
    title(s, 'Action plan', 'Turn each gap or missing proof into an owned task.', 'M');
    header(s, ['Action ID','Linked control / question','Gap or risk','What must happen','Owner','Status','Target date','Milestone / dependency','Closure proof ID','Risk approver','Risk scope','Risk expiry','Buyer note']);
    body(s, 'A6:M45'); input(s, 'A6:M45');
    widths(s, {A:12, B:25, C:45, D:48, E:24, F:17, G:16, H:38, I:18, J:22, K:30, L:14, M:42});
    s.getColumn('G').numFmt = 'mm/dd/yyyy'; s.getColumn('L').numFmt = 'mm/dd/yyyy';
    list(s, 'F6:F45', ['Open','In progress','Blocked','Closed','Accepted risk']);
    note(s, 'I5', 'Closing an action requires a proof record.');
    note(s, 'J5', 'For an accepted risk, name who accepted it, what it covers, and when it must be reviewed again. An open-ended acceptance is a gap.');
    freeze(s, 5);
  }

  {
    const s = sheet('Licensing');
    title(s, 'Licenses and purchase rights', 'Record supplier terms and each applicable license separately.', 'I');
    for (const [labelAddress, label, answerAddress, hint] of [['A5','License model','B5','How the product is licensed to the buyer.'],
      ['A6','PQC feature entitlement','B6','Is the feature included, paid, preview, or planned in this edition?'],['A7','Support and update term','B7','How long are support and security updates promised for this version?'],
      ['A8','Migration and rollback rights','B8','Can the buyer test, change, and roll back cryptographic methods?'],['A9','Third-party crypto terms','B9','Which upstream terms and support dependencies apply?'],
      ['A10','License proof ID','B10','Link the applicable contract or support artifact in Evidence.'],['A11','License review note','B11','Record unresolved purchasing or legal questions.']]) {
      s.getCell(labelAddress).value = label; input(s, answerAddress); note(s, answerAddress, hint);
    }
    band(s, 'A13:I13', 'Individual licenses');
    header(s, ['License record ID','License or agreement name','Product or component covered','License identifier','Original license URL','Rights granted','Conditions or limits','License proof ID','License review note'], 14);
    body(s, 'A15:I64'); input(s, 'A15:I64');
    widths(s, {A:16, B:32, C:30, D:22, E:62, F:43, G:43, H:16, I:43});
    note(s, 'C14', 'Record the exact product, component, guide, or schema covered by this license.');
    note(s, 'G14', 'Include attribution, notice, support, term, renewal, or distribution limits as applicable.');
    note(s, 'H14', 'Use an EV ID for source documentation when available.');
    band(s, 'A67:I67', 'Publishing this workbook');
    s.getCell('A68').value = "Choose this project's own public license before release.";
    s.getCell('A69').value = 'The linked CycloneDX guides state CC BY 4.0. The bundled official 1.7 JSON Schema is Apache 2.0.';
    s.getCell('A70').value = "Check each publisher's terms before copying substantial text, figures, code, or schemas into a public version.";
    freeze(s, 14);
  }

  {
    const s = sheet('Terms & Sources');
    title(s, 'Terms and sources', 'Hover cells with a note marker for short explanations. Source IDs appear in the Control Proof tab.', 'G');
    const sourceUrls = new Set(sources.map(item => item[2]));
    const allSourceIds = [...sources, ...resources.filter(item => !sourceUrls.has(item[4])).map((item, index) => [`LIB-${String(index + 1).padStart(3, '0')}`, item[1], item[4]])];
    const sortedTerms = [...terms].sort((a, b) => a[0].localeCompare(b[0]));
    header(s, ['Term','Plain-language meaning','','Source ID','Source','Link']);
    s.getCell('C5').fill = fill(C.white);
    sortedTerms.forEach(([word, meaning], i) => { s.getCell(`A${6 + i}`).value = word; s.getCell(`B${6 + i}`).value = meaning; note(s, `A${6 + i}`, meaning); });
    [...allSourceIds].sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, label, url], i) => {
      s.getCell(`D${6 + i}`).value = id; s.getCell(`E${6 + i}`).value = label; s.getCell(`F${6 + i}`).value = {text:url, hyperlink:url};
    });
    body(s, `A6:B${5 + sortedTerms.length}`); body(s, `D6:F${5 + allSourceIds.length}`);
    widths(s, {A:24, B:74, C:3, D:16, E:54, F:100});
    const methodRow = 7 + Math.max(sortedTerms.length, allSourceIds.length);
    s.getCell(`A${methodRow}`).value = 'Method note';
    s.getCell(`A${methodRow}`).font = font({size:11, bold:true, color:{argb:C.navy}});
    ['Questions and control summaries are plain-language syntheses. Follow linked authorities for exact requirements.',
      'PQCA tracks component readiness; this workbook records buyer-specific product claims and proof.',
      'The Crypto Map is manual intake. Check a real CycloneDX CBOM and SBOM for machine-readable inventory.']
      .forEach((text, i) => { s.getCell(`A${methodRow + 1 + i}`).value = text; s.getCell(`A${methodRow + 1 + i}`).font = font({color:{argb:C.muted}}); });
  }
  return workbook;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const outputDir = path.resolve(process.argv[2] || 'output');
  await fs.mkdir(outputDir, {recursive:true});
  const file = path.join(outputDir, `PQC_Buyer_Verification_Workbook_${VERSION}.xlsx`);
  await (await buildWorkbook()).xlsx.writeFile(file);
  console.log(`Saved ${file}`);
}
