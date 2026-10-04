/** Production workflow: template A -> regional B -> QRS delay -> import -> exact rollback. */
import {chromium, firefox, webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const engines=process.env.ECG_REGIONAL_ENGINES==='all'?{chromium,firefox,webkit}:{chromium};
const checks=[];
for(const [engine,launcher] of Object.entries(engines)){
 const browser=await launcher.launch({headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const exported=async name=>{
   await page.locator('#compare-json').waitFor({state:'visible'});
   const download=page.waitForEvent('download');await page.locator('#compare-json').click();
   const file=resolve(out,`regional-${engine}-${width}-${name}.json`);await(await download).saveAs(file);
   return JSON.parse(await readFile(file,'utf8'));
  };
  try{
   await page.goto(url);await ready();assert.match(await page.title(),/ECG/);
   assert.equal(new URL(page.url()).origin,new URL(url).origin);
   assert.equal(await page.locator('vite-error-overlay').count(),0);
   assert.ok(await page.locator('#ecg').evaluate(c=>c.width>0&&c.height>0));
   await chooseCatalogPreset(page,'rbbb');await ready();
   await page.locator('[data-action="compare"]').click();await page.locator('#compare-pin').click();
   const original=await exported('template');assert.deepEqual(original.A.leads,original.B.leads);
   await page.locator('[data-panel="conduction"]').click();
   await page.locator('[data-key="activationModel"]').selectOption('regional-rbbb-v1');
   await ready();const regional=await exported('regional');
   assert.equal(regional.B.case.activationModel,'regional-rbbb-v1');
   assert.deepEqual(regional.A.leads,original.A.leads);assert.notDeepEqual(regional.B.leads,original.B.leads);
   assert.deepEqual(regional.B.events,original.B.events);
   assert.ok(regional.changedSettings.some(r=>r.key==='activationModel'));
   assert.match(await page.locator('#regional-activation-status').innerText(),/Regional activo/);
   assert.equal(await page.locator('#regional-activation-controls svg').count(),1);
   assert.match(await page.locator('#exploration-context').innerText(),/1 ajuste/);
   await page.locator('[data-action="compare-origin"]').click();
   const origin=await exported('origin');
   assert.deepEqual(origin.A.leads,original.A.leads,'Regional synthesis must not overwrite the original trace');
   assert.deepEqual(origin.B.leads,regional.B.leads);
   await page.locator('#regional-activation-controls').screenshot({path:resolve(out,`regional-controls-${engine}-${width}.png`)});
   await page.locator('[data-panel="base"]').click();
   const pending=await page.locator('[data-key="qrs"]').evaluate(el=>{
    el.value='190';el.dispatchEvent(new Event('input',{bubbles:true}));
    return !!document.querySelector('#compare-json');
   });assert.equal(pending,false,'No stale exports during debounce');
   await ready();const delayed=await exported('delayed');assert.equal(delayed.B.case.qrs,190);
   assert.equal(delayed.B.case.activationModel,'regional-rbbb-v1');
   assert.deepEqual(delayed.A.leads,original.A.leads);assert.notDeepEqual(delayed.B.leads,regional.B.leads);
   await page.locator('[data-panel="conduction"]').click();
   assert.match(await page.locator('#regional-activation-controls svg').textContent(),/190/);
   await page.locator('#compare-alignment').selectOption('beat');
   await page.locator('#comparison-lab').screenshot({path:resolve(out,`regional-comparison-${engine}-${width}.png`)});
   // Restore through the real origin action before testing file import boundaries.
   await page.locator('[data-action="restore-origin"]').click();await ready();
   const originRestored=await exported('origin-restored');
   assert.deepEqual(originRestored.B.leads,original.B.leads);
   assert.equal(await page.locator('#exploration-context').isVisible(),false);
   // Import the actual accepted B case. This retains its explicit experimental identity.
   await page.locator('#file-input').setInputFiles({name:'regional-case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(delayed.B.case))});
   await ready();const imported=await exported('imported');assert.equal(imported.B.case.activationModel,'regional-rbbb-v1');
   assert.deepEqual(imported.B.leads,delayed.B.leads);
   // Roll back by importing the saved A case, not by mutating controls behind the application.
   await page.locator('#file-input').setInputFiles({name:'template-case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original.B.case))});
   await ready();const restored=await exported('restored');assert.deepEqual(restored.B.leads,original.B.leads);
   assert.match(await page.locator('#regional-activation-status').innerText(),/Plantilla histórica/);
   assert.deepEqual(errors,[]);checks.push({engine,width,actualWorker:true,exportImport:true,exactRollback:true});
  }catch(error){await page.screenshot({path:resolve(out,`regional-failure-${engine}-${width}.png`),fullPage:true}).catch(()=>{});
   await writeFile(resolve(out,`regional-failure-${engine}-${width}.json`),JSON.stringify({error:String(error.stack),errors},null,2));throw error;
  }finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'regional-browser-results.json'),JSON.stringify({url,checks,clinicalValidation:false,physicalDeviceTest:false},null,2));
console.log(JSON.stringify({regionalBrowserFlows:checks.length,checks}));
