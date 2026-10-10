import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {startServer} from './server.mjs';

let BASE, server;
before(async () => { server = await startServer(); BASE = server.url; });
after(() => server.close());

test('guided assessment links answers, proof, actions, export, import, and local save', async () => {
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  const errors=[];
  const requests=[];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  try {
    await page.goto(BASE);
    await assert.equal(await page.locator('h1').first().textContent(), 'Define this purchase');
    await page.locator('[data-buyer="product"]').fill('Sample Gateway');
    await page.locator('[data-buyer="version"]').fill('2.4.1 enterprise');
    await page.locator('[data-buyer="setting"]').selectOption('Commercial / campus');
    await page.locator('[data-route="survey"]').click();
    await page.locator('[data-question="Q04"]').click();
    const surveyTerm=page.locator('abbr.term').first();
    assert.match(await surveyTerm.getAttribute('data-definition'), /PQC maturity/i);
    await surveyTerm.hover();
    assert.equal(await page.locator('#term-tooltip').isVisible(),true);
    assert.match(await page.locator('#term-tooltip').textContent(),/PQC maturity/i);
    await surveyTerm.focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#term-tooltip').isVisible(),false);
    await page.locator('[data-question="Q01"]').click();
    await page.locator('[data-survey="Q01"][data-field="answer"]').selectOption('Yes');
    await page.locator('[data-survey="Q01"][data-field="detail"]').fill('Product build and license supplied.');
    await page.locator('[data-route="evidence"]').click();
    assert.equal(await page.locator('[data-edit="evidence"]').count(),1);
    assert.match(await page.locator('.record').first().textContent(),/Survey answer Yes/);
    await page.locator('[data-add="evidence"]').click();
    await page.locator('#record-form [name="type"]').selectOption('Product documentation');
    await page.locator('#record-form [name="artifact"]').fill('Sample Gateway release guide');
    await page.locator('#record-form [name="issuer"]').fill('Sample Vendor');
    await page.locator('#record-form [name="date"]').fill('2026-10-09');
    await page.locator('#record-form [name="location"]').fill('https://example.test/release-guide');
    await page.locator('#record-form [name="productMatch"]').selectOption('Yes');
    await page.locator('#record-form [name="pathMatch"]').selectOption('Yes');
    await page.locator('#record-form [name="result"]').selectOption('Accepted');
    await page.locator('#record-form [name="linkedIds"]').fill('Q01, C01');
    await page.locator('#evidence-file').setInputFiles({name:'release-note.txt',mimeType:'application/octet-stream',buffer:Buffer.from('Sample synthetic evidence')});
    await page.locator('#record-form button[type="submit"]').click();
    await page.locator('.record h3').nth(1).waitFor();
    await assert.equal(await page.locator('.record h3').count(),2);
    await page.locator('[data-route="controls"]').click();
    assert.match(await page.locator('.record.control').first().textContent(), /Q01: Yes/);
    assert.match(await page.locator('.record.control').first().textContent(), /EV-002: Matching proof/);
    await page.locator('[data-control="C01"][data-field="applies"]').selectOption('Yes');
    await page.locator('[data-control="C01"][data-field="result"]').selectOption('Accepted');
    await page.locator('nav [data-route="crypto"]').click();
    await page.locator('[data-add="crypto"]').click();
    await page.locator('#record-form [name="protected"]').fill('Browser connection');
    await page.locator('#record-form [name="path"]').fill('User to edge');
    await page.locator('#record-form [name="function"]').selectOption('Key establishment');
    await page.locator('#record-form [name="current"]').fill('X25519MLKEM768');
    await page.locator('#record-form button[type="submit"]').click();
    await page.locator('[data-route="actions"]').click();
    await page.locator('[data-add="actions"]').click();
    await page.locator('#record-form [name="gap"]').fill('Confirm origin path');
    await page.locator('#record-form [name="status"]').selectOption('Open');
    await page.locator('#record-form button[type="submit"]').click();
    await page.locator('[data-route="overview"]').click();
    assert.match(await page.locator('.stats').first().textContent(), /1 \/ 38/);
    assert.match(await page.locator('.stats').first().textContent(), /1\s*Cryptographic uses recorded/);
    assert.match(await page.locator('.stats').first().textContent(), /1 accepted\s*Proof items, 1 qualify/);
    await page.reload();
    assert.equal(await page.locator('[data-buyer="product"]').inputValue(),'Sample Gateway');
    await page.locator('#export-button').click();
    const [download] = await Promise.all([page.waitForEvent('download'),page.locator('[data-export="all"]').click()]);
    const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(exported.assessment.buyer.product,'Sample Gateway');
    assert.equal(exported.attachments.length,1);
    assert.equal(exported.attachments[0].id,'EV-002');
    assert.equal(exported.attachments[0].type,'text/plain');
    assert.equal(exported.assessment.controls.C01.result,'Accepted');
    await page.locator('#export-button').click();
    const [answersDownload] = await Promise.all([page.waitForEvent('download'),page.locator('[data-export="answers"]').click()]);
    const answersOnly=JSON.parse(await fs.readFile(await answersDownload.path(),'utf8'));
    assert.equal(answersOnly.attachments.length,0);
    assert.equal(answersOnly.assessment.evidence[1].attachmentName,'');
    const second = await browser.newContext({acceptDownloads:true});
    const importedPage = await second.newPage();
    importedPage.on('dialog', dialog => dialog.accept());
    await importedPage.goto(BASE);
    await importedPage.locator('#import-button').click();
    await importedPage.locator('#import-file').setInputFiles({name:'assessment.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
    await importedPage.locator('[data-import-choice="replace"]').click();
    await importedPage.getByText('Assessment imported and saved locally.').waitFor();
    assert.equal(await importedPage.locator('[data-buyer="product"]').inputValue(),'Sample Gateway');
    await importedPage.locator('[data-route="evidence"]').click();
    assert.equal(await importedPage.locator('[data-download-attachment="EV-002"]').count(),1);
    const [attachmentDownload] = await Promise.all([importedPage.waitForEvent('download'),importedPage.locator('[data-download-attachment="EV-002"]').click()]);
    assert.equal(await fs.readFile(await attachmentDownload.path(),'utf8'),'Sample synthetic evidence');
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(url => url.startsWith(BASE)),`Unexpected network request: ${requests.join(', ')}`);
    await second.close();
  } finally { await context.close(); await browser.close(); }
});

test('invalid import leaves current answers in place', async () => {
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const page=await context.newPage();
  try {
    await page.goto(BASE);
    await page.locator('[data-buyer="product"]').fill('Keep this record');
    await page.locator('#import-button').click();
    await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"wrong":true}')});
    await page.getByText('This is not a PQC Buyer Workbook export.').waitFor();
    assert.equal(await page.locator('[data-buyer="product"]').inputValue(),'Keep this record');
  } finally { await context.close(); await browser.close(); }
});

