/** Hold optional modules at the network boundary to exercise real competing actions. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,workerReplies} from './support/worker-tap.mjs';

const out=resolve(process.argv[2]??'../ECG-QA/dialog-intent');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure,activePage;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  for(const workspace of ['compare','teaching'])for(const intent of ['unchanged','measurements','closed','reselected']){
   const page=await browser.newPage({viewport,reducedMotion:'reduce'});activePage=page;await installWorkerTap(page);
   page.on('pageerror',e=>errors.push(e.message));
   let release,intercepted;
   const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{intercepted=resolve;});
   await page.route(`**/${workspace==='compare'?'case-comparison':'teaching-workspace'}-*.js`,async route=>{
    intercepted(route.request().url());await gate;await route.continue();
   });
   await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');
   await page.locator('#signal-loading').waitFor({state:'hidden'});
   const paper=await page.locator('#ecg').evaluate(e=>e.toDataURL()),replies=await workerReplies(page);
   const open=async()=>{
    if(workspace==='teaching'&&!await page.locator('.paper-menu').evaluate(e=>e.open))await page.locator('.paper-menu > summary').click();
    if(workspace==='teaching'&&!await page.locator('.view-aids').evaluate(e=>e.open))await page.locator('.view-aids > summary').click();
    await page.locator(`[data-action=${workspace}]`).click();
   };
   await open();const moduleUrl=await requested;
   if(workspace==='teaching')await page.locator('.paper-menu > summary').click();
   if(intent!=='unchanged'){
    await page.locator('[data-action=measurements]').first().click();
    assert.equal(await page.locator('#dialog h2').innerText(),'Medidas');
    if(intent==='closed'||intent==='reselected')await page.keyboard.press('Escape');
    if(intent==='reselected')await open();
   }
   const focusBefore=await page.evaluate(()=>document.activeElement.outerHTML);
   release();
   // Await actual module evaluation, then the browser's next paint; no arbitrary network sleep.
   await page.evaluate(async url=>{await import(url);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},moduleUrl);
   if(intent==='unchanged'||intent==='reselected'){
    assert.match(await page.locator('#dialog h2').innerText(),workspace==='compare'?/Comparar ECG/:/Aula ECG/);
    assert.equal(await page.locator('#dialog').evaluate(d=>d.open&&d.contains(document.activeElement)),true);
   }else{
    assert.equal(await page.locator('#dialog').evaluate(d=>d.open),intent==='measurements','A closed dialog must not reopen when an old request completes');
    assert.equal(await page.locator('#dialog h2').innerText(),'Medidas','The latest window must not be replaced by a late import');
    assert.equal(await page.evaluate(()=>document.activeElement.outerHTML),focusBefore,'Late imports must not steal focus');
    assert.equal(await workerReplies(page),replies,'Discarded openings must not generate another ECG');
   }
   assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),paper);
   await page.screenshot({path:resolve(out,`${viewport.width}-${workspace}-${intent}.png`)});
   if(await page.locator('#dialog').evaluate(d=>d.open))await page.keyboard.press('Escape');
   // A discarded request must not prevent the next deliberate opening.
   await open();
   await page.locator(workspace==='compare'?'#comparison-reference-sheet[aria-busy=false]':'#teaching-root').waitFor();
   assert.equal(await page.locator('#dialog').evaluate(d=>d.open&&d.contains(document.activeElement)),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),paper);
   results.push({viewport,workspace,intent});await page.close();
  }
 }
 assert.deepEqual(errors,[]);
}catch(error){failure=String(error.stack??error);if(activePage&&!activePage.isClosed())await activePage.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure}));if(failure)process.exitCode=1;
