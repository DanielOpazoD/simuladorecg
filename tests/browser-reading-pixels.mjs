import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {inspectEnlargedPixels} from './support/reading-pixel-oracle.mjs';
const out=resolve(process.argv[2]||'../ECG-QA/reading-pixels'),url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/';
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),results=[];let failure;
try{
 await installWorkerTap(page);await page.addInitScript(()=>{localStorage.setItem('ecglab-theme','light');localStorage.setItem('ecglab-acquisition','ideal');});await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
 for(const id of ['sinus','lbbb','anterior']){
  if(id!=='sinus'){await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});}
  const trace=await readTrace(page);await page.locator('[data-reading-segment="7"]').click();
  const detail=page.locator('#lead-explorer'),start=Number(await detail.getAttribute('data-start')),end=Number(await detail.getAttribute('data-end'));
  const bytes=await page.locator('.lead-detail-trace').screenshot({path:resolve(out,`${id}.png`)}),base64=bytes.toString('base64');
  for(const mutation of [null,'time','voltage','polarity']){
   const result=await page.evaluate(inspectEnlargedPixels,{base64,samples:trace.leads.V2,fs:trace.fs,start,end,mutation});results.push({id,...result});
   assert.equal(result.passed,mutation===null,JSON.stringify({id,...result}));
  }
  await page.keyboard.press('Escape');
 }
}catch(e){failure=String(e.stack||e);await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,evidence:out}));if(failure)process.exitCode=1;