test('mobile navigation, print record, and untrusted text stay usable', async () => {
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(()=>{window.print=()=>{window.__printCalled=true;};});
  try {
    await page.goto(BASE);
    await page.locator('[data-buyer="product"]').fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('.lead-record img').count(),0);
    await page.locator('#menu-button').click();
    await page.locator('#rail').evaluate(element=>new Promise(resolve=>setTimeout(resolve,220)));
    assert.equal(await page.locator('#rail').evaluate(element=>element.getBoundingClientRect().left),0);
    await page.locator('nav [data-route="tests"]').click();
    assert.equal(await page.locator('[data-select-test]').count(),33);
    assert.equal(await page.locator('.record').count(),1);
    // The app closes the tooltip on scroll. If the term starts below the fold, the click's own scroll can land
    // after the click and close it, so scroll first and let two frames pass before clicking.
    const term=page.locator('#view .term').first();
    await term.scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await term.click();
    // Under a loaded test run the tooltip can paint a moment after the click, so wait for it.
    await page.locator('#term-tooltip').waitFor({state:'visible',timeout:5000});
    await page.keyboard.press('Escape');
    await page.locator('#menu-button').click();
    await page.locator('[data-route="sources"]').click();
    assert.equal(await page.locator('.source-table').count(),2);
    const resourceCount=await page.locator('.resource-card').count();
    assert.ok(resourceCount>51);
    assert.equal(await page.getByText('Research review: October 9, 2026.').count(),0);
    // AudiOS stays out of the resource library and source list; the header's style switch may name it.
    assert.equal(await page.locator('#view').getByText('AudiOS').count(),0);
    assert.equal(await page.locator('#resource-library').evaluate(node=>node.open),false);
    await page.locator('#resource-library summary').click();
    assert.equal(await page.locator('#resource-library').evaluate(node=>node.open),true);
    assert.equal(await page.locator('.source-grid details').first().evaluate(node=>node.open),false);
    await page.locator('.source-grid details').first().locator('summary').click();
    // The Terms table already shows each meaning beside its term, so the term is plain text there.
    assert.equal(await page.locator('.source-table .term').count(),0);
    assert.ok(await page.locator('.source-table dfn').count()>50);
    await page.locator('#resource-search').fill('CNSA');
    assert.ok(await page.locator('.resource-card').count()>0);
    assert.ok(await page.locator('.resource-card').count()<resourceCount);
    await page.locator('#resource-search').fill('');
    await page.locator('[data-resource-group="NSA"]').click();
    assert.equal(await page.locator('.resource-card').count(),4);
    await page.locator('#menu-button').click();
    await page.locator('nav [data-route="scorecard"]').click();
    assert.equal(await page.locator('.score-item').count(),6);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth+1),true);
    await page.locator('#print-button').click();
    assert.equal(await page.evaluate(()=>window.__printCalled),true);
    assert.match(await page.locator('#print-root').textContent(), /<img src=x onerror=alert\(1\)>/);
    assert.equal(await page.locator('#print-root img').count(),0);
    assert.deepEqual(errors,[]);
  } finally { await context.close(); await browser.close(); }
});

