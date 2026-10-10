/** Pattern -> variant in the sheet, through the built app. No preset/model imports. */
import {chromium,webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const engines=process.env.ECG_GROUP_ENGINES==='all'?[chromium,webkit,firefox]:[chromium];
const groups=[['sinus',['sinus','brady','tachy','rsa']],['af',['af','af_fast','af_slow']],['flutter',['flutter','flutter3']],
 ['pvc',['pvc','bigeminy','trigeminy','couplet']],['idioventricular',['idioventricular','aivr']],['vt',['vt','torsades']],
 ['complete',['complete','complete_v']],['rbbb',['rbbb','irbbb']],['lafb',['lafb','lpfb']],
 ['bifascicular',['bifascicular','bifascicular_pr']],['inferior',['inferior','inferior_lcx']],
 ['wellens_a',['wellens_a','wellens_b']],['rv_acute',['rv_acute','rv_chronic']],['aai',['aai','vvi','ddd']],['longqt',['longqt','shortqt']]];
const results=[],failures=[];
for(const engine of engines){
 const browser=await engine.launch({headless:true});
 try {for(const width of engines.length===1?[1440,390,320]:[1440,390]) {
  const page=await browser.newPage({viewport:{width,height:width>800?1000:844},reducedMotion:'reduce'}),errors=[],warnings=[];
  const stem=`grouped-${engine.name()}-${width}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const focus=async id=>assert.equal(await page.locator(id).evaluate(e=>e===document.activeElement),true,id+' focus');
  const exported=async name=>{const wait=page.waitForEvent('download');await page.locator('#compare-json').click();const file=resolve(out,`${stem}-${name}.json`);await(await wait).saveAs(file);return JSON.parse(await readFile(file,'utf8'));};
  const choose=async id=>{await chooseCatalogPreset(page,id);await ready();};
  const tab=async id=>{await page.locator(`[data-variant="${id}"]`).click();await ready();assert.equal(await page.locator(`[data-variant="${id}"]`).getAttribute('aria-selected'),'true');};
  try{
   await page.addInitScript(()=>{const Native=window.Worker;window.__variantGenerations=0;window.Worker=class extends Native{postMessage(...args){window.__variantGenerations++;return super.postMessage(...args);}};});
   await page.goto(url);await ready();assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
   const build=await(await page.request.get(new URL('build-info.json',url).href)).json();
   if(process.env.ECG_EXPECT_COMMIT)assert.equal(build.commit,process.env.ECG_EXPECT_COMMIT);assert.equal(build.dirty,false);
   assert.equal(await page.locator('#case-list [data-diagnosis]').count(),46);
   assert.equal(await page.locator('#case-list [data-diagnosis]:disabled').count(),5);
   assert.equal(await page.locator('#diagnosis-navigation [role=tab]').count(),4);
   assert.equal(await page.locator('#diagnosis-navigation [tabindex="0"]').count(),1);
   assert.equal(await page.locator('#diagnosis-content').getAttribute('aria-labelledby'),'variant-tab-sinus');
   await page.locator('[data-action=compare]').click();await page.locator('#compare-pin').click();const original=await exported('original');
   await page.locator('#variant-tab-sinus').focus();const generation=await page.evaluate(()=>window.__variantGenerations);
   await page.keyboard.press('ArrowRight');await focus('#variant-tab-brady');
   assert.equal(await page.locator('#variant-tab-sinus').getAttribute('aria-selected'),'true');
   assert.equal(await page.evaluate(()=>window.__variantGenerations),generation,'Arrow navigation must not regenerate ECGs');
   await page.keyboard.press('Enter');await ready();await focus('#variant-tab-brady');
   assert.equal(await page.locator('#case-title').textContent(),'Ritmo sinusal');
   assert.equal(await page.locator('#case-variant-title').textContent(),'Bradicardia sinusal');
   const brady=await exported('brady');assert.equal(brady.B.case.presetId,'brady');assert.deepEqual(brady.A,original.A);
   await page.locator('#variant-tab-brady').focus();await page.keyboard.press('End');await focus('#variant-tab-rsa');
   await page.keyboard.press(' ');await ready();assert.equal(await page.locator('#variant-tab-rsa').getAttribute('aria-selected'),'true');
   await page.keyboard.press('Home');await focus('#variant-tab-sinus');await page.keyboard.press('Enter');await ready();
   assert.deepEqual((await exported('restored')).B,original.B,'Returning to normal restores the complete case, samples and measurements');
   // Every grouped member is reached via visible internal tabs, not test-only DOM proxies.
   let variants=0;
   for(const [parent,ids] of groups){
    await choose(parent);
    assert.deepEqual(await page.locator('#diagnosis-navigation [data-variant]').evaluateAll(es=>es.map(e=>e.dataset.variant)),ids);
    for(const id of ids){await tab(id);assert.equal(await page.locator('#diagnosis-navigation [aria-selected=true]').count(),1);variants++;}
   }
   assert.equal(variants,38);
   await choose('af');await tab('af_fast');
   assert.equal(await page.locator('#case-title').textContent(),'Fibrilación auricular');
   assert.match(await page.locator('#warnings').innerText(),/FA (representativa|aprendida)/);
   await page.locator('#ecg').screenshot({path:resolve(out,`af-gamma-${engine.name()}-${width}.png`)});
   const fast=await exported('af-fast');assert.equal(fast.B.case.presetId,'af_fast');assert.equal(fast.B.case.hr,145);assert.deepEqual(fast.A,original.A);
   if(width<=800)await page.locator('[data-action=catalog]').click();
   await page.locator('[data-action=clear-search]').click();
   assert.equal(await page.locator('[data-diagnosis=af]').getAttribute('data-preset'),'af_fast');
   await page.locator('[data-diagnosis=af]').click();await ready();
   assert.equal(await page.locator('#variant-tab-af_fast').getAttribute('aria-selected'),'true','Reopening the same pattern keeps its variant');
   if(width<=800)await page.locator('[data-action=catalog]').click();
   await page.locator('#case-search').fill('FA');
   assert.deepEqual(await page.locator('#case-list [data-diagnosis]').evaluateAll(es=>es.map(e=>e.dataset.diagnosis)),['af']);
   assert.equal(await page.locator('#catalog-count').textContent(),'1 patrón · 3 ejemplos');
   await page.locator('#case-search').fill('FA lenta');await page.locator('[data-preset=af_slow]').click();await ready();
   assert.equal(await page.locator('#variant-tab-af_slow').getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#diagnosis-navigation [role=tab]').count(),3,'Specific search does not remove siblings');
   const slow=await exported('af-slow');assert.equal(slow.B.case.hr,48);
   await choose('flutter');await tab('flutter3');const flutter=await exported('flutter3');assert.equal(flutter.B.case.flutterRatio,3);
   await choose('sinus');await page.locator('#case-title').scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`${stem}-sinus.png`)});
   await choose('af');await tab('af_fast');await page.locator('#case-title').scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`${stem}-af.png`)});
   const geometry=await page.locator('#diagnosis-navigation').evaluate(root=>({width:innerWidth,page:document.documentElement.scrollWidth,
    tabs:[...root.querySelectorAll('[role=tab]')].map(e=>{const b=e.getBoundingClientRect();return{label:e.textContent,left:b.left,right:b.right,height:b.height};})}));
   assert.ok(geometry.page<=width+1);assert.ok(geometry.tabs.every(t=>t.height>=44&&t.left>=0&&t.right<=width+1));
   if(width<=800)await page.locator('[data-action=catalog]').click();await page.locator('[data-action=clear-search]').click();
   await page.screenshot({path:resolve(out,`${stem}-catalog.png`)});
   await page.locator('#case-search').fill('Brugada');assert.equal(await page.locator('#case-list button:disabled').count(),1);
   await choose('sinus');
   await page.locator('[data-panel=base]').click();
   // The panel click rebuilds its controls. Drive the live native input, not
   // a programmatic event on an element handle that may have been detached.
   const rate=page.locator('#inspector [data-key=hr]');
   assert.equal(await rate.inputValue(),'72');
   const beforeEdit=await page.evaluate(()=>window.__variantGenerations);
   await rate.focus();
   for(let step=0;step<9;step++)await rate.press('ArrowRight');
   await page.waitForFunction(()=>document.querySelector('#inspector [data-key=hr]')?.value==='81');
   await ready();
   assert.ok(await page.evaluate(n=>window.__variantGenerations>n,beforeEdit),'Editing must reach the signal worker');
   assert.equal(await page.locator('#diagnosis-navigation').isVisible(),false,'Edited case must not retain an unverified diagnosis tab');
   assert.equal(await page.locator('#case-title').textContent(),'Exploración personalizada');
   assert.equal(await page.locator('#case-category').textContent(),'EXPLORACIÓN');
   assert.match(await page.locator('#exploration-context').textContent(),/Origen:.*Ritmo sinusal/);
   assert.match(await page.locator('.exploration-count').textContent(),/1 ajuste/);
   assert.match(await page.locator('#exploration-context').textContent(),/no diagnostica/i);
   const custom=await exported('custom');assert.equal(custom.B.case.presetId,'custom');
   assert.equal(custom.B.case.hr,81,'Export must reflect the actual native input');
   await page.locator('#case-title').scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`${stem}-native-edit.png`)});
   await page.locator('#exploration-context summary').click();
   await page.locator('[data-action=exploration-changes]').click();
   assert.deepEqual(await page.locator('#dialog-content tbody tr td').allTextContents(),
     ['Frecuencia base (lpm)','72Frecuencia base','81Frecuencia base'],
     'History must show the actual programmed values and the meaning in each state');
   await page.locator('[data-action=close-dialog]').click();
   await page.locator('[data-action=compare-origin]').click();
   const originComparison=await exported('origin-comparison');
   assert.equal(originComparison.A.case.presetId,'sinus');assert.equal(originComparison.A.case.hr,72);
   assert.equal(originComparison.B.case.presetId,'custom');assert.equal(originComparison.B.case.hr,81);
   await page.locator('[data-action=restore-origin]').click();await ready();
   assert.equal(await page.locator('#case-title').textContent(),'Ritmo sinusal');
   assert.equal(await page.locator('#exploration-context').isVisible(),false);
   const restoredOrigin=await exported('origin-restored');
   assert.equal(restoredOrigin.B.case.presetId,'sinus');assert.equal(restoredOrigin.B.case.hr,72);
   await choose('sinus');await page.locator('[data-action=quiz]').click();await ready();
   assert.equal(await page.locator('#diagnosis-navigation').isVisible(),false);assert.equal(await page.locator('#diagnosis-navigation [data-variant]').count(),0);
   assert.equal(await page.locator('#case-variant-title').textContent(),'');assert.equal(await page.locator('#case-title').textContent(),'Interpreta este ECG');
   assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
   results.push({engine:engine.name(),version:browser.version(),width,variants,sidebarEntries:45,activeExamples:61,manualActivation:true,search:true,customAndQuizIsolation:true,geometry,build,errors,warnings});
  }catch(error){failures.push({engine:engine.name(),width,error:String(error.stack),errors,warnings});await page.screenshot({path:resolve(out,`${stem}-failure.png`)}).catch(()=>{});}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'diagnosis-navigation-results.json'),JSON.stringify({url,results,failures,physicalDevice:false,clinicalValidation:false},null,2));
assert.deepEqual(failures,[]);assert.equal(results.length,engines.length===1?3:6);
console.log(JSON.stringify({diagnosisNavigationFlows:results.length,failures}));
