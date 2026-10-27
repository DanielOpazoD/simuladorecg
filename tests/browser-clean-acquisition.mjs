/** User-selected clean acquisition; final worker samples, real controls and files. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {installWorkerTap,workerReplies,waitForReply} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/';
const out=resolve(process.argv[2]||'../ECG-QA/clean-acquisition-browser');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const browser=await chromium.launch({headless:true}),report={cases:[],errors:[],warnings:[],clinicalValidation:false};
let active,failure;

async function snapshot(page) {
 return page.evaluate(async()=>{
  const {ecg,data}=window.__ecgTap.last;
  const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const json=v=>hash(new TextEncoder().encode(JSON.stringify(v)));
  const {leads,...metadata}=data.signal;
  return {ecg,metadata:await json(metadata),measurement:await json(data.measurement),leads:await Promise.all(Object.entries(leads).map(async([lead,a])=>({lead,length:a.length,hash:await hash(a)})))};
 });
}
async function chooseAcquisition(page,mode) {
 if(!await page.locator('.paper-menu').evaluate(d=>d.open))await page.locator('.paper-menu > summary').click();
 const bounds=await page.locator('.view-options').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=page.viewportSize().width);
 const count=await workerReplies(page);await page.locator('[data-key="acquisition"]').selectOption(mode);await waitForReply(page,count);
 await page.locator('.paper-menu > summary').click();
}
async function importCase(page,ecg) {
 const count=await workerReplies(page);
 await page.locator('#file-input').setInputFiles({name:'case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ecg))});
 await waitForReply(page,count);
}

try {
 for(const width of [1440,390,320]) {
  const page=active=await browser.newPage({viewport:{width,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
  await installWorkerTap(page);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  assert.equal(await page.locator('[data-key="acquisition"]').inputValue(),'realistic','No unrequested default promotion');
  if(width===320)await page.addStyleTag({content:':root{font-size:200%!important}'});
  let cleanCase;
  for(const family of width===1440?['sinus','lbbb','rbbb','anterior','af','flutter','vvi','vf']:['sinus']) {
   if(family!=='sinus'){await chooseCatalogPreset(page,family);await page.locator('#signal-loading').waitFor({state:'hidden'});}
   if(await page.locator('[data-key="acquisition"]').inputValue()!=='realistic')await chooseAcquisition(page,'realistic');
   const before=await snapshot(page),title=await page.locator('#case-title').innerText(),metrics=await page.locator('#metrics').innerText();
   assert.equal(before.ecg.presetId,family);assert(before.leads.every(l=>l.length===32500));
   if(family==='sinus'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`noise-${width}.png`)});}
   await chooseAcquisition(page,'ideal');const clean=await snapshot(page);cleanCase=clean.ecg;
   assert.deepEqual(clean.ecg,{...before.ecg,acquisition:'ideal'});
   assert.equal(clean.metadata,before.metadata,'Cardiac events and model truth unchanged');
   assert.notDeepEqual(clean.leads,before.leads,'The acquired samples really change, not only their display');
   assert.equal(await page.locator('#case-title').innerText(),title);assert.equal(await page.locator('#metrics').innerText(),metrics);
   if(family==='sinus'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`clean-${width}.png`)});}
   await chooseAcquisition(page,'realistic');const restored=await snapshot(page);assert.deepEqual(restored,before,'Returning to the original setting restores complete samples and measurements');
   report.cases.push({width,family,completeRecordSeconds:65,clean,original:before,reversible:true,modelCardsUnchanged:true});
  }
  await importCase(page,cleanCase);await chooseAcquisition(page,'ideal');
  await page.reload();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-key="acquisition"]').inputValue(),'ideal');
  await chooseCatalogPreset(page,'anterior');await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-key="acquisition"]').inputValue(),'ideal');
  // Manual artifacts remain an explicit separate source, not erased by the clean setting.
  const clean=await snapshot(page),manual={...clean.ecg,artifacts:{...clean.ecg.artifacts,baseline:.2,muscle:.2}};
  await importCase(page,manual);const noisyManual=await snapshot(page);assert.deepEqual(noisyManual.ecg.artifacts,manual.artifacts);assert.notDeepEqual(noisyManual.leads,clean.leads);
  await importCase(page,clean.ecg);assert.deepEqual((await snapshot(page)).leads,clean.leads);
  await page.locator('[data-action=export]').click();
  const promise=page.waitForEvent('download');await page.locator('[data-action=json]').click();const download=await promise;await download.saveAs(resolve(out,`case-${width}.json`));
  const saved=JSON.parse(await readFile(resolve(out,`case-${width}.json`),'utf8'));assert.equal(saved.acquisition,'ideal');
  const pngPromise=page.waitForEvent('download');await page.locator('[data-action=png]').click();await (await pngPromise).saveAs(resolve(out,`clean-${width}-export.png`));
  await page.locator('#dialog [data-action=close-dialog]').click();
  // Imported and linked cases override the reader preference, never rewritten to it.
  const legacy={...saved};delete legacy.acquisition;await importCase(page,legacy);assert.equal(await page.locator('[data-key="acquisition"]').inputValue(),'realistic');
  const linked={...saved,acquisition:'realistic'};await page.goto(url+'#case='+Buffer.from(JSON.stringify(linked)).toString('base64url'));
  await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-key="acquisition"]').inputValue(),'realistic');
  await page.locator('[data-action=quiz]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});
  const quizText=await page.locator('#quiz-panel').innerText();await chooseAcquisition(page,'ideal');assert.equal(await page.locator('#quiz-panel').innerText(),quizText);
  assert.equal(await page.locator('[data-action=compare]').isHidden(),true);await page.getByRole('button',{name:'Salir de práctica'}).click();
  await page.locator('[data-action=about]').click();await page.getByText('El ECG actual: origen y límites',{exact:true}).click();assert.match(await page.locator('#dialog').innerText(),/sin ruido de adquisición añadido/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(error){failure=String(error.stack||error);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({...report,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:report.cases.length,failure,evidence:out}));if(failure)process.exitCode=1;
