/** Reading-only actions retain measurements; new samples/geometry invalidate them. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,workerReplies} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/reading-continuity');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure,active;
const value=p=>p.locator('#measurement-values').getAttribute('data-ms');
async function measure(p){
 if(await p.locator('[data-action=caliper]').getAttribute('aria-pressed')!=='true')await p.locator('[data-action=caliper]').click();
 await p.locator('#caliper-endpoint').selectOption('1');await p.locator('#caliper-time').fill('137');await p.locator('#caliper-time').press('Tab');
 await p.locator('#caliper-endpoint').selectOption('2');await p.locator('#caliper-time').fill('459');await p.locator('#caliper-time').press('Tab');
 assert.equal(await value(p),'322');
}
async function viewMenu(p){if(!await p.locator('.paper-menu').evaluate(e=>e.open))await p.locator('.paper-menu > summary').click();}
async function settings(p){await viewMenu(p);}
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
  const p=active=await browser.newPage({viewport,reducedMotion:'reduce'});await installWorkerTap(p);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme','light');});
  await p.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await p.locator('#signal-loading').waitFor({state:'hidden'});
  for(const id of ['sinus','anterior']){
   await chooseCatalogPreset(p,id);await p.locator('#signal-loading').waitFor({state:'hidden'});await measure(p);
   const count=await workerReplies(p),original=await p.locator('#ecg').evaluate(e=>e.toDataURL());
   await p.locator('[data-finding]').first().click();assert.equal(await p.locator('[data-action=caliper]').getAttribute('aria-label'),'Mostrar medición');
   await p.locator('[data-action=caliper]').click();assert.equal(await value(p),'322');
   await settings(p);await p.locator('[data-key="view.grid"]').uncheck();assert.equal(await value(p),'322');
   await p.locator('[data-key="view.grid"]').check();assert.equal(await value(p),'322');
   assert.equal(await p.locator('#ecg').evaluate(e=>e.toDataURL()),original,'Grid roundtrip restores exact rendered pixels');
   await p.locator('[data-mode=paper]').click();assert.equal(await value(p),'322');
   await p.locator('.paper-menu > summary').click();
   await chooseCatalogPreset(p,id);assert.equal(await value(p),'322','Reselecting a complete identical preset is a no-op');
   assert.equal(await workerReplies(p),count,'Reading actions must not regenerate signal');
   await p.locator('[data-action=caliper]').click();
   while(await p.locator('[data-action=zoom-reset]').innerText()!=='200 %')await p.locator('[data-action=zoom-in]').click();
   await p.locator('[data-reading-segment="10"]').scrollIntoViewIfNeeded();await settings(p);
   // Dispatch synchronously to inspect the loading frame, before worker delivery.
   const pending=await p.evaluate(()=>{
    const wrap=document.querySelector('#canvas-wrap'),canvas=document.querySelector('#ecg');
    wrap.scrollTop=Math.min(500,wrap.scrollHeight-wrap.clientHeight);wrap.scrollLeft=Math.min(400,wrap.scrollWidth-wrap.clientWidth);
    const pos=()=>({left:wrap.scrollLeft,top:wrap.scrollTop,width:canvas.clientWidth,height:canvas.clientHeight});
    const before=pos(),select=document.querySelector('#quick-adjust [data-key=pr]');select.value=String(+select.value+10);select.dispatchEvent(new Event('input',{bubbles:true}));
    return {before,loading:pos(),pending:!document.querySelector('#signal-loading').hidden};
   });
   assert(pending.pending);assert.deepEqual(pending.loading,pending.before,'Loading must preserve zoom geometry and scroll');
   await p.locator('#signal-loading').waitFor({state:'hidden'});
   const after=await p.locator('#canvas-wrap').evaluate(e=>({left:e.scrollLeft,top:e.scrollTop}));
   assert(Math.abs(after.left-pending.before.left)<2&&Math.abs(after.top-pending.before.top)<10,JSON.stringify({pending,after}));
   assert.equal(await value(p),null,'New samples must discard old caliper');
   // Two native edits before delivery must retain one anchor and publish only the latest state.
   await p.evaluate(()=>{const s=document.querySelector('#quick-adjust [data-key=pr]'),v=+s.value;for(const n of [v+2,v+4]){s.value=String(n);s.dispatchEvent(new Event('input',{bubbles:true}));}});
   await p.locator('#signal-loading').waitFor({state:'hidden'});
   const afterRapid=await p.locator('#canvas-wrap').evaluate(e=>({left:e.scrollLeft,top:e.scrollTop}));
   assert(Math.abs(afterRapid.left-after.left)<=1&&Math.abs(afterRapid.top-after.top)<=1,JSON.stringify({message:'Superseded requests must retain the anchor within native scroll rounding',viewport,id,after,afterRapid}));
   await p.locator('.paper-menu > summary').click();await measure(p);await settings(p);
   await p.locator('[data-key="view.speed"]').selectOption('50');assert.equal(await value(p),null,'New scale must discard pixel-based caliper');
   await p.locator('[data-key="view.speed"]').selectOption('25');
   await p.keyboard.press('Escape');await measure(p);
   await chooseCatalogPreset(p,id==='sinus'?'lbbb':'sinus');await p.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await value(p),null);
   results.push({viewport,id,pending,after,afterRapid,readingRetainsMeasurement:true,newSamplesAndScaleInvalidate:true});
  }
  if(viewport.width===1440){
   const imported=await p.evaluate(()=>({...window.__ecgTap.last.ecg,hr:83}));
   assert.equal(imported.presetId,'sinus');
   await p.locator('#file-input').setInputFiles({name:'edited-sinus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
   await p.locator('#signal-loading').waitFor({state:'hidden'});await measure(p);
   const before=await workerReplies(p);await chooseCatalogPreset(p,'sinus');await p.locator('#signal-loading').waitFor({state:'hidden'});
   assert.equal(await workerReplies(p),before+1,'An imported different model with the same ID must restore the actual preset');
   assert.equal(await value(p),null);
  }
  await p.screenshot({path:resolve(out,`${viewport.width}-reading.png`)});await p.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure}));if(failure)process.exitCode=1;
