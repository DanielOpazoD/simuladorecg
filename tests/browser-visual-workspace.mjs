import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
import { installWorkerTap, readTrace, settledTrace } from './support/worker-tap.mjs';
/** Simplified workspace: same production app and numerical objects, not a screenshot mock.
 * Library accordion, folded «Ajustar el caso», conditional tools and the reading guide
 * below the trace. Existing fidelity, manual-caliper and cross-engine checks remain mandatory.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
  await installWorkerTap(page);
  const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
  const openCatalog=async()=>{if(width<=800){await page.locator('[data-action=catalog]').click();await page.getByRole('dialog',{name:'Biblioteca de patrones'}).waitFor();}};
  const openFamilies=()=>page.locator('.case-group').evaluateAll(es=>es.filter(e=>e.open).map(e=>e.dataset.family));
  const visibleTools=()=>page.locator('.trace-tools .btn').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.dataset.action));
  await page.goto(url);await ready();
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const info=await(await page.request.get(new URL('build-info.json',url).href)).json();
  if(process.env.ECG_EXPECT_COMMIT)assert.equal(info.commit,process.env.ECG_EXPECT_COMMIT);
  assert.equal(info.dirty,false);
  // The retired workspaces stay retired: no navigation bar, examiner, comparator, signal reader or family selector.
  for(const gone of ['.workspace-nav','#beat-detail','#comparison-lab','#external-lab','#category','[data-action=compare]','[data-action=external]','[data-action=activation]','[data-action=focus]'])
   assert.equal(await page.locator(gone).count(),0,gone+' must not exist');
  // Tools appear only where they apply: on the 12-lead paper the freeze control and the
  // acute-lesion lenses (previous ECG, only the change) are hidden; Calibres, Ondas and ST remain.
  assert.deepEqual(await visibleTools(),['caliper','annotations','lens-st']);
  for(const hidden of ['pause','lens-previous','lens-change'])assert.equal(await page.locator(`[data-action=${hidden}]`).isHidden(),true,hidden+' hidden on a case without that tool');
  // Reading guide sits under the trace; «Ajustar el caso» is folded at the end.
  const order=await page.evaluate(()=>{
   const top=s=>document.querySelector(s).getBoundingClientRect();
   return {trace:top('.trace-panel').bottom,guide:top('.reading-guide').top,guideBottom:top('.reading-guide').bottom,adjust:top('#adjust').top,adjustOpen:document.querySelector('#adjust').open,
    inspectorVisible:document.querySelector('#inspector').checkVisibility(),tabs:[...document.querySelectorAll('#inspector [role=tab]')].map(t=>t.dataset.panel+':'+t.getAttribute('aria-selected'))};
  });
  assert.ok(order.guide>=order.trace-1,'Reading guide below the trace: '+JSON.stringify(order));
  assert.ok(order.adjust>=order.guideBottom-1,'Adjust panel after the reading guide: '+JSON.stringify(order));
  assert.equal(order.adjustOpen,false);assert.equal(order.inspectorVisible,false);
  assert.deepEqual(order.tabs,['conduction:true','base:false','st:false','signal:false'],'Ritmo is the default tab');
  // Signal and measurements are read from the worker's own reply, before and after catalogue navigation.
  const original=await readTrace(page);
  assert.equal(original.case.presetId,'sinus');assert.ok(original.measurement.hr>0);
  await openCatalog();
  // The library lists only examples that exist: 42 patterns (45 entries; imitators and the
  // electrolyte pattern are also cross-listed in the family they mimic or share).
  assert.equal(await page.locator('#case-list [data-preset]').count(),45);
  assert.equal(await page.locator('#case-list [data-preset]:disabled').count(),0);
  assert.equal(await page.locator('#catalog-count').textContent(),'42 patrones · 63 ejemplos');
  assert.equal(await page.locator('.case-group').count(),12);
  // Accordion: only the family of the case shown is open; the reader opens others by hand.
  assert.deepEqual(await openFamilies(),['Ritmos']);
  const conduction=page.locator('.case-group[data-family="Conducción intraventricular"]');
  assert.equal(await conduction.evaluate(e=>e.open),false);
  await conduction.locator('summary').click();
  assert.deepEqual(await openFamilies(),['Ritmos','Conducción intraventricular']);
  assert.deepEqual(await conduction.locator('.case-subgroup').allTextContents(),['Ramas','Fascículos y combinaciones','Preexcitación']);
  assert.equal(await conduction.locator('[data-preset]').count(),5);
  assert.equal(await conduction.locator('[data-preset]').first().isVisible(),true);
  assert.equal(await conduction.locator('.case-group-count').textContent(),'5');
  await conduction.locator('summary').click();
  assert.deepEqual(await openFamilies(),['Ritmos']);
  // Searching opens every family with matches.
  await page.locator('#case-search').fill('FA');
  assert.deepEqual((await page.locator('[data-preset]').evaluateAll(es=>es.map(e=>e.dataset.preset))).sort(),['af']);
  assert.equal(await page.locator('#catalog-count').textContent(),'1 patrón · 3 ejemplos');
  await page.locator('#case-search').fill('bloqueo');
  assert.ok(await page.locator('.case-group').count()>1);
  assert.equal(await page.locator('.case-group:not([open])').count(),0,'Every family found while searching is open');
  await page.locator('#case-search').fill('FIBRILACIÓN');assert.equal(await page.locator('[data-preset=af]').count(),1);
  await page.locator('#case-search').fill('LBBB');await page.locator('[data-preset=lbbb]').click();await ready();
  assert.match(await page.locator('#case-title').textContent(),/rama izquierda/i);
  if(width<=800){assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);assert.equal(await page.locator('#case-title').evaluate(e=>e===document.activeElement),true);}
  await openCatalog();await page.locator('[data-action=clear-search]').click();
  // The family of the new case opens by itself once the search is cleared.
  assert.ok((await openFamilies()).includes('Conducción intraventricular'));
  assert.equal(await page.locator('[data-preset=lbbb]').getAttribute('aria-current'),'true');
  await page.locator('#case-search').fill('zzzz-inexistente');assert.equal(await page.locator('.catalog-empty').isVisible(),true);
  assert.equal(await page.locator('#catalog-count').textContent(),'0 patrones · 0 ejemplos');
  await page.locator('[data-action=clear-search]').click();
  assert.equal(await page.locator('[data-preset]').count(),45);
  assert.equal(await page.locator('#case-list button:disabled').count(),0,'Examples not yet available are not listed');
  await page.locator('#case-search').fill('Brugada');assert.equal(await page.locator('.catalog-empty').isVisible(),true);
  await page.locator('[data-action=clear-search]').click();
  await page.screenshot({path:resolve(out,`visual-catalog-${width}.png`)});
  // Returning to the first example restores its complete signal and measurements.
  const restored=await settledTrace(page,()=>chooseCatalogPreset(page,'sinus'));
  assert.deepEqual(restored.case,original.case,'Restoring sinus must restore the case');
  assert.deepEqual(restored.leads,original.leads,'Restoring sinus must restore the full signal');
  assert.deepEqual(restored.measurement,original.measurement,'Restoring sinus must restore the measurements');
  // «Ajustar» opens the folded panel and moves focus to it.
  await page.locator('[data-action=parameters]').click();
  assert.equal(await page.locator('#adjust').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#inspector').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('[data-control-panel=conduction]').isVisible(),true);
  await page.locator('[data-panel=conduction]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-panel=base]').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('[data-control-panel=base]').isVisible(),true);
  assert.equal(await page.locator('[data-control-panel=conduction]').isHidden(),true);
  await page.screenshot({path:resolve(out,`visual-parameters-${width}.png`)});
  // Native dialog from the toolbar: opened and closed by keyboard, focus returns to its opener.
  await page.locator('.topbar [data-action=about]').focus();await page.keyboard.press('Enter');
  await page.getByRole('dialog',{name:'Modelo, alcance y referencias'}).waitFor();
  await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-action')==='about');
  await page.evaluate(()=>scrollTo(0,0));
  await page.locator('[data-action=theme]').click();await page.screenshot({path:resolve(out,`visual-dark-${width}.png`)});
  await page.locator('[data-action=theme]').click();
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`visual-main-${width}.png`)});
  const geometry=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,
    controls:[...document.querySelectorAll('.topbar .btn,.case-state .btn,.trace-tools .btn')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||e.textContent,height:b.height,left:b.left,right:b.right};})}));
  assert.ok(geometry.page<=width+1);
  assert.ok(geometry.controls.length>=6);
  assert.ok(geometry.controls.every(c=>c.height>=43.5&&c.left>=0&&c.right<=width+1),JSON.stringify(geometry.controls.filter(c=>c.height<43.5||c.left<0||c.right>width+1)));
  // Practice isolates the workspace: no parameters, no library, no folded panel.
  await page.locator('[data-action=quiz]').click();
  assert.equal(await page.locator('[data-action=parameters]').isDisabled(),true);
  assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('#adjust').isVisible(),false);
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
