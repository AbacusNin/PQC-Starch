import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';

const output = new URL('../.tmp/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
await fs.mkdir(output,{recursive:true});
const server=await startServer();
const browser=await chromium.launch({headless:true});
try {
  const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await desktop.goto(server.url);
  await desktop.screenshot({path:`${output}/overview-desktop.png`,fullPage:true});
  await desktop.locator('[data-route="survey"]').click();
  await desktop.locator('[data-question="Q04"]').click();
  await desktop.screenshot({path:`${output}/survey-desktop.png`,fullPage:true});
  await desktop.locator('abbr.term').first().hover();
  await desktop.screenshot({path:`${output}/tooltip-desktop.png`});
  await desktop.locator('[data-route="sources"]').click();
  await desktop.screenshot({path:`${output}/resources-desktop.png`});
  for(const route of ['process','licensing','scorecard','attestations']) {
    await desktop.locator(`nav [data-route="${route}"]`).click();
    await desktop.screenshot({path:`${output}/${route}-desktop.png`});
  }
  await desktop.locator('[data-route="evidence"]').click();
  await desktop.locator('[data-add="evidence"]').click();
  await desktop.locator('#record-dialog .field-term').first().hover();
  await desktop.screenshot({path:`${output}/dialog-help-desktop.png`});
  await desktop.locator('#dialog-close').click();
  await desktop.evaluate(()=>{window.print=()=>{};});
  await desktop.locator('#print-button').click();
  await desktop.emulateMedia({media:'print'});
  await desktop.screenshot({path:`${output}/print-record.png`,fullPage:true});
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await mobile.goto(server.url);
  await mobile.screenshot({path:`${output}/overview-mobile.png`,fullPage:true});
  await mobile.locator('#menu-button').click();
  await mobile.waitForTimeout(220);
  await mobile.screenshot({path:`${output}/mobile-menu.png`});
} finally { await browser.close(); await server.close(); }
