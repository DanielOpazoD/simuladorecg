/** Real external CSV path with an explicitly analytical, non-patient fixture. */
import {chromium,webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {wideDeflectionFixture,wideDeflectionCsv} from './support/wide-qrs-browser-fixture.mjs';
import {opposedCycleFixture,opposedCycleCsv} from './support/opposed-cycle-browser-fixture.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/wide-qrs');await mkdir(out,{recursive:true});
const results=[];
const fixtures=[{name:'wide-qrs',samples:wideDeflectionFixture(),csv:wideDeflectionCsv(),hr:100,candidates:16},
 {name:'opposed-cycle',samples:opposedCycleFixture(),csv:opposedCycleCsv(),hr:200,candidates:31}];
for(const engine of [chromium,webkit,firefox]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390,320])for(const fixture of fixtures){
  const {samples,csv,hr,candidates}=fixture;
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000}}),tag=`${fixture.name}-${engine.name()}-${width}`,errors=[];
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  try{
   await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   // Worker completion precedes the 90 ms ResizeObserver redraw. Capture only
   // a settled canvas; otherwise modal duration gets blamed for startup paint.
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>{
    const canvas=document.querySelector('#ecg'),image=canvas.toDataURL(),now=performance.now();
    const state=window.__wideQrsCanvasSettling;
    if(!state||state.image!==image){window.__wideQrsCanvasSettling={image,since:now};return false;}
    return now-state.since>=200;
   },null,{polling:50,timeout:5000});
   const original=await page.locator('#ecg').evaluate(c=>c.toDataURL());
   await page.locator('[data-action=external]').click();const dialog=page.locator('#external-lab');await dialog.waitFor({state:'visible'});
   await page.locator('#external-files').setInputFiles({name:`analytical-${fixture.name}.csv`,mimeType:'text/csv',buffer:Buffer.from(csv)});
   await page.locator('[data-external=load]').click();await page.locator('#external-metrics').waitFor({state:'visible'});
   const row=page.locator('#external-metrics tbody tr').first();
   assert.equal(await row.locator('td').nth(1).innerText(),hr.toFixed(1)+' lpm');
   assert.equal(await row.locator('td').nth(2).innerText(),fixture.name==='wide-qrs'?'Consistente*':'Revisar');
   if(fixture.name==='opposed-cycle')assert.match(await row.locator('td').nth(3).innerText(),/dirección opuesta/);
   if(width<=390){
    const readable=await page.locator('#external-metrics').evaluate(table=>{
     const box=table.getBoundingClientRect(),wrapper=table.parentElement;
     return {fits:table.scrollWidth<=wrapper.clientWidth+1,
       cellsFit:[...table.querySelectorAll('tbody td')].every(cell=>{const r=cell.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&cell.scrollWidth<=cell.clientWidth+1;}),
       headers:[...table.querySelectorAll('thead th')].every(th=>th.getAttribute('scope')==='col'),
       explicitSemantics:table.getAttribute('role')==='table'&&[...table.querySelectorAll('tbody tr')].every(row=>row.getAttribute('role')==='row')&&[...table.querySelectorAll('td')].every(cell=>cell.getAttribute('role')==='cell')};
    });
    assert.deepEqual(readable,{fits:true,cellsFit:true,headers:true,explicitSemantics:true});
   }
   const accessibleTable=page.getByRole('table',{name:'Estimaciones automáticas del ECG'});
   assert.equal(await accessibleTable.getByRole('columnheader').count(),4);
   assert.equal(await accessibleTable.getByRole('cell').count(),20);
   await row.scrollIntoViewIfNeeded();await dialog.screenshot({path:resolve(out,tag+'-measurements.png')});
   const pending=page.waitForEvent('download');await page.locator('[data-external=json]').click();
   const file=resolve(out,tag+'-report.json');await(await pending).saveAs(file);
   const report=JSON.parse(await readFile(file));assert.equal(report.kind,'ecg-external-analysis');
   assert.equal(report.modelAuditUsed,false);assert.equal(report.clinicalValidation,false);
   assert.equal(report.measurement.evidence.hr.status,fixture.name==='wide-qrs'?'usable':'review');
   if(fixture.name==='wide-qrs'){
    assert.equal(report.measurement.beats.length,14);
    assert.ok(Math.abs(report.measurement.qrs-240)<=8);
    for(const b of report.measurement.beats){assert.ok(Math.abs(b.qrs-240)<=8);assert.ok(Math.abs(b.axis-Math.atan2(1.6/Math.sqrt(3),1)*180/Math.PI)<.1);}
    assert.equal(report.measurement.pr,null);assert.equal(report.measurement.qt,null);
   }
   assert.ok(Math.abs(report.measurement.hr-hr)<1e-8,'No guessed rate halving');
   assert.equal(report.measurement.detectedPeaks.length,candidates);
   for(const [lead,values] of Object.entries(samples.leads))assert.deepEqual(report.leads[lead],Array.from(values));
   await page.locator('[data-external=close]').click();await dialog.waitFor({state:'hidden'});
   await page.waitForFunction(image=>document.querySelector('#ecg').toDataURL()===image,original,{timeout:5000});
   assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),original);
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,identity,fixture:fixture.name,hr:report.measurement.hr,candidates,samplesUnchanged:true,modelAuditUsed:false});
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png')}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'wide-qrs-browser-results.json'),JSON.stringify({results,fixture:'Analytical wide and opposed deflections with acquisition noise; not patient ECGs',clinicalValidation:false,physicalDevice:false},null,2));
console.log(JSON.stringify({flows:results.length,clinicalValidation:false}));
