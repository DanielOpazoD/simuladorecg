/** Wide-complex measurement honesty through the real import -> worker -> metrics -> dialog path.
 * The signal reader that used to feed analytical CSV fixtures (wide-qrs / opposed-cycle) no longer
 * exists in the interface, so the fixtures cannot reach the analyzer from the browser any more
 * (they remain in tests/support for the Node unit tests). What stays observable is the analyzer
 * on the generator's own wide complexes: the rate must never be guessed (a doubled count is
 * either absent or declared «Revisar»), a visible QRS width must be right, and the displayed
 * cards, the measurement dialog and the paper must agree with the worker's reply.
 */
import {chromium,webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {installWorkerTap,readTrace,settledTrace} from './support/worker-tap.mjs';
import {readMeasurements} from './support/measurement-dialog.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/wide-qrs');await mkdir(out,{recursive:true});
const results=[];
// exact: the analyzer is expected to measure it; otherwise it may only withhold or flag it.
const fixtures=[{name:'wide-rbbb',id:'rbbb',hr:100,qrs:200,exact:true},{name:'wide-lbbb',id:'lbbb',hr:100,qrs:240,exact:false}];
const engines=process.env.ECG_WIDE_QRS_ENGINES==='chromium'?[chromium]:[chromium,webkit,firefox];
for(const engine of engines){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390,320])for(const fixture of fixtures){
  const {hr,qrs}=fixture;
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000}}),tag=`${fixture.name}-${engine.name()}-${width}`,errors=[];
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  await installWorkerTap(page);
  try{
   await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   // Worker completion precedes the 90 ms ResizeObserver redraw. Capture only
   // a settled canvas; otherwise modal duration gets blamed for startup paint.
   const settle=()=>page.waitForFunction(()=>{
    const canvas=document.querySelector('#ecg'),image=canvas.toDataURL(),now=performance.now();
    const state=window.__wideQrsCanvasSettling;
    if(!state||state.image!==image){window.__wideQrsCanvasSettling={image,since:now};return false;}
    return now-state.since>=200;
   },null,{polling:50,timeout:5000});
   await page.evaluate(()=>document.fonts.ready);await settle();
   await chooseCatalogPreset(page,fixture.id);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const base=await readTrace(page);
   // A wide complex at an ordinary rate, noise-free, imported through the real file path.
   const trace=await settledTrace(page,()=>page.locator('#file-input').setInputFiles({name:`wide-${fixture.name}.json`,mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({...base.case,hr,qrs,qtc:400,filter:'diagnostic',variability:0,seed:53,artifacts:{...base.case.artifacts,baseline:0,muscle:0,mains:0}}))}));
   assert.equal(trace.case.hr,hr);assert.equal(trace.case.qrs,qrs);
   // Raw worker analysis (candidates) and what the page presents after the simulator's audit.
   const raw=trace.measurement,programmed=trace.events.beats.filter(b=>b.time>=.3&&b.time+b.qrs<9.7).length;
   assert.ok(programmed>=14,'The window holds the programmed wide complexes');
   const shown=await readMeasurements(page);
   // The audit only withdraws or flags candidates; it never invents a value.
   for(const key of ['hr','qrs'])assert.ok(shown[key].value===null||(raw[key]!==null&&shown[key].value===Math.round(raw[key])),key+' shown '+shown[key].value+' vs raw '+raw[key]);
   // The rate is never guessed: a doubled or halved count may be shown only if it is not called reproducible.
   if(shown.hr.value!==null&&Math.abs(shown.hr.value-hr)>2)assert.notEqual(shown.hr.status,'usable','A wrong rate cannot be certified: '+shown.hr.value);
   // A QRS width that is shown as reproducible must be the programmed one.
   if(shown.qrs.value!==null&&shown.qrs.status==='usable')assert.ok(Math.abs(shown.qrs.value-qrs)<=25,'Certified QRS '+shown.qrs.value+' vs programmed '+qrs);
   if(shown.hr.value===null)assert.equal(shown.hr.status,'unavailable');
   if(fixture.exact){
    assert.ok(Math.abs(shown.hr.value-hr)<=2,'No guessed rate halving or doubling: '+shown.hr.value);assert.equal(shown.hr.status,'usable');
    assert.ok(Math.abs(shown.qrs.value-qrs)<=25,'Measured QRS '+shown.qrs.value);
    assert.ok(Math.abs(raw.detectedPeaks.length-programmed)<=2,'One candidate per complex: '+raw.detectedPeaks.length+' vs '+programmed);
   }
   // The cards show what the model generated; the sample analyzer's estimate (and its quality) is in the dialog.
   const main=page.locator('.main-metric');
   assert.ok((await main.locator('strong').innerText()).startsWith(String(Math.round(trace.truth.hr))),'The card shows the programmed rate');
   assert.ok(Math.abs(trace.truth.hr-hr)<1e-6);assert.match(await main.locator('small').last().innerText(),/modelo/);
   await settle();const traceImage=await page.locator('#ecg').evaluate(c=>c.toDataURL());
   await main.click();const dialog=page.getByRole('dialog',{name:'Medidas, límites y consistencia'});await dialog.waitFor();
   // The dialog table keeps its two-dimensional meaning; horizontal scrolling is keyboard reachable.
   const table=dialog.getByRole('table');
   assert.equal(await table.getByRole('columnheader').count(),4);
   assert.equal(await table.getByRole('cell').count(),20);
   const wrapper=await dialog.locator('.measurement-table-wrap').first().evaluate(w=>({tab:w.tabIndex,role:w.getAttribute('role'),label:w.getAttribute('aria-label'),
    headers:[...w.querySelectorAll('thead th')].every(th=>th.getAttribute('scope')==='col')}));
   assert.deepEqual({tab:wrapper.tab,role:wrapper.role,headers:wrapper.headers},{tab:0,role:'region',headers:true});assert.match(wrapper.label,/desplazamiento horizontal/);
   const badge={usable:'Reproducible',review:'Revisar',unavailable:'No estimable'};
   const rows=table.getByRole('row');
   for(const [index,label,key,unit] of [[1,'FC ventricular','hr','lpm'],[3,'QRS','qrs','ms']]){
    const row=rows.nth(index),cells=row.getByRole('cell');
    assert.equal((await cells.first().innerText()).trim(),label);
    assert.equal((await cells.nth(1).innerText()).trim(),shown[key].value===null?'—':`${shown[key].value} ${unit}`);
    assert.match(await cells.nth(3).innerText(),new RegExp(badge[shown[key].status]),label+' keeps its quality');
   }
   await dialog.screenshot({path:resolve(out,tag+'-measurements.png')});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.waitForFunction(image=>document.querySelector('#ecg').toDataURL()===image,traceImage,{timeout:5000});
   assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),traceImage);
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,identity,fixture:fixture.name,programmedHr:hr,measuredHr:shown.hr.value,hrStatus:shown.hr.status,measuredQrs:shown.qrs.value,qrsStatus:shown.qrs.status,candidates:raw.detectedPeaks.length,programmed,samplesUnchanged:true});
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png')}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'wide-qrs-browser-results.json'),JSON.stringify({results,fixture:'Generator wide complexes (RBBB 200 ms, LBBB 240 ms) at 100/min; not patient ECGs',clinicalValidation:false,physicalDevice:false},null,2));
console.log(JSON.stringify({flows:results.length,clinicalValidation:false}));