test('field help appears in every work section, including record dialogs', async () => {
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(BASE);
    for(const route of ['overview','survey','tests','controls']) {
      await page.locator(`[data-route="${route}"]`).click();
      await page.locator('.field-term').first().hover();
      assert.equal(await page.locator('#term-tooltip').isVisible(),true,route);
      assert.ok((await page.locator('#term-tooltip').textContent()).length>15,route);
    }
    for(const [route,button] of [['crypto','crypto'],['evidence','evidence'],['actions','actions']]) {
      await page.locator(`[data-route="${route}"]`).click();
      await page.locator(`[data-add="${button}"]`).click();
      await page.locator('#record-dialog .field-term').first().hover();
      assert.equal(await page.locator('#term-tooltip').isVisible(),true,route);
      assert.equal(await page.locator('#term-tooltip').evaluate(node=>node.parentElement.id),'record-dialog',route);
      await page.locator('#dialog-close').click();
    }
  } finally { await browser.close(); }
});

test('old local records migrate; licensing, scorecard, and claim drafts stay evidence scoped', async () => {
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  const old={schemaVersion:1,createdAt:'2026-10-09T00:00:00.000Z',updatedAt:'2026-10-09T00:00:00.000Z',
    buyer:{organization:'Clinic',product:'Sample Gateway',version:'2.4.1',configuration:'Edge TLS only',setting:'Commercial / campus',reviewer:'Buyer',unknown:'Origin path not tested'},
    survey:{Q01:{answer:'Yes',review:'Accepted',detail:'Vendor statement'}},
    crypto:[{id:'CU-001',product:'Sample Gateway',protected:'Browser connection',path:'Browser to edge',function:'Key establishment',current:'X25519MLKEM768',component:'Gateway 2.4.1',coverage:'Origin path not discovered'}],
    evidence:[{id:'EV-001',linkedIds:['Q01','C01','CU-001','T01'],type:'Product documentation',artifact:'Release guide',issuer:'Vendor',date:'2026-10-09',productMatch:'Yes',pathMatch:'Yes',location:'https://example.test/guide',result:'Accepted'},
      {id:'EV-002',linkedIds:['CU-001'],type:'Test trace',artifact:'Older build trace',issuer:'Lab',date:'2026-10-09',productMatch:'Yes',pathMatch:'No',location:'https://example.test/trace',result:'Accepted'}],
    tests:{T01:{productBuild:'2.4.1',toolVersion:'Tester 1',cryptoUseId:'CU-001',result:'Observed',observed:'Hybrid group negotiated',negative:'Classical control observed',limits:'Edge only',reviewerDate:'Buyer 2026-10-09'}},
    controls:{C01:{applies:'Yes',result:'Accepted'}},actions:[]};
  try {
    await page.goto(BASE);
    await page.evaluate(value=>localStorage.setItem('pqc-buyer-workbook:v1',JSON.stringify(value)),old);
    await page.reload();
    assert.equal(await page.locator('[data-buyer="product"]').inputValue(),'Sample Gateway');
    await page.locator('[data-route="scorecard"]').click();
    assert.match(await page.locator('.score-grid').textContent(),/1 of 1 yes answers supported/);
    assert.match(await page.locator('.score-grid').textContent(),/1 \/ 26 applicable controls; 0 \/ 33 applicable tests supported/);
    assert.match(await page.locator('.score-grid').textContent(),/1 accepted proof records that do not qualify/);
    await page.locator('[data-route="attestations"]').click();
    assert.match(await page.locator('.claim-draft').textContent(),/Counter-evidence needs review/);
    assert.match(await page.locator('.claim-draft').textContent(),/EV-001/);
    assert.match(await page.locator('.claim-draft').textContent(),/EV-002/);
    assert.match(await page.locator('.claim-draft').textContent(),/Origin path not discovered/);
    await page.locator('[data-export-claims]').click();
    const [claimDownload]=await Promise.all([page.waitForEvent('download'),page.locator('[data-confirm-claims]').click()]);
    const claims=JSON.parse(await fs.readFile(await claimDownload.path(),'utf8'));
    assert.equal(claims.bomFormat,'CycloneDX');
    assert.equal(claims.specVersion,'1.7');
    assert.equal(claims.declarations.claims[0].counterEvidence[0],'proof-EV-002');
    const validation=spawnSync('python',['test/schema-check.py',await claimDownload.path()],{encoding:'utf8'});
    assert.equal(validation.status,0,validation.stdout+validation.stderr);
    await page.locator('[data-route="licensing"]').click();
    await page.locator('[data-license="pqcEntitlement"]').fill('Included with enterprise license');
    await page.reload();
    assert.equal(await page.locator('[data-license="pqcEntitlement"]').inputValue(),'Included with enterprise license');
    await page.locator('#export-button').click();
    const [assessmentDownload]=await Promise.all([page.waitForEvent('download'),page.locator('[data-export="answers"]').click()]);
    const assessment=JSON.parse(await fs.readFile(await assessmentDownload.path(),'utf8'));
    assert.equal(assessment.assessment.schemaVersion,5);
    assert.equal(assessment.assessment.licensing.pqcEntitlement,'Included with enterprise license');
    assert.equal(assessment.assessment.tests.T01.cryptoUseId,'CU-001');
  } finally { await context.close(); await browser.close(); }
});

