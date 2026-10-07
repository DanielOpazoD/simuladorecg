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
 try{for(const width of [1440,390])for(const fixture of fixtures){
  const {samples,csv,hr,candidates}=fixture;
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),tag=`${fixture.name}-${engine.name()}-${width}`,errors=[];
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  try{
   await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   const original=await page.locator('#ecg').evaluate(c=>c.toDataURL());
   await page.locator('[data-action=external]').click();const dialog=page.locator('#external-lab');await dialog.waitFor({state:'visible'});
   await page.locator('#external-files').setInputFiles({name:`analytical-${fixture.name}.csv`,mimeType:'text/csv',buffer:Buffer.from(csv)});
   await page.locator('[data-external=load]').click();await page.locator('#external-metrics').waitFor({state:'visible'});
   const row=page.locator('#external-metrics tbody tr').first();
   assert.equal(await row.locator('td').nth(1).innerText(),hr.toFixed(1)+' lpm');
   assert.equal(await row.locator('td').nth(2).innerText(),'Revisar');
   if(fixture.name==='opposed-cycle')assert.match(await row.locator('td').nth(3).innerText(),/dirección opuesta/);
   await row.scrollIntoViewIfNeeded();await dialog.screenshot({path:resolve(out,tag+'-measurements.png')});
   const pending=page.waitForEvent('download');await page.locator('[data-external=json]').click();
   const file=resolve(out,tag+'-report.json');await(await pending).saveAs(file);
   const report=JSON.parse(await readFile(file));assert.equal(report.kind,'ecg-external-analysis');
   assert.equal(report.modelAuditUsed,false);assert.equal(report.clinicalValidation,false);
   assert.equal(report.measurement.evidence.hr.status,'review');if(fixture.name==='wide-qrs'){assert.deepEqual(report.measurement.beats,[]);assert.equal(report.measurement.qrs,null);assert.equal(report.measurement.qt,null);}
   assert.ok(Math.abs(report.measurement.hr-hr)<1e-8,'No guessed rate halving');
   assert.equal(report.measurement.detectedPeaks.length,candidates);
   for(const [lead,values] of Object.entries(samples.leads))assert.deepEqual(report.leads[lead],Array.from(values));
   await page.locator('[data-external=close]').click();await dialog.waitFor({state:'hidden'});
   assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),original);
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,identity,fixture:fixture.name,hr:report.measurement.hr,candidates,samplesUnchanged:true,modelAuditUsed:false});
  }catch(error){await page.screenshot({path:resolve(out,tag+'-failure.png')}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));throw error;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'wide-qrs-browser-results.json'),JSON.stringify({results,fixture:'Analytical wide and opposed deflections with acquisition noise; not patient ECGs',clinicalValidation:false,physicalDevice:false},null,2));
console.log(JSON.stringify({flows:results.length,clinicalValidation:false}));
