/** End-to-end teaching workflow, with an independent acquired-sample oracle. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
import { installWorkerTap, readTrace as readTraceWindow, settledTrace as settledTraceWindow, workerReplies } from './support/worker-tap.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/';
const out=resolve(process.argv[2]||'../ECG-QA/teaching-browser');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const hash=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
// Identity covers the complete acquired record, although the teaching paper shows10s.
const readTrace=page=>readTraceWindow(page,{seconds:65});
const settledTrace=(page,action)=>settledTraceWindow(page,action,{seconds:65});
const results=[],errors=[],warnings=[];
const oracle=(s,lead,beat)=>{const a=s.leads[lead],b=s.events.beats[beat],j=b.time+b.qrs;const mean=(from,to)=>{const v=a.slice(Math.round(from*s.fs),Math.round(to*s.fs)+1);return v.reduce((x,y)=>x+y,0)/v.length;};return mean(j,j+.01)-mean(b.time-.04,b.time-.02);};
const browser=await chromium.launch({headless:true});let failure,activePage,activeFamily,activeVariant;
async function openTeaching(page){
 if(!await page.locator('.paper-menu').evaluate(d=>d.open))await page.locator('.paper-menu > summary').click();
 if(!await page.locator('.view-aids').evaluate(d=>d.open))await page.locator('.view-aids > summary').click();
 const insideViewport=await page.locator('.view-options').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;});
 assert(insideViewport,'The secondary menu must remain within the viewport when its trigger wraps');
 await page.locator('[data-action=teaching]').click();
}
async function selectTeachingCase(page,id){
 assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false,'Close the teaching modal before navigating the catalog');
 const variant=page.locator(`[data-variant="${id}"]`);
 if(await variant.count()&&await variant.isVisible()&&await variant.getAttribute('aria-selected')!=='true'){await variant.click();return;}
 await chooseCatalogPreset(page,id);
}
try{
 for(const variant of [{width:1440,theme:'light',scale:1},{width:390,theme:'dark',scale:1},{width:320,theme:'light',scale:2}]){
  const page=await browser.newPage({viewport:{width:variant.width,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  activePage=page;activeVariant=variant;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await installWorkerTap(page);await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/i);assert.equal(await page.locator('vite-error-overlay').count(),0);
  if(variant.theme==='dark')await page.locator('[data-action=theme]').click();
  if(variant.scale===2)await page.addStyleTag({content:':root {font-size:200%!important}'});
  let capturedId='';
  for(const family of variant.width===1440?['sinus','anterior','inferior','lateral','lbbb','af','vf','asystole']:['inferior']){
   activeFamily=family;const trace=await settledTrace(page,()=>selectTeachingCase(page,family));
   assert.equal(trace.case.presetId,family,'The real worker case must match the requested family');
   const before=hash(trace),count=await workerReplies(page);
   await openTeaching(page);await page.locator('#teaching-root').waitFor();
   assert.equal(await page.locator('#dialog').evaluate(d=>d.open),true);
   assert.equal(await page.locator('[data-teach-lead]').count(),12);
   const beat=Number(await page.locator('#teach-beat').inputValue());
   const measured=await page.locator('[data-teach-lead]').evaluateAll(bs=>bs.map(b=>({lead:b.dataset.teachLead,text:b.querySelector('small').textContent})));
   for(const row of measured.filter(x=>x.text))assert(Math.abs(Number(row.text.replace(' mV','').replace(',','.').replace('−','-'))-oracle(trace,row.lead,beat))<=.000501,`${family}/${row.lead} badge must read finalsamples`);
   await page.locator('[data-teach-lead=V2]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#teach-lead').inputValue(),'V2');assert.equal(await page.locator('#teach-beat').inputValue(),String(beat));
   const initialTime=await page.locator('#teach-t0').inputValue();
   await page.locator('#teach-text').fill('Marca independiente <b>texto</b>');await page.locator('.teaching-note-form [type=submit]').click();
   assert.equal(await page.locator('[data-note-edit]').count(),1);assert.equal(await page.locator('.teaching-note-list b').count(),0);assert(await page.locator('.teach-personal-mark').count()>0);
   await page.locator('#teach-speed').selectOption('25');await page.locator('#teach-gain').selectOption('20');assert.equal(await page.locator('#teach-t0').inputValue(),initialTime);
   await page.locator('[data-teach=predict]').click();
   assert.equal(await page.locator('[data-teach=echo]').isDisabled(),true);
   assert.equal(await page.locator('.teach-system-box').count(),0);
   assert.equal(await page.locator('[data-teach-lead] small').allTextContents().then(xs=>xs.join('')),'');
   await page.locator('[data-teach-lead=V3]').click();assert.equal(await page.locator('.teach-system-box').count(),0);
   // The note editor is a second channel for inadvertent model-window disclosure.
   assert.equal(await page.locator('#teach-v0').inputValue(),'-0.200');assert.equal(await page.locator('#teach-v1').inputValue(),'0.200');
   await page.locator('[data-teach=reveal]').click();assert.equal(await page.locator('.teaching-feedback').isVisible(),true);assert.equal(await page.locator('[data-teach=echo]').isDisabled(),false);
   await page.locator('[data-teach=echo]').click();
   const supported=!['lbbb','af','vf','asystole'].includes(family);assert.equal(await page.locator('.teaching-echo-host').getAttribute('data-echo-available'),String(supported));
   if(supported){await page.locator('#echo-segment').selectOption('4');await page.locator('[data-echo-lead=II]').click();assert.equal(await page.locator('#teach-lead').inputValue(),'II');await page.locator('#echo-time').fill('350');await page.locator('#echo-time').dispatchEvent('input');assert.match(await page.locator('#teach-cursor-value').textContent(),/actual/);
    // Native range quantizes its long fractional minimum; let the browser sanitize it.
    await page.locator('#teach-cursor').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},trace.events.beats[beat].time+.12);assert.match(await page.locator('[data-echo-time]').textContent(),/120 ms/,'ECGcursor must seektheecho too');}
   await page.locator('.teaching-echo-host').scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`workspace-${family}-${variant.width}-${variant.theme}-${variant.scale}.png`)});
   const overflow=await page.locator('#teaching-root').evaluate(root=>{const bounds=root.getBoundingClientRect();return [...root.querySelectorAll('button,select,input,textarea,p,summary')].filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.left<bounds.left-2||r.right>bounds.right+2;}).map(e=>({text:e.textContent?.slice(0,100),width:e.clientWidth}));});
   assert.deepEqual(overflow,[],`${family}/${JSON.stringify(variant)} controls overflow`);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
   assert.equal(await page.locator('.paper-menu > summary').evaluate(b=>b===document.activeElement),true,'Dialogfocusreturns toopener');
   assert.equal(await workerReplies(page),count,'View and note actions must not resynthesize');assert.equal(hash(await readTrace(page)),before,'View and note actions must not mutate samples orcase');
   await openTeaching(page);assert.equal(await page.locator('[data-note-edit]').count(),1,'Notes retained whenreopening same signal');
   if(variant.width===1440&&family==='sinus'){
    await page.locator('[data-teach=capture]').click();const id=await page.locator('#teach-reference option').last().getAttribute('value');capturedId=id;assert(id,'Capturedstate must have anidentity');await page.locator('#teach-reference').selectOption(id);await page.locator('#teach-mode').selectOption('difference');
    const ys=await page.locator('.teach-current-trace').getAttribute('d').then(d=>[...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>Number(m[2])));assert(ys.length>50);assert(ys.every(y=>y===ys[0]),'Same acquiredrecord delta mustbe exactlyzero');
    await page.locator('[data-teach=predict]').click();assert.equal(await page.locator('.teach-reference-trace').count(),0,'Prediction musthideapreviouslyselectedcomparison');assert.equal(await page.locator('.teaching-comparison').isHidden(),true);assert.doesNotMatch(await page.locator('#teach-cursor-value').textContent(),/referencia/);await page.locator('[data-teach=reveal]').click();
    await page.locator('.teaching-export summary').click();
    const downloading=page.waitForEvent('download');await page.locator('[data-teach=json]').click();const file=await downloading;await file.saveAs(resolve(out,'notes.json'));
    const parsed=JSON.parse(await readFile(resolve(out,'notes.json'),'utf8'));assert.equal(parsed.units.time,'s-from-record-start');assert.equal(parsed.units.voltage,'mV-acquired');assert.equal(parsed.notes.length,1);
    parsed.signal='tampered';await page.locator('#teach-file').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(parsed))});await page.waitForFunction(()=>document.querySelector('.teaching-status').textContent.includes('otra señal'));assert.equal(await page.locator('[data-note-edit]').count(),1);
    results.push({negativeForeignNoteImport:true,identicalRecordZeroDelta:true});
   }
   if(variant.width===1440&&family==='anterior'){
    await page.locator('[data-teach=baseline]').click();await page.waitForFunction(()=>document.querySelector('.teaching-status').textContent.includes('Basal disponible'),{timeout:30000});
    assert.equal(await page.locator('#teach-reference').inputValue(),'baseline');assert.equal(await page.locator('#teach-mode').inputValue(),'overlay');assert.equal(hash(await readTrace(page)),before);
    results.push({counterfactualLoadPreservesCurrent:true});
   }
   if(variant.width===1440&&family==='af'){
    assert.equal(await page.locator(`#teach-reference option[value="${capturedId}"]`).count(),1,'Capturedsinusstate survivescasechanges');await page.locator('#teach-reference').selectOption(capturedId);
    const diagnostic=await page.locator('.teaching-comparison-note').textContent(),deltaOption=page.locator('#teach-mode option[value=difference]');
    assert.equal(await deltaOption.evaluate(option=>option.disabled),true,diagnostic);assert.notEqual(await deltaOption.getAttribute('disabled'),null);assert.match(diagnostic,/Calendarios.*distintos/);
    // Programmatic bypass is also refused: native disabled state is not the only guard.
    await page.locator('#teach-mode').evaluate(select=>{select.value='difference';select.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.locator('#teach-mode').inputValue(),'overlay');
    results.push({changedCalendarDeltaDisabled:true,forgedDifferenceRejected:true,currentPreset:trace.case.presetId,referencePreset:'sinus',referenceId:capturedId,diagnostic});
   }
   // Escape has already been exercised above. Close explicitly after reopening:
   // a native select/file control may consume Escape before the modal receives it.
   await page.locator('#dialog [data-action=close-dialog]').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
   results.push({...variant,family,actualPreset:trace.case.presetId,beat,measuredLeadCount:measured.filter(x=>x.text).length,finalSampleOracle:measured.some(x=>x.text)?'passed':'unavailable: no eligible ST windows',notesPersist:true,predictionConcealment:true,echoSupported:supported,keyboard:true,noOverflow:true,sampleIdentity:true});
  }
  if(variant.width===1440){
   const trace=await settledTrace(page,()=>chooseCatalogPreset(page,'inferior'));
   await settledTrace(page,()=>page.locator('#file-input').setInputFiles({name:'reversed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...trace.case,artifacts:{...trace.case.artifacts,reversed:true}}))}));
   await openTeaching(page);await page.locator('[data-teach=echo]').click();assert.equal(await page.locator('[data-echo-lead]').count(),0);assert.equal(await page.locator('.anatomy-related').count(),0);assert.match(await page.locator('[data-echo-related]').textContent(),/desactivadas/);await page.keyboard.press('Escape');results.push({reversedLeadAnatomyBlocked:true});
   await page.getByRole('button',{name:'Practicar',exact:true}).click();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-action=teaching]').isHidden(),true);
   await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='teaching';document.body.append(b);b.click();b.remove();});assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);results.push({concealedQuizForgedRouteBlocked:true});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack||e);if(activePage&&!activePage.isClosed()){
 await activePage.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
 await writeFile(resolve(out,'failure-dom.html'),await activePage.content()).catch(()=>{});
 const diagnostics=await activePage.evaluate(()=>({url:location.href,body:document.body.innerText,activeElement:document.activeElement?.outerHTML,dialogOpen:document.querySelector('#dialog')?.open,search:document.querySelector('#case-search')?.value,catalog:[...document.querySelectorAll('#case-list [data-preset]')].map(b=>({id:b.dataset.preset,text:b.innerText})),variants:[...document.querySelectorAll('[data-variant]')].map(b=>({id:b.dataset.variant,selected:b.getAttribute('aria-selected')})),reference:document.querySelector('#teach-reference')?.innerHTML,comparison:document.querySelector('.teaching-comparison-note')?.textContent}));
 await writeFile(resolve(out,'failure-context.json'),JSON.stringify({activeFamily,activeVariant,...diagnostics,trace:await readTrace(activePage).catch(()=>null)},null,2));
}}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({url,results,errors,warnings,failure,clinicalValidation:false},null,2));}
console.log(JSON.stringify({results,errors,warnings,failure},null,2));if(failure)process.exitCode=1;
