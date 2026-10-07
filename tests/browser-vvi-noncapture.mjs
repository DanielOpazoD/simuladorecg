/** Observe real worker packets without modifying them; interact through native UI. */
import {chromium,webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/',out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/vvi-noncapture');
await mkdir(out,{recursive:true});const results=[];
for(const engine of [chromium,webkit,firefox]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[],warnings=[],tag=`vvi-loss-${engine.name()}-${width}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=class extends Native{
   constructor(...args){super(...args);this.addEventListener('message',e=>{window.__lastObservedWorkerPacket=e.data;});}
  };});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const set=async(key,value)=>page.locator(`[data-key="${key}"]`).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const observed=()=>page.evaluate(async()=>{
   const p=window.__lastObservedWorkerPacket;if(!p?.signal)return {error:p?.error};
   const hashes={};for(const [lead,values] of Object.entries(p.signal.leads)){
    const digest=await crypto.subtle.digest('SHA-256',values.buffer.slice(values.byteOffset,values.byteOffset+values.byteLength));
    hashes[lead]=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   }
   return {beats:p.signal.events.beats.length,spikes:p.signal.events.spikes.length,status:p.measurement.evidence.hr.status,hashes};
  });
  try{
   await page.goto(url);await ready();
   const build=await(await page.request.get(new URL('build-info.json',url).href)).json();
   assert.equal(build.dirty,false);if(process.env.ECG_EXPECT_COMMIT)assert.equal(build.commit,process.env.ECG_EXPECT_COMMIT);
   await chooseCatalogPreset(page,'vvi');await ready();await page.locator('[data-panel=conduction]').click();
   await page.locator('[data-key=pacingBehavior]').selectOption('demand');await ready();
   const captured=await observed();assert.ok(captured.beats>5);assert.equal(captured.status,'usable');
   const rate=await page.locator('[data-key=hr]').inputValue();
   await page.locator('[data-key=pacingBehavior]').selectOption('demand-no-capture');await ready();
   const loss=await observed();assert.equal(loss.beats,0);assert.ok(loss.spikes>=3);assert.equal(loss.status,'unavailable');
   assert.equal(await page.locator('[data-key=qrs]').isDisabled(),true);assert.equal(await page.locator('[data-key=hr]').isDisabled(),false);
   assert.match(await page.locator('#warnings').innerText(),/sin activación ventricular/);
   assert.doesNotMatch(await page.locator('#warnings').innerText(),/relación ST\/QRS/);
   await page.locator('#ecg').screenshot({path:resolve(out,tag+'-trace.png')});
   await page.locator('[data-mode=monitor]').click();assert.equal(await page.locator('#monitor-rate').innerText(),'—');
   // Hold a real pointer gesture across an actual ResizeObserver redraw.
   // An unchanged pause label must not replace the child that received mousedown.
   const pause=page.getByRole('button',{name:'Congelar',exact:true});
   await pause.scrollIntoViewIfNeeded();
   const textNode=await pause.locator('span').elementHandle();assert.ok(textNode);
   const box=await textNode.boundingBox();assert.ok(box);
   const beforeWidth=await page.locator('#ecg').evaluate(c=>c.width);
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.setViewportSize({width:width+4,height:width===390?844:1000});
   await page.waitForFunction(w=>document.querySelector('#ecg').width!==w,beforeWidth);
   assert.equal(await textNode.evaluate(el=>el.isConnected),true,'Redraw replaced the active pointer target');
   await page.mouse.up();
   assert.match(await page.locator('#monitor-state').innerText(),/CONGELADO/);
   await page.getByRole('button',{name:'Reanudar',exact:true}).click();
   assert.match(await page.locator('#monitor-state').innerText(),/REPRODUCCIÓN/);
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.getByRole('button',{name:'Congelar',exact:true}).click();
   assert.match(await page.locator('#monitor-state').innerText(),/CONGELADO/);
   assert.equal(await page.locator('#monitor-rate').innerText(),'—');
   await page.locator('[data-mode=paper]').click();
   await page.locator('[data-action=export]').click();
   const download=async(action,suffix)=>{const waiting=page.waitForEvent('download');await page.locator(`#dialog [data-action=${action}]`).click();const file=resolve(out,tag+suffix);await(await waiting).saveAs(file);return readFile(file);};
   const exported=JSON.parse((await download('json','-case.json')).toString());
   assert.equal(exported.pacingBehavior,'demand-no-capture');assert.equal(exported.intrinsicRate,0);
   const png=await download('png','-print.png');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   await page.locator('#dialog [data-action=close-dialog]').click();
   assert.deepEqual(await observed(),loss,'Freezing and exporting must preserve the real stimulus-only samples');
   // Unsupported mixed escape must produce a visible model error, not silently vanish.
   await set('intrinsicRate',30);await page.locator('#signal-loading.signal-unavailable').waitFor({state:'visible'});
   assert.match(await page.locator('#signal-loading').innerText(),/fuera de alcance/);
   await set('intrinsicRate',0);await ready();assert.equal((await observed()).beats,0);
   await page.locator('[data-panel=base]').click();await set('hr',90);await ready();assert.equal((await observed()).beats,0);
   assert.equal((await observed()).status,'unavailable');await set('hr',rate);await ready();
   await page.locator('[data-panel=conduction]').click();await page.locator('[data-key=pacingBehavior]').selectOption('demand');await ready();
   assert.deepEqual(await observed(),captured,'Restored capture must recover exact samples and event counts');
   assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);results.push({engine:engine.name(),width,build,stimuliWithoutVentricularEvents:true,visibleUnavailableRate:true,frozenUnavailableRate:true,pointerTargetSurvivesRedraw:true,jsonAndPngDownloaded:true,unsupportedEscapeRejected:true,exactRecovery:true});
  }catch(e){await page.screenshot({path:resolve(out,tag+'-failure.png')}).catch(()=>{});await writeFile(resolve(out,tag+'-failure.json'),JSON.stringify({error:String(e.stack),errors,warnings},null,2));throw e;}
  finally{await page.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(out,'vvi-noncapture-browser-results.json'),JSON.stringify({results,clinicalValidation:false,physicalDevice:false},null,2));
console.log(JSON.stringify({flows:results.length,clinicalValidation:false}));
