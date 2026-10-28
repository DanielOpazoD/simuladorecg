/** Native UI journey with raw worker and rendered-pixel identity controls. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {installWorkerTap,workerReplies} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/reading-return');await mkdir(out,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
const browser=await chromium.launch(),results=[],errors=[];let failure,active;
const position=page=>page.evaluate(()=>({x:scrollX,y:scrollY,left:document.querySelector('#canvas-wrap').scrollLeft,top:document.querySelector('#canvas-wrap').scrollTop,zoom:document.querySelector('[data-action=zoom-reset]').textContent}));
async function exportPng(page,name){
 await page.locator('[data-action=export]').click();const download=page.waitForEvent('download');await page.locator('[data-action=png]').click();
 const path=resolve(out,name);await(await download).saveAs(path);await page.locator('#dialog [data-action=close-dialog]').click();return hash(await readFile(path));
}
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
  const page=active=await browser.newPage({viewport,reducedMotion:'reduce',acceptDownloads:true});await installWorkerTap(page);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme','light');});
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  for(let i=0;i<3;i++)await page.locator('[data-action=zoom-in]').click();
  for(const id of ['sinus','lbbb','anterior']){
   if(id!=='sinus'){await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});}
   // Keep the original record by reference: the comparison publishes a different worker reply.
   const trace=hash(await page.evaluate(()=>{window.__readingRecord=window.__ecgTap.last;return JSON.stringify(window.__readingRecord);})),replies=await workerReplies(page),plain=await page.locator('#ecg').evaluate(e=>e.toDataURL());
   const initialExport=id==='sinus'&&viewport.width===1440?await exportPng(page,'before.png'):null;
   assert.equal(await page.locator('[data-action=caliper]').getAttribute('aria-pressed'),'false');
   assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),null,'A new case must retire the previous manual value');
   assert.equal(await page.locator('.reading-focus-box').count(),0);
   assert.equal(await page.locator('[data-action=zoom-reset]').innerText(),'175 %','Zoom is a reading preference');
   if(await page.locator('[data-action=automatic]').getAttribute('aria-pressed')!=='true')await page.locator('[data-action=automatic]').click();
   const automatic=await page.locator('#automatic-overlay').innerHTML();
   // Move to a lower lead: closing the lens must preserve both scrollports and focus.
   const opener=page.locator('[data-reading-segment="11"]');await opener.scrollIntoViewIfNeeded();
   const beforeLens=await position(page);await opener.click();await page.keyboard.press('Escape');
   assert.deepEqual(await position(page),beforeLens);assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
   assert.equal(await page.locator('#automatic-overlay').innerHTML(),automatic);
   await page.locator('[data-action=caliper]').click();
   // First activation in a new case must not recover the previous case's 322 ms.
   assert.notEqual(await page.locator('#measurement-values').getAttribute('data-ms'),'322');
   await page.locator('#caliper-endpoint').selectOption('1');await page.locator('#caliper-time').fill('137');await page.locator('#caliper-time').press('Tab');
   await page.locator('#caliper-endpoint').selectOption('2');await page.locator('#caliper-time').fill('459');await page.locator('#caliper-time').press('Tab');
   assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),'322');
   await page.locator('[data-action=caliper]').scrollIntoViewIfNeeded();
   const measured=await page.locator('#ecg').evaluate(e=>e.toDataURL()),beforeHide=await position(page);
   await page.locator('[data-action=caliper]').click();assert.equal(await page.locator('[data-action=caliper]').getAttribute('aria-label'),'Mostrar medición');
   assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),null);
   assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),plain,'Hidden calibres must leave the original pixels intact');
   await page.locator('[data-action=caliper]').click();assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),'322');
   assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),measured);assert.deepEqual(await position(page),beforeHide);
   await page.locator('[data-action=compare]').scrollIntoViewIfNeeded();const beforeCompare=await position(page);
   await page.locator('[data-action=compare]').click();await page.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();await page.keyboard.press('Escape');
   assert.deepEqual(await position(page),beforeCompare);assert.equal(await page.locator('[data-action=compare]').evaluate(e=>e===document.activeElement),true);
   assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),'322');assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),measured);
   await page.locator('[data-action=caliper]').click();
   // Start at the bottom of the zoomed paper; the first highlighted area is above it.
   await page.locator('#canvas-wrap').evaluate(e=>e.scrollTop=e.scrollHeight);
   await page.locator('[data-finding]').first().click();
   const visible=await page.evaluate(()=>{
    const box=document.querySelector('.reading-focus-box').getBoundingClientRect(),wrap=document.querySelector('#canvas-wrap').getBoundingClientRect(),note=document.querySelector('#finding-focus').getBoundingClientRect(),tools=document.querySelector('.trace-toolbar').getBoundingClientRect();
    const cx=(box.left+box.right)/2,cy=(box.top+box.bottom)/2;
    return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},centerVisible:cx>=Math.max(0,wrap.left)&&cx<=Math.min(innerWidth,wrap.right)&&cy>=Math.max(wrap.top,note.bottom,tools.bottom)&&cy<=Math.min(innerHeight,wrap.bottom),noteVisible:note.top>=tools.bottom-1&&note.bottom<=innerHeight};
   });
   assert(visible.centerVisible&&visible.noteVisible,JSON.stringify({viewport,id,visible}));
   await page.screenshot({path:resolve(out,`${viewport.width}-${id}.png`)});
   await page.getByRole('button',{name:'Quitar explicación',exact:true}).click();
   assert.equal(await page.locator('.reading-focus-box').count(),0);assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),plain);
   if(initialExport)assert.equal(await exportPng(page,'after.png'),initialExport,'Reading state must not alter PNG export');
   // Clear is deliberately destructive; hiding is reversible.
   await page.locator('[data-action=caliper]').click();await page.locator('[data-action=clear-caliper]').click();
   assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),null);
   await page.locator('[data-action=caliper]').click();await page.locator('[data-action=caliper]').click();assert.notEqual(await page.locator('#measurement-values').getAttribute('data-ms'),'322');
   // Seed a distinct measurement again so the next case tests real invalidation.
   await page.locator('#caliper-endpoint').selectOption('1');await page.locator('#caliper-time').fill('137');await page.locator('#caliper-time').press('Tab');
   await page.locator('#caliper-endpoint').selectOption('2');await page.locator('#caliper-time').fill('459');await page.locator('#caliper-time').press('Tab');
   assert.equal(hash(await page.evaluate(()=>JSON.stringify(window.__readingRecord))),trace);
   assert.equal(await workerReplies(page),replies+1,'Only the independent comparison may generate another record');
   results.push({viewport,id,visible,mainRecordUnchanged:true,initialReplies:replies});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(error){failure=String(error.stack??error);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure}));if(failure)process.exitCode=1;