test('topology, BOM intake, guided lists, repeatable licenses, and scorecard help persist', async () => {
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(BASE);
    await page.locator('nav [data-route="process"]').click();
    await page.locator('.process-step .field-term').first().hover();
    assert.equal(await page.locator('#term-tooltip').isVisible(),true);
    await page.locator('nav [data-route="crypto"]').click();
    await page.locator('[data-add="crypto"]').click();
    await page.locator('#record-form [name="sourceNode"]').fill('Browser');
    await page.locator('#record-form [name="destinationNode"]').fill('Edge');
    await page.locator('#record-form [name="function"]').selectOption('Key establishment');
    await page.locator('#record-form [name="usageStatus"]').selectOption('Observed');
    await page.locator('#record-form [name="coverage"]').fill('-----BEGIN PRIVATE KEY-----');
    await page.locator('#record-form button[type="submit"]').click();
    assert.equal(await page.locator('#record-dialog').evaluate(node=>node.open),true);
    assert.match(await page.locator('#toast').textContent(),/Do not enter private keys/);
    await page.locator('#record-form [name="coverage"]').fill('Manual entry');
    await page.locator('#record-form button[type="submit"]').click();
    assert.match(await page.locator('.topology-paths').textContent(),/Browser → Edge/);
    assert.equal(await page.locator('.topology svg line').count(),1);
    await page.locator('[data-add="boms"]').click();
    await page.locator('#record-form [name="kind"]').selectOption('CBOM');
    await page.locator('#record-form [name="target"]').fill('Sample Gateway');
    await page.locator('#record-form button[type="submit"]').click();
    assert.match(await page.locator('.section').filter({hasText:'SBOM and CBOM register'}).textContent(),/BM-001/);
    await page.locator('nav [data-route="tests"]').click();
    assert.equal(await page.locator('[data-select-test]').count(),33);
    await page.locator('[data-select-test="T18"]').click();
    assert.match(await page.locator('.record').textContent(),/Provider-only negative control/);
    assert.ok(await page.locator('.record a[href*="cyclonedx.org"]').count()>0);
    await page.locator('nav [data-route="controls"]').click();
    await page.locator('[data-select-control="C18"]').click();
    assert.match(await page.locator('.record.control').textContent(),/downstream supplier coverage/);
    await page.locator('nav [data-route="licensing"]').click();
    for(const name of ['Apache 2.0','CC BY 4.0']) {
      await page.locator('[data-add="licenses"]').click();
      await page.locator('#record-form [name="name"]').fill(name);
      await page.locator('#record-form button[type="submit"]').click();
    }
    assert.equal(await page.locator('[data-edit="licenses"]').count(),2);
    await page.reload();
    assert.equal(await page.locator('[data-edit="licenses"]').count(),2);
    await page.locator('nav [data-route="scorecard"]').click();
    assert.equal(await page.locator('.score-bar').count(),3);
    assert.equal(await page.locator('.score-bar progress').first().getAttribute('value'),'0');
    assert.equal(await page.locator('.score-remedy').count(),6);
    await page.locator('.score-item .field-term').first().hover();
    assert.equal(await page.locator('#term-tooltip').isVisible(),true);
  } finally { await browser.close(); }
});

