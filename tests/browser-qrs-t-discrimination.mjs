/** Real production worker and visible metrics; no generator imports or fake replies. */
import {chromium,webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/',out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/qrs-t');
await mkdir(out,{recursive:true});const results=[];
for(const engine of [chromium,webkit,firefox]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390]){
  const tag=`qrs-t-${engine.name()}-${width}`,page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{window.__qrsObserved=e.data;});}};});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  try{
   await page.goto(url);await ready();
   const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(identity.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(identity.commit,process.env.ECG_EXPECT_COMMIT);
   await chooseCatalogPreset(page,'wpw');await ready();
   await page.locator('[data-action=export]').click();
   const waiting=page.waitForEvent('download');await page.locator('#dialog [data-action=json]').click();
   const file=resolve(out,tag+'-base-case.json');await(await waiting).saveAs(file);
   await page.locator('#dialog').evaluate(d=>d.close());
   const original=JSON.parse(await readFile(file));
   for(const hr of [73,120]){
    const c={...original,hr,pr:100.3,filter:'diagnostic',electrolyte:'lowvoltage',variability:0,seed:17};
    c.artifacts={...c.artifacts,baseline:.05,muscle:.05,mains:.05};
    const prior=await page.evaluate(()=>window.__qrsObserved?.id);
    await page.locator('#file-input').setInputFiles({name:`wpw-${hr}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
    await page.waitForFunction(id=>window.__qrsObserved?.id!==id&&!!window.__qrsObserved?.measurement,prior,{timeout:30_000});await ready();
    const measured=await page.evaluate(()=>{const m=window.__qrsObserved.measurement;return {hr:m.hr,status:m.evidence.hr.status,peaks:m.detectedPeaks};});
    assert.ok(Math.abs(measured.hr-hr)<1);assert.equal(measured.status,'usable');
    await page.waitForFunction(hr=>document.querySelector('#metrics .main-metric strong')?.firstChild?.textContent?.trim()===String(hr),hr,{timeout:30_000});
    assert.equal(await page.locator('#metrics .main-metric strong small').innerText(),'lpm');
    await page.locator('#ecg').screenshot({path:resolve(out,tag+`-${hr}-trace.png`)});
    await page.locator('#metrics .main-metric').click();
    await page.screenshot({path:resolve(out,tag+`-${hr}-measurements.png`)});
    await page.locator('#dialog').evaluate(d=>d.close());
    results.push({engine:engine.name(),width,hr,measured,identity});
   }
   await chooseCatalogPreset(page,'sinus');await ready();
   assert.deepEqual(errors,[]);
  }catch(e){await page.screenshot({path:resolve(out,tag+'-failure.png')}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(e.stack),errors},null,2));throw e;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'qrs-t-browser-results.json'),JSON.stringify({results,clinicalValidation:false,physicalDevice:false},null,2));console.log(JSON.stringify({flows:results.length}));
