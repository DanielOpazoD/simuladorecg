import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],warnings=[],checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await page.goto(url);assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  await page.locator('#signal-loading').waitFor({state:'hidden'});
  const preset=async id=>{if(width===390)await page.locator('[data-action="catalog"]').click();await page.locator(`[data-preset="${id}"]`).click();await page.locator('#signal-loading').waitFor({state:'hidden'});};
  await preset('tachy');const detail=page.locator('#beat-detail');
  await detail.locator('[data-t-end-assistance]').waitFor();await detail.scrollIntoViewIfNeeded();
  assert.match(await detail.innerText(),/revisión manual/);assert.doesNotMatch(await detail.innerText(),/QT \d+ ms/);
  const time=await detail.locator('[data-t-end-candidate]').getAttribute('data-t-end-candidate');
  await page.locator('#detail-lead').selectOption('V5');
  assert.equal(await detail.locator('[data-t-end-candidate]').getAttribute('data-t-end-candidate'),time);
  assert.match(await detail.innerText(),/no un límite validado de V5/);
  await detail.locator('[data-action="next-beat"]').click();
  assert.ok(Number(await detail.locator('[data-t-end-candidate]').getAttribute('data-t-end-candidate'))>Number(time));
  if(width===390){
   const scroller=detail.locator('.detail-plot-scroll');
   const headingBefore=await detail.locator('.detail-heading').boundingBox();
   await scroller.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
   const clip=await scroller.boundingBox();
   const markerX=await detail.locator('[data-t-end-candidate] path').evaluate(e=>e.getBoundingClientRect().x);
   assert.ok(markerX>clip.x&&markerX<clip.x+clip.width,'Proposal must be visible after horizontal scroll');
   assert.equal((await detail.locator('.detail-heading').boundingBox()).x,headingBefore.x,'Only graph scrolls, not controls');
   assert.equal(await detail.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'No whole-card horizontal clipping');
  }
  await detail.screenshot({path:resolve(out,'t-end-assistance-'+width+'.png')});
  await preset('asystole');await page.waitForFunction(()=>!document.querySelector('#beat-detail [data-t-end-assistance]'));
  assert.equal(await detail.locator('[data-t-end-candidate]').count(),0);
  checks.push({width,flow:'tachy -> review marker without QT -> V5 same endpoint -> next beat -> mobile graph-only scroll -> asystole clears aid'});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'t-end-assistance-ui-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,physicalDeviceTest:false},null,2));
 console.log(JSON.stringify({tEndAssistanceFlows:checks.length,errors,warnings}));
}finally{await browser.close();}
