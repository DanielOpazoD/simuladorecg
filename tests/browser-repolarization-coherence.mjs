import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
import { openControlPanel } from './support/adjust-panel.mjs';
import { installWorkerTap, settledTrace } from './support/worker-tap.mjs';
/** Real worker replies: potassium acts on rendered T, explicit ST limitation, scope errors recover. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],errors=[],warnings=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  await installWorkerTap(page);
  await page.goto(url);await ready();assert.match(await page.title(),/ECG/);
  if(width===390)await page.locator('[data-action="catalog"]').click();
  await chooseCatalogPreset(page, 'lbbb');await ready();
  await page.locator('[data-action="export"]').click();const download=page.waitForEvent('download');
  await page.locator('[data-action="json"]').click();const originalFile=resolve(out,`coherence-case-${width}.json`);
  await(await download).saveAs(originalFile);
  const original=JSON.parse(await readFile(originalFile,'utf8'));
  // acquisition 'ideal': since F2 the default adds resting noise and quantization, which these exact-sample identities exclude.
  const base={...original,hr:60,atrialRate:60,variability:0,filter:'off',qtc:600,ischemia:'none',st:0,pAmp:0,electrolyte:'none',tAmp:.28,tAxis:25,naturalPAxis:false,naturalTAxis:false,acquisition:'ideal'};
  const fileOf=c=>({name:'coherence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
  // Import through the real file input and return the samples/events/case of the worker's reply.
  const importCase=c=>settledTrace(page,()=>page.locator('#file-input').setInputFiles(fileOf(c)));
  // Out-of-scope input: no reply with samples, a persistent explanation and nothing stale on screen.
  const importScope=async c=>{await page.locator('#file-input').setInputFiles(fileOf(c));await page.locator('#signal-loading.signal-unavailable').waitFor();};
  const assertNothingStale=async why=>{
   assert.equal(await page.locator('#metrics .metric').count(),0,why+': no stale measurements');
   assert.equal(await page.locator('#ecg').getAttribute('aria-label'),'Señal no disponible',why+': no stale trace');
   await page.locator('[data-action="export"]').click();
   assert.equal(await page.locator('[data-action="png"]').isDisabled(),true,why+': no stale PNG');
   await page.locator('#dialog').evaluate(d=>d.close());
  };
  let shown=await importCase(base);
  await openControlPanel(page,'st');
  const axisControl=page.locator('[data-key="tAxis"]');
  assert.equal(await axisControl.isDisabled(),true);
  // Since F2.3 a learned secondary repolarization shows the patient's own T axis (derived from the QRS)
  // in the inactive control and keeps the programmed 25 for a primary T.
  assert.equal(shown.case.tAxis,25,'The programmed axis is conserved');
  assert.equal(Number(await axisControl.inputValue()),Math.round(shown.truth.tAxis/5)*5,'The inactive control shows the derived axis');
  assert.notEqual(await axisControl.inputValue(),'25');
  assert.equal(await axisControl.getAttribute('aria-describedby'),'t-axis-note');
  assert.ok(await axisControl.evaluate(e=>Number(getComputedStyle(e).opacity)<1));
  assert.match(await page.locator('#t-axis-note').innerText(),/Control inactivo/);
  assert.match(await page.locator('#t-axis-note').innerText(),/Derivado del QRS/);
  const primary={...base,conduction:'normal',overload:'none',rhythm:'sinus',ectopy:'none',ventricularSource:'auto'};
  await importCase(primary);
  assert.equal(await axisControl.isDisabled(),false);assert.equal(await axisControl.inputValue(),'25');
  assert.equal(await axisControl.evaluate(e=>getComputedStyle(e).opacity),'1');
  const changeWithKeyboard=async(control,key)=>{
   const previous=await page.locator('#ecg').evaluate(e=>e.toDataURL());
   await control.focus();await control.press(key);
   await page.waitForFunction(p=>document.querySelector('#ecg').toDataURL()!==p,previous);await ready();
  };
  await changeWithKeyboard(axisControl,'ArrowRight');assert.equal(await axisControl.inputValue(),'30');
  await changeWithKeyboard(page.locator('[data-key="tAmp"]'),'Home');
  assert.equal(await axisControl.isDisabled(),true);assert.equal(await axisControl.inputValue(),'30');
  await changeWithKeyboard(page.locator('[data-key="tAmp"]'),'End');
  assert.equal(await axisControl.isDisabled(),false);assert.equal(await axisControl.inputValue(),'30');
  const normal=await importCase(base);assert.equal(await axisControl.isDisabled(),true);assert.equal(Number(await axisControl.inputValue()),Math.round(normal.truth.tAxis/5)*5);
  await page.locator('#t-axis-note').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(out,`t-axis-controls-${width}.png`)});
  const zero=await importCase({...base,tAmp:0});
  const beat=zero.events.beats.find(b=>b.time>2),index=Math.round((beat.time+beat.qrs+.060)*zero.fs);
  assert.ok(zero.leads.V2[index]>.005,'Discordant secondary ST remains represented with T amplitude zero');
  await openControlPanel(page,'st');
  // The model's limits are a folded disclosure inside the tab; open it as a reader does.
  await page.locator('[data-control-panel="st"] .control-limits > summary').click();
  assert.match(await page.locator('#secondary-repolarization-note').innerText(),/El ST secundario sigue esa misma fuente QRS/);
  await importCase({...base,electrolyte:'hypokalemia'});
  await page.locator('.trace-panel').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(out,`coherence-view-${width}.png`)});
  await page.locator('#ecg').screenshot({path:resolve(out,`coherence-trace-${width}.png`)});
  await importScope({...base,electrolyte:'hypokalemia',ischemia:'anterior',phase:'evolving',st:1});
  assert.match(await page.locator('#signal-loading').innerText(),/fuera de alcance/);
  await assertNothingStale('unsupported input');
  const recovered=await importCase(base);
  assert.deepEqual(recovered.leads,normal.leads);
  await importScope({...base,conduction:'wpw',rhythm:'af'});
  assert.match(await page.locator('#signal-loading').innerText(),/no representa esa conducción/);
  assert.match(await page.locator('#signal-loading').innerText(),/no una imposibilidad clínica/);
  await assertNothingStale('pre-excited AF');
  assert.equal(await page.locator('#toast').textContent(),'','Persistent error must not have a duplicate overlay');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
  await page.locator('#signal-loading').screenshot({path:resolve(out,`wpw-clock-scope-${width}.png`)});
  const wpwRecovered=await importCase(base);
  assert.deepEqual(wpwRecovered.leads,normal.leads);
  // Full WPW worker/render route, including the secondary ST that remains
  // when T gain is zero and the inactive primary T-axis control.
  const wpw={...base,conduction:'wpw',pr:100,qrs:135,axis:35};
  const wpwFull=await importCase(wpw);
  await openControlPanel(page,'st');
  assert.equal(await axisControl.isDisabled(),true);
  assert.match(await page.locator('#t-axis-note').innerText(),/delta/);
  await page.screenshot({path:resolve(out,`wpw-controls-${width}.png`)});
  const wpwAxis=await importCase({...wpw,tAxis:-120});
  assert.deepEqual(wpwAxis.leads,wpwFull.leads);
  const wpwZero=await importCase({...wpw,tAmp:0});
  const wb=wpwZero.events.beats.find(b=>b.time>2),wi=Math.round((wb.time+wb.qrs+.060)*wpwZero.fs);
  assert.ok(wpwZero.leads.II[wi]<-.005,'WPW has negative secondary ST');
  const wpwDouble=await importCase({...wpw,tAmp:.56});
  for(const lead of Object.keys(wpwFull.leads))for(let i=0;i<wpwFull.leads[lead].length;i++)
    assert.ok(Math.abs((wpwDouble.leads[lead][i]-wpwZero.leads[lead][i])-2*(wpwFull.leads[lead][i]-wpwZero.leads[lead][i]))<1e-12);
  // Potassium acts on the rendered T with the same .4 response. Hypokalemia has no learned base (the case
  // falls back to the parametric kernels), so the identity is exact only against a parametric reference: WPW.
  const wpwHypo=await importCase({...wpw,electrolyte:'hypokalemia'}),wpwHypoZero=await importCase({...wpw,electrolyte:'hypokalemia',tAmp:0});
  let checked=0,maxErrorMv=0,response=0;
  for(const l of Object.keys(wpwFull.leads))for(let i=0;i<wpwFull.leads[l].length;i++){
   const t=wpwFull.leads[l][i]-wpwZero.leads[l][i];response=Math.max(response,Math.abs(t));
   maxErrorMv=Math.max(maxErrorMv,Math.abs((wpwHypo.leads[l][i]-wpwHypoZero.leads[l][i])-.4*t));checked++;
  }
  assert.ok(response>.01,'Fixture needs a measurable T');
  assert.ok(maxErrorMv<1e-12,'Hypokalemic T response differs from .4 by '+maxErrorMv+' mV');assert.deepEqual(wpwHypo.events,wpwFull.events);
  await importCase(wpw);await page.locator('.trace-panel').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(out,`wpw-repolarization-${width}.png`)});
  await page.locator('#ecg').screenshot({path:resolve(out,`wpw-repolarization-trace-${width}.png`)});
  const rotated=await importCase({...wpw,axis:-60});
  assert.notDeepEqual(rotated.leads,wpwFull.leads);
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  checks.push({width,checked,maxErrorMv,isolatedST60V2Mv:zero.leads.V2[index],scopeRejection:true,exactRecovery:true,wpwClockScopeAndRecovery:true,tAxisApplicabilityAndRestoration:true,wpwFullRepolarizationAndExports:true});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'coherence-ui-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,clinicalValidation:false,physicalDeviceTest:false},null,2));
}catch(error){await writeFile(resolve(out,'coherence-failure.json'),JSON.stringify({error:String(error.stack),checks,errors,warnings},null,2));throw error;}
finally{await browser.close();}
