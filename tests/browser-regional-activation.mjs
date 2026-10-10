/** Production workflow: template -> regional model -> QRS delay -> origin restore -> import -> exact rollback.
 * Samples, events and the case come from the worker's own replies; measurements from the measurements dialog. */
import {chromium, firefox, webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {openControlPanel} from './support/adjust-panel.mjs';
import {installWorkerTap,settledTrace} from './support/worker-tap.mjs';
import {readMeasurements} from './support/measurement-dialog.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const engines=process.env.ECG_REGIONAL_ENGINES==='all'?{chromium,firefox,webkit}:{chromium};
const checks=[];
for(const [engine,launcher] of Object.entries(engines)){
 const browser=await launcher.launch({headless:true});
 try{for(const width of [1440,390]){for(const preset of ['rbbb','lbbb']){
  const model=preset==='lbbb'?'regional-lbbb-v1':'regional-rbbb-v1';
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  await installWorkerTap(page);
  // The case the worker was asked to render, its samples and events (the A/B export is gone).
  const imported=(c,name)=>settledTrace(page,()=>page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))}));
  try{
   await page.goto(url);await ready();assert.match(await page.title(),/ECG/);
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   assert.equal(new URL(page.url()).origin,new URL(url).origin);
   assert.equal(await page.locator('vite-error-overlay').count(),0);
   assert.ok(await page.locator('#ecg').evaluate(c=>c.width>0&&c.height>0));
   const original=await settledTrace(page,()=>chooseCatalogPreset(page,preset));
   assert.equal(original.case.presetId,preset);assert.ok(!original.case.activationModel||original.case.activationModel==='template');
   await openControlPanel(page,'conduction');
   const regional=await settledTrace(page,()=>page.locator('[data-key="activationModel"]').selectOption(model));
   await page.locator('#ecg').screenshot({path:resolve(out,`regional-trace-${preset}-${engine}-${width}.png`)});
   assert.equal(regional.case.activationModel,model);
   assert.notDeepEqual(regional.leads,original.leads);
   assert.deepEqual(regional.events,original.events);
   assert.match(await page.locator('#regional-activation-status').innerText(),/Regional activo/);
   assert.equal(await page.locator('#regional-activation-controls svg').count(),1);
   assert.match(await page.locator('#exploration-context').innerText(),/1 ajuste/);
   await page.locator('#exploration-context summary').click();
   await page.locator('#regional-activation-controls').screenshot({path:resolve(out,`regional-controls-${preset}-${engine}-${width}.png`)});
   await openControlPanel(page,'base');
   // The slider retires the shown measurements synchronously: nothing stale during the debounce.
   const delayed=await settledTrace(page,async()=>{
    const pending=await page.locator('[data-key="qrs"]').evaluate(el=>{
     el.value='190';el.dispatchEvent(new Event('input',{bubbles:true}));
     return {loading:!document.querySelector('#signal-loading').hidden,metrics:document.querySelectorAll('#metrics .metric').length};
    });
    assert.deepEqual(pending,{loading:true,metrics:0},'No stale measurements during debounce');
   });
   assert.equal(delayed.case.qrs,190);
   assert.equal(delayed.case.activationModel,model);
   if(preset==='lbbb'){
    const {qrs,qt}=await readMeasurements(page);
    // Since F2 the default acquisition carries resting noise, under which the frozen
    // analyzer often cannot delimit a 190 ms LBBB (it measures 194 ms on the ideal
    // trace). A value it shows must be right; otherwise it must be withheld openly.
    if(qrs.value!==null)assert.ok(Math.abs(qrs.value-190)<=20,'A visible 190 ms LBBB QRS must be measured correctly');
    else assert.equal(qrs.status,'unavailable','A missing QRS must be declared unavailable, never fabricated');
    if(qt.value===null)assert.equal(qt.status,'unavailable','A missing QT must be declared unavailable');
   }
   assert.notDeepEqual(delayed.leads,regional.leads);
   await openControlPanel(page,'conduction');
   assert.match(await page.locator('#regional-activation-controls svg').textContent(),/190/);
   // Restore through the real origin action before testing file import boundaries.
   const originRestored=await settledTrace(page,()=>page.locator('[data-action="restore-origin"]').click());
   assert.deepEqual(originRestored.leads,original.leads,'Restoring the origin restores the original trace exactly');
   assert.equal(await page.locator('#exploration-context').isVisible(),false);
   // Import the actual accepted case. This retains its explicit experimental identity.
   const importedDelayed=await imported(delayed.case,'regional-case.json');assert.equal(importedDelayed.case.activationModel,model);
   assert.deepEqual(importedDelayed.leads,delayed.leads);
   // Requested incompatible mode stays visible but never changes the waveform.
   const incompatible={...delayed.case,conduction:preset==='lbbb'?'rbbb':'lbbb'};
   const inactive=await imported(incompatible,'incompatible-regional.json');
   await openControlPanel(page,'conduction');
   assert.match(await page.locator('#regional-activation-status').innerText(),/Regional no aplicado/);
   assert.equal(await page.locator('[data-key="activationModel"]').inputValue(),model);
   assert.equal(await page.locator('#regional-activation-controls svg').count(),0);
   const explicitTemplate=await imported({...incompatible,activationModel:'template'},'incompatible-template.json');
   assert.deepEqual(inactive.leads,explicitTemplate.leads,'An incompatible requested mode must use the unchanged template');
   // Roll back by importing the saved A case, not by mutating controls behind the application.
   const restored=await imported(original.case,'template-case.json');assert.deepEqual(restored.leads,original.leads);
   // BRD and BRI conducted beats are learned (F3); the status must say so.
   await openControlPanel(page,'conduction');
   assert.match(await page.locator('#regional-activation-status').innerText(),/Latido aprendido \(PTB-XL\)/);
   assert.deepEqual(errors,[]);checks.push({engine,width,preset,identity,actualWorker:true,incompatibleFallback:true,caseImport:true,exactRollback:true});
  }catch(error){await page.screenshot({path:resolve(out,`regional-failure-${preset}-${engine}-${width}.png`),fullPage:true}).catch(()=>{});
   await writeFile(resolve(out,`regional-failure-${preset}-${engine}-${width}.json`),JSON.stringify({error:String(error.stack),errors},null,2));throw error;
  }finally{await page.close();}
 }}}finally{await browser.close();}
}
await writeFile(resolve(out,'regional-browser-results.json'),JSON.stringify({url,checks,clinicalValidation:false,physicalDeviceTest:false},null,2));
console.log(JSON.stringify({regionalBrowserFlows:checks.length,checks}));
