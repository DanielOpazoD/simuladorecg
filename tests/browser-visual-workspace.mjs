import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
/** Visual refresh: same production app and numerical objects, not a screenshot mock.
 * Existing fidelity, manual-caliper and cross-engine checks remain mandatory.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
try {
 for(const width of [1440,390,320]) {
  const page=await browser.newPage({viewport:{width,height:width>800?1000:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[],warnings=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const openCatalog=async()=>{if(width<=800){await page.locator('[data-action=catalog]').click();await page.getByRole('dialog',{name:'Biblioteca de patrones'}).waitFor();}};
  const exportPair=async stem=>{
    const pending=page.waitForEvent('download');await page.locator('#compare-json').click();
    const file=resolve(out,`visual-${stem}-${width}.json`);await(await pending).saveAs(file);
    return JSON.parse(await readFile(file,'utf8'));
  };
  await page.goto(url);await ready();
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const info=await(await page.request.get(new URL('build-info.json',url).href)).json();
  if(process.env.ECG_EXPECT_COMMIT)assert.equal(info.commit,process.env.ECG_EXPECT_COMMIT);
  assert.equal(info.dirty,false);
  assert.equal(await page.locator('.workspace-nav [data-action=external]').count(),1);
  assert.equal(await page.locator('.workspace-nav [data-action=compare]').count(),1);
  assert.equal(await page.locator('.trace-tools .btn').count(),4);
  // A/B exports assert real signal/measurement preservation after catalogue navigation.
  await page.locator('[data-action=compare]').click();await page.locator('#compare-pin').click();
  const original=await exportPair('before');
  await openCatalog();
  assert.equal(await page.locator('#case-list [data-preset]').count(),45);
  assert.equal(await page.locator('#case-list [data-preset]:disabled').count(),5);
  await page.locator('#case-search').fill('FA');
  assert.deepEqual((await page.locator('[data-preset]').evaluateAll(es=>es.map(e=>e.dataset.preset))).sort(),['af']);
  assert.equal(await page.locator('#catalog-count').textContent(),'1 patrón · 3 ejemplos');
  await page.locator('#case-search').fill('FIBRILACIÓN');assert.equal(await page.locator('[data-preset=af]').count(),1);
  await page.locator('#case-search').fill('LBBB');await page.locator('[data-preset=lbbb]').click();await ready();
  assert.match(await page.locator('#case-title').textContent(),/rama izquierda/i);
  if(width<=800){assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);assert.equal(await page.locator('#case-title').evaluate(e=>e===document.activeElement),true);}
  await openCatalog();await page.locator('[data-action=clear-search]').click();
  await page.locator('#category').selectOption('Conducción intraventricular');
  assert.deepEqual(await page.locator('.case-subgroup').allTextContents(),['Ramas','Fascículos y combinaciones','Preexcitación']);
  assert.equal(await page.locator('[data-preset]').count(),5);
  await page.locator('#case-search').fill('zzzz-inexistente');assert.equal(await page.locator('.catalog-empty').isVisible(),true);
  await page.locator('[data-action=clear-search]').click();
  assert.equal(await page.locator('[data-preset]').count(),45);
  await page.screenshot({path:resolve(out,`visual-catalog-${width}.png`)});
  await chooseCatalogPreset(page,'sinus');await ready();
  await page.locator('[data-action=compare]').click();const restored=await exportPair('restored');
  assert.deepEqual(restored.A,original.A,'Pinned A cannot change after search or selecting another example');
  assert.deepEqual(restored.B,original.B,'Restoring sinus must restore the full signal and measurements');
  await page.locator('[data-action=parameters]').click();
  assert.equal(await page.locator('#inspector').evaluate(e=>e===document.activeElement),true);
  await page.locator('[data-panel=base]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-panel=conduction]').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('[data-control-panel=conduction]').isVisible(),true);
  await page.screenshot({path:resolve(out,`visual-parameters-${width}.png`)});
  await page.locator('[data-action=external]').click();
  await page.getByRole('dialog',{name:'Explorar una señal'}).waitFor();
  assert.equal(await page.locator('.format-help').getAttribute('open'),null);
  await page.locator('.format-help summary').focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('.format-help').textContent(),/checksum/);
  assert.equal(await page.locator('.format-help p').isVisible(),true);
  await page.locator('[data-external=close]').click();await page.locator('#external-lab').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-action')==='external');
  await page.evaluate(()=>scrollTo(0,0));
  await page.locator('[data-action=theme]').click();await page.screenshot({path:resolve(out,`visual-dark-${width}.png`)});
  await page.locator('[data-action=theme]').click();
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`visual-main-${width}.png`)});
  const geometry=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,
    controls:[...document.querySelectorAll('.workspace-nav .btn,.topbar .btn,.trace-tools .btn')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||e.textContent,height:b.height,left:b.left,right:b.right};})}));
  assert.ok(geometry.page<=width+1);
  assert.ok(geometry.controls.every(c=>c.height>=43.5&&c.left>=0&&c.right<=width+1));
  await page.locator('[data-action=quiz]').click();
  assert.equal(await page.locator('[data-action=parameters]').isDisabled(),true);
  assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('#inspector').isVisible(),false);
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  results.push({width,geometry,searchResetAndGroups:true,signalAndMeasurementRestored:true,keyboardAndPracticeIsolation:true,errors,warnings,build:info});
  await page.close();
 }
 await writeFile(resolve(out,'visual-workspace-results.json'),JSON.stringify({url,browser:await browser.version(),results,physicalDevice:false,clinicalValidation:false},null,2));
 console.log(JSON.stringify({visualWorkspaceFlows:results.length,errors:[]}));
} catch(error) {
 await writeFile(resolve(out,'visual-workspace-failure.json'),JSON.stringify({error:String(error.stack),results},null,2));
 for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:resolve(out,'visual-workspace-failure.png')}).catch(()=>{});
 throw error;
} finally {await browser.close();}
