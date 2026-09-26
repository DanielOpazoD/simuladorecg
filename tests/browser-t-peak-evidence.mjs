/** Production UI: an unclosed T candidate never becomes a QT interval. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const identity=await (await fetch(new URL('build-info.json',url))).json();
assert.deepEqual(identity,JSON.parse(await readFile('dist/build-info.json')));assert.equal(identity.dirty,false);
const browser=await chromium.launch({headless:true}),errors=[],warnings=[],checks=[];let page;
try{
 for(const width of [1440,390]){
  page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await page.goto(url);assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  await page.locator('#signal-loading').waitFor({state:'hidden'});
  if(width===390)await page.locator('[data-action="catalog"]').click();
  await page.locator('[data-preset="tachy"]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});
  await page.getByText('Pico T candidato de la envolvente',{exact:false}).waitFor({state:'visible'});
  const detail=page.locator('#beat-detail');await detail.scrollIntoViewIfNeeded();
  assert.match(await detail.innerText(),/T candidata/);assert.doesNotMatch(await detail.innerText(),/QT \d+ ms/);
  const first=await detail.innerText();
  await page.locator('#detail-lead').selectOption('V5');
  assert.match(await detail.innerText(),/no equivale al pico de cada derivación/);
  assert.doesNotMatch(await detail.innerText(),/QT \d+ ms/);
  await detail.screenshot({path:resolve(out,'t-candidate-'+width+'.png')});
  checks.push({width,flow:'tachy -> visible envelope T candidate -> V5 -> no QT band',text:first});
  if(width===390)await page.locator('[data-action="catalog"]').click();
  await page.locator('[data-preset="sinus"]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>!document.querySelector('#beat-detail')?.textContent.includes('Pico T candidato de la envolvente'));
  assert.doesNotMatch(await detail.innerText(),/T candidata/);await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'t-peak-ui-results.json'),JSON.stringify({identity,url,browser:await browser.version(),checks,errors,warnings,physicalDeviceTest:false,browserPlugin:'not available; repository Playwright CI'},null,2));
 console.log(JSON.stringify({tPeakFlows:checks.length,errors,warnings}));
}catch(e){if(page)await page.screenshot({path:resolve(out,'t-peak-failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