test('product-specific tests retain sources, proof links, and scorecard totals', async () => {
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(BASE);
    await page.locator('nav [data-route="tests"]').click();
    await page.locator('[data-add="customTests"]').click();
    await page.locator('#record-form [name="title"]').fill('Gateway to origin TLS');
    await page.locator('#record-form [name="expected"]').fill('Capture the negotiated key exchange and certificate authentication on the internal leg.');
    await page.locator('#record-form [name="path"]').fill('Gateway to origin');
    await page.locator('#record-form [name="sources"]').fill('https://www.nsa.gov/Cybersecurity/Post-Quantum-Cybersecurity-Resources/');
    await page.locator('#record-form button[type="submit"]').click();
    assert.equal(await page.locator('[data-select-test]').count(),34);
    assert.match(await page.locator('.record').textContent(),/Gateway to origin TLS/);
    assert.ok(await page.locator('.record a[href*="nsa.gov"]').count()>0);
    await page.locator('[data-test="XT-001"][data-field="result"]').selectOption('Failed');
    await page.reload();
    assert.equal(await page.locator('[data-select-test="XT-001"]').count(),1);
    await page.locator('[data-select-test="XT-001"]').click();
    assert.equal(await page.locator('[data-test="XT-001"][data-field="result"]').inputValue(),'Failed');
    await page.locator('nav [data-route="scorecard"]').click();
    assert.match(await page.locator('.score-grid').textContent(),/0 \/ 34 applicable tests supported/);
    assert.match(await page.locator('.score-grid').textContent(),/1 failed tests; 0 inconclusive tests/);
  } finally { await browser.close(); }
});

