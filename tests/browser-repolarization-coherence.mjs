import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
/** Real worker -> A/B exports: potassium acts on rendered T, explicit ST limitation, scope errors recover. */
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
  await page.goto(url);await ready();assert.match(await page.title(),/ECG/);
  if(width===390)await page.locator('[data-action="catalog"]').click();
  await chooseCatalogPreset(page, 'lbbb');await ready();
  await page.locator('[data-action="export"]').click();const download=page.waitForEvent('download');
  await page.locator('[data-action="json"]').click();const originalFile=resolve(out,`coherence-case-${width}.json`);
  await(await download).saveAs(originalFile);
  const original=JSON.parse(await readFile(originalFile,'utf8'));
  const base={...original,hr:60,atrialRate:60,variability:0,filter:'off',qtc:600,ischemia:'none',st:0,pAmp:0,electrolyte:'none',tAmp:.28};
  const importCase=async(c,kind='changed')=>{
   const previous=await page.locator('#ecg').evaluate(e=>e.toDataURL());
   await page.locator('#file-input').setInputFiles({name:'coherence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});
   if(kind==='scope'){await page.locator('#signal-loading.signal-unavailable').waitFor();return;}
   if(kind==='changed')await page.waitForFunction(p=>document.querySelector('#ecg').toDataURL()!==p,previous);
   await ready();
  };
  await importCase(base);await page.locator('[data-action="compare"]').click();await page.locator('#compare-pin').click();
  const exported=async name=>{const wait=page.waitForEvent('download');await page.locator('#compare-json').click();const file=resolve(out,`coherence-${name}-${width}.json`);await(await wait).saveAs(file);return JSON.parse(await readFile(file,'utf8'));};
  const normal=await exported('normal');assert.deepEqual(normal.A.leads,normal.B.leads);
  await importCase({...base,tAmp:0});const zero=await exported('zero');
  const beat=zero.B.events.beats.find(b=>b.time>2),index=Math.round((beat.time+beat.qrs+.060)*zero.B.fs);
  assert.ok(Math.abs(zero.B.leads.V2[index])<1e-12,'Unsupported ST is absent; not physiological normality');
  await page.locator('[data-panel="st"]').click();
  assert.match(await page.locator('#secondary-repolarization-note').innerText(),/ST secundario no está representado/);
  await importCase({...base,electrolyte:'hypokalemia'});const hypo=await exported('hypokalemia');
  await page.locator('#compare-start').fill('2');await page.locator('#compare-start').press('Tab');
  await page.locator('#compare-range').selectOption('2');
  await page.locator('#comparison-lab').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(out,`coherence-view-${width}.png`)});
  const png=page.waitForEvent('download');await page.locator('#compare-png').click();await(await png).saveAs(resolve(out,`coherence-trace-${width}.png`));
  await importCase({...base,electrolyte:'hypokalemia',tAmp:0});const hypoZero=await exported('hypo-zero');
  let checked=0,maxErrorMv=0;
  for(const l of Object.keys(normal.A.leads))for(let i=0;i<normal.A.leads[l].length;i++){
   const expected=.4*(normal.A.leads[l][i]-zero.B.leads[l][i]);
   const actual=hypo.B.leads[l][i]-hypoZero.B.leads[l][i];
   maxErrorMv=Math.max(maxErrorMv,Math.abs(actual-expected));checked++;
  }
  assert.ok(maxErrorMv<1e-12);assert.deepEqual(hypo.B.events,normal.A.events);
  await importCase({...base,electrolyte:'hypokalemia',ischemia:'anterior',phase:'evolving',st:1},'scope');
  assert.match(await page.locator('#signal-loading').innerText(),/fuera de alcance/);
  assert.equal(await page.locator('#compare-json').count(),0,'No stale export after unsupported input');
  await importCase(base,'recovery');const recovered=await exported('recovered');
  assert.deepEqual(recovered.A.leads,normal.A.leads);assert.deepEqual(recovered.B.leads,normal.A.leads);
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  checks.push({width,checked,maxErrorMv,isolatedST60V2Mv:zero.B.leads.V2[index],scopeRejection:true,exactRecovery:true});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'coherence-ui-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,clinicalValidation:false,physicalDeviceTest:false},null,2));
}catch(error){await writeFile(resolve(out,'coherence-failure.json'),JSON.stringify({error:String(error.stack),checks,errors,warnings},null,2));throw error;}
finally{await browser.close();}