test('section imports preview records and preserve buyer review boundaries', async () => {
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(BASE);
    await page.locator('nav [data-route="crypto"]').click();
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'uses.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{id:'CU-001',protected:'Internal API',current:'ML-KEM-768',sourceNode:'Gateway',destinationNode:'Origin',usageStatus:'Observed'}]))});
    await page.locator('[data-apply-record-import]').waitFor();
    assert.match(await page.locator('#transfer-body').textContent(),/1 record/);
    await page.locator('[data-apply-record-import]').click();
    assert.match(await page.locator('.topology-paths').textContent(),/Gateway/);
    await page.locator('[data-edit="crypto"]').first().click();
    assert.equal(await page.locator('#record-form [name="usageStatus"]').inputValue(),'Vendor claim');
    await page.locator('#dialog-close').click();

    await page.locator('[data-import-records="boms"]').click();
    const bom={bomFormat:'CycloneDX',specVersion:'1.7',serialNumber:'urn:uuid:00000000-0000-4000-8000-000000000001',version:1,metadata:{component:{name:'Sample Gateway',version:'2.4'}}};
    await page.locator('#record-import-file').setInputFiles({name:'supplier-cbom.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bom))});
    await page.locator('[data-apply-record-import]').waitFor();
    await page.locator('[data-apply-record-import]').click();
    // The app runs its own checks on a CycloneDX file; this one's component lacks the required type.
    const register=await page.locator('.section').filter({hasText:'SBOM and CBOM register'}).textContent();
    assert.match(register,/Fails the CycloneDX 1\.7 schema/);
    assert.match(register,/No signature on the BOM document/);

    await page.locator('nav [data-route="evidence"]').click();
    await page.locator('[data-import-records="evidence"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{id:'EV-001',artifact:'Supplier test report',issuer:'Supplier',result:'Accepted',productMatch:'Yes',pathMatch:'Yes',linkedIds:['Q01']}]))});
    await page.locator('[data-apply-record-import]').waitFor();
    await page.locator('[data-apply-record-import]').click();
    assert.match(await page.locator('.record').first().textContent(),/Not reviewed/);

    const zip=new JSZip();
    zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Crypto Map" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Use ID</t></is></c><c r="B1" t="inlineStr"><is><t>Current method</t></is></c><c r="C1" t="inlineStr"><is><t>What is protected or verified?</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>CU-001</t></is></c><c r="B2" t="inlineStr"><is><t>ML-DSA-65</t></is></c><c r="C2" t="inlineStr"><is><t>Firmware update</t></is></c></row></sheetData></worksheet>');
    const excel=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
    await page.locator('nav [data-route="crypto"]').click();
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'uses.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:excel});
    await page.locator('[data-apply-record-import]').waitFor();
    assert.match(await page.locator('#transfer-body').textContent(),/1 record/);
    await page.locator('[data-apply-record-import]').click();
    assert.equal(await page.locator('[data-edit="crypto"]').count(),2);
    assert.match(await page.locator('.record-list').last().textContent(),/CU-002/);
    await page.locator('[data-import-records="crypto"]').click();
    await page.locator('#record-import-file').setInputFiles({name:'secret.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{current:'ML-KEM-768',keyMaterial:'private fixture value'}]))});
    await page.getByText('This file appears to contain secret key material. Remove it before importing.').waitFor();
    assert.equal(await page.locator('[data-edit="crypto"]').count(),2);
  } finally { await browser.close(); }
});

test('required tests track teams, blockers, and linked control risk', async () => {
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  try {
    await page.goto(BASE);
    await page.locator('nav [data-route="tests"]').click();
    await page.locator('[data-select-test="T01"]').click();
    await page.locator('[data-test="T01"][data-field="requiredForProcurement"]').selectOption('Yes');
    await page.locator('[data-test="T01"][data-field="blocked"]').selectOption('Yes');
    await page.locator('[data-test="T01"][data-field="dependencies"]').selectOption('Yes');
    await page.locator('[data-test="T01"][data-field="ownerTeam"]').fill('Network team');
    await page.locator('[data-test="T01"][data-field="dependencyDetail"]').fill('Vendor staging endpoint');
    await page.reload();
    assert.equal(await page.locator('[data-test="T01"][data-field="ownerTeam"]').inputValue(),'Network team');
    await page.locator('nav [data-route="controls"]').click();
    await page.locator('[data-select-control="C05"]').click();
    assert.match(await page.locator('.record.control').textContent(),/T01: not run \(blocked\) \(buyer required\)/);
    assert.ok(await page.locator('.record.control a[href*="rfc"]').count()>0);
    await page.locator('nav [data-route="scorecard"]').click();
    assert.match(await page.locator('.score-grid').textContent(),/1 of 1 buyer-required tests/);
  } finally { await browser.close(); }
});
