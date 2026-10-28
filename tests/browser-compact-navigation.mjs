import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,workerReplies,waitForReply} from './support/worker-tap.mjs';

const out=resolve(process.argv[2]||'../ECG-QA/compact-navigation');
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),report={cases:[],errors:[],warnings:[]};
let page,failure;
async function closeDialog(){
  await page.evaluate(()=>{window.__compactDialogClosed=false;document.querySelector('#dialog').addEventListener('close',()=>{window.__compactDialogClosed=true;},{once:true});});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__compactDialogClosed);
}
async function catalog(){
  await page.waitForFunction(()=>!document.querySelector('#catalog').inert || document.querySelector('[data-action=catalog]').getClientRects().length);
  if(await page.locator('#catalog').evaluate(e=>e.inert)){
    await page.locator('[data-action=catalog]').click();
    await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-action=catalog-index]'));
  }
}
async function fits(selector){
  const dimensions=await page.locator(selector).evaluate(e=>{
    const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:e.scrollHeight-e.clientHeight,horizontal:e.scrollWidth-e.clientWidth};
  });
  assert(dimensions.x>=-2&&dimensions.y>=-2&&dimensions.right<=dimensions.width+2&&dimensions.bottom<=dimensions.height+2,JSON.stringify(dimensions));
  assert(dimensions.scroll<=2&&dimensions.horizontal<=2,`Complete ${selector} must fit: ${JSON.stringify(dimensions)}`);
}
try{
 for(const view of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:390,height:844,dark:true},{width:320,height:568,zoom:true}]){
  page=await browser.newPage({viewport:view,reducedMotion:'reduce'});await installWorkerTap(page);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-theme',dark?'dark':'light');localStorage.setItem('ecglab-acquisition','ideal');},!!view.dark);
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG Lab/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  if(view.zoom)await page.addStyleTag({content:'html{font-size:200%!important}'});
  const skipCanvas=await page.locator('#ecg').evaluate(e=>e.toDataURL()),skipReplies=await workerReplies(page);
  for(let attempt=0;attempt<2;attempt++){
   assert.equal(await page.locator('#adjust').evaluate(e=>e.open),false);
   await page.locator('a[href="#inspector"]').focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#adjust').evaluate(e=>e.open),true,'Parameter access must reveal the folded destination');
   assert.equal(await page.locator('#inspector').evaluate(e=>e===document.activeElement),true);
   await page.keyboard.press('Tab');
   assert.equal(await page.locator('#inspector').evaluate(e=>e.contains(document.activeElement)&&document.activeElement.checkVisibility()),true,'Tab must reach a visible control');
   await page.locator('#adjust > summary').click();
   await page.locator('a[href="#case-title"]').focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#case-title').evaluate(e=>e===document.activeElement),true);
   assert.equal(await page.locator('#adjust').evaluate(e=>e.open),false,'Returning to reading must leave unrelated disclosures folded');
  }
  assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),skipCanvas);
  assert.equal(await workerReplies(page),skipReplies,'Skip navigation must not generate a signal');
  await catalog();
  // Compare stable geometry after the optional webfont has loaded or fallen back.
  await page.evaluate(() => document.fonts.ready);
  if(view.width<=800){
   const bounds=await page.locator('#catalog').boundingBox();
   const clip={x:Math.ceil(bounds.x)+1,y:Math.ceil(bounds.y)+1,width:Math.floor(bounds.width)-2,height:Math.floor(bounds.height)-2};
   const visible=await page.screenshot({clip});
   // Independent paint oracle: hiding the background cannot change an opaque drawer.
   const hiddenBackground=await page.addStyleTag({content:'.workspace{visibility:hidden!important}'});
   const opaque=await page.screenshot({clip});await hiddenBackground.evaluate(e=>e.remove());
   assert(visible.equals(opaque),'Background tools must not paint over the open mobile catalogue');
  }
  const catalogClose=page.locator('[data-action=close-catalog]');
  if(await catalogClose.isVisible()){
   const closeBox=await catalogClose.evaluate(e=>{const r=e.getBoundingClientRect();return {right:r.right,overflow:e.scrollWidth-e.clientWidth};});
   assert(closeBox.right<=view.width+1 && closeBox.overflow<=1,JSON.stringify(closeBox));
   assert.equal(await catalogClose.getAttribute('aria-label'),'Cerrar');
  }
  const index = page.locator('#catalog-families');
  assert.equal(await index.isVisible(),false,'Start with the current case, not another navigation decision');
  assert.equal(await page.locator('#catalog-family-title').innerText(),'Sinusal y auricular');
  assert.equal(await page.locator('#case-list [data-preset="sinus"][aria-current=true]').isVisible(),true);
  assert.equal(await page.locator('[data-action=catalog-index]').getAttribute('aria-label'),'Casos: volver a familias');
  const headerButtons=await page.locator('.sidebar-head button').count();
  const originalCanvas=await page.locator('#ecg').evaluate(e=>e.toDataURL());
  await page.screenshot({path:resolve(out,`navigation-${view.width}-${view.height}-${view.dark?'dark':view.zoom?'zoom':'light'}.png`)});
  await page.locator('[data-action=catalog-index]').click();
  assert.equal(await index.locator('[aria-pressed=true]').evaluate(e=>e===document.activeElement),true);
  const families = await index.locator('button').evaluateAll(es=>es.map(e=>e.dataset.catalogFamily));
  assert.equal(families.length,9);
  const indexBefore = await index.boundingBox(), postsBefore = await workerReplies(page);
  if(!view.zoom && view.height>=568)await fits('#catalog-families');
  for(const family of families){
   if(!await index.isVisible())await page.locator("[data-action=catalog-index]").click();
   if(!view.zoom && view.height>=568)assert.deepEqual(await index.boundingBox(),indexBefore);
   const button = page.locator(`[data-catalog-family="${family}"]`);
   await button.focus();await page.keyboard.press('Enter');
   assert.equal(await button.getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-action=catalog-index]').evaluate(e=>e===document.activeElement),true);
   assert.equal(await workerReplies(page),postsBefore,'Changing category must not generate a signal');
   assert.equal(await index.locator('button[aria-pressed=true]').count(),1);
   const visible = await page.locator('.case-group').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.dataset.indexFamily));
   assert(visible.length>0 && visible.every(id=>id===family));
   assert.equal(await index.isVisible(),false);
   if(!view.zoom && view.height>=568)await fits('#case-list');
  }
  await page.screenshot({path:resolve(out,`index-${view.width}-${view.height}-${view.dark?'dark':view.zoom?'zoom':'light'}.png`)});
  assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),originalCanvas,'Browsing families must leave the ECG untouched');
  assert.equal(await page.locator('.sidebar-head button').count(),headerButtons,'Navigation must reuse the existing controls');
  if(!await index.isVisible())await page.locator('[data-action=catalog-index]').click();
  await page.locator('[data-catalog-family="Isquemia y ST"]').click();
  assert.deepEqual(await page.locator('.ischemia-library .family-result-title').allTextContents(),['Territorios','Patrones sutiles','Evolución y reperfusión','Imitadores']);
  assert.equal(await page.locator('.ischemia-library .case-group-count').count(),0);
  const route=[['OMI evidente','anterior'],['OMI evidente','posterior'],['OMI sutil','de_winter'],['OMI sutil','sgarbossa'],['NOMI','diffuse'],['NOMI','wellens_a'],['Imitadores','pericarditis'],['Imitadores','hyperk']];
  for(const [family,id] of route){
   await catalog();
   const group=page.locator(`.ischemia-library [data-family="${family}"]`);
   if(!await index.isVisible())await page.locator('[data-action=catalog-index]').click();
   await page.locator('[data-catalog-family="Isquemia y ST"]').focus(); await page.keyboard.press('Enter');
   assert.equal(await group.isVisible(),true);
   const n=await workerReplies(page);await group.locator(`[data-preset="${id}"]`).click();await waitForReply(page,n);await page.locator('#signal-loading').waitFor({state:'hidden'});
   assert(await page.locator(`[data-preset="${id}"][aria-current=true]`).count()>0);
   if(view.width===1440&&id==='anterior'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,'library-desktop.png')});}
   const opener=page.locator('[data-reading-segment="7"]');await opener.click();
   assert.equal(await page.locator('#lead-explorer').getAttribute('data-lead'),'V2');
   assert.equal(await page.locator('.reading-lead-arrow,.lead-detail-time,.lead-detail-orientation,.lead-detail-limit').count(),0);
   assert.doesNotMatch(await page.locator('#dialog').innerText(),/del registro|QRS \d+ del modelo|Orientación anatómica|Observa la forma/);
   if(!view.zoom){await fits('#dialog');await fits('.lead-detail-scroll');}
   const close=page.getByRole('button',{name:'Cerrar',exact:true});assert.equal(await close.isVisible(),true);
   if(id==='anterior')await page.screenshot({path:resolve(out,`lead-${view.width}-${view.height}-${view.dark?'dark':view.zoom?'zoom':'light'}.png`)});
   await closeDialog();assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
   report.cases.push({...view,id,completeDialog:!view.zoom});
   await writeFile(resolve(out,'progress.json'),JSON.stringify(report.cases));
  }
  // Search still reaches the exact variant after navigation, and resets cleanly.
  await catalog();await page.locator('#case-search').fill('Wellens B');assert.equal(await page.locator('#case-list [data-preset="wellens_b"]').count(),1);
  assert.equal(await index.locator('button').count(),9);
  assert.equal(await index.locator('[aria-pressed=true]').count(),0);
  await page.locator('[data-action=clear-search]').click();assert.equal(await page.locator('.ischemia-library .case-group').count(),4);
  // Search is a route to an actual case, not a sticky filter hiding its siblings.
  await page.locator('#case-search').fill('af_slow');
  const beforeSelection=await workerReplies(page);
  await page.locator('#case-list [data-preset="af_slow"]').click();await waitForReply(page,beforeSelection);
  await catalog();
  assert.equal(await page.locator('#case-search').inputValue(),'');
  assert.equal(await page.locator('#catalog-family-title').innerText(),'Sinusal y auricular');
  assert.equal(await page.locator('#case-list [data-preset="af_slow"][aria-current=true]').isVisible(),true);
  assert.equal(await page.locator('#variant-tab-af_slow').getAttribute('aria-selected'),'true');
  const afterSelection=await workerReplies(page);
  await page.locator('#case-search').fill('Wellens B');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#case-search').inputValue(),'');
  assert.equal(await page.locator('#catalog').evaluate(e=>e.inert),false,'Clearing a search must not also close the mobile drawer');
  assert.equal(await page.locator('#case-list [data-preset="af_slow"][aria-current=true]').isVisible(),true);
  if(await page.locator('#catalog').evaluate(e=>e.classList.contains('open'))){
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>document.querySelector('#catalog').inert);
   assert.equal(await page.locator('[data-action=catalog]').evaluate(e=>e===document.activeElement),true);
   await catalog();
  }
  // Return from a search opened at the index must return to the index as well.
  await page.locator('[data-action=catalog-index]').click();
  await page.locator('#case-search').fill('Wellens B');
  await page.locator('[data-action=catalog-index]').click();
  assert.equal(await index.isVisible(),true);
  assert.equal(await index.locator('[aria-pressed=true]').evaluate(e=>e===document.activeElement),true);
  assert.equal(await workerReplies(page),afterSelection,'Returning and clearing search must not regenerate a case');
  if(await page.locator('#catalog').evaluate(e=>e.classList.contains('open')))await page.locator('[data-action=close-catalog]').click();
  await page.locator('[data-action=about]').click();
  if(!view.zoom)await fits('#dialog');
  assert.equal(await page.locator('.information-section[open]').count(),0);await closeDialog();
  await page.locator('[data-action=export]').click();
  if(!view.zoom)await fits('#dialog');
  assert.equal(await page.locator('.local-case-storage').evaluate(e=>e.open),false);
  await page.locator('.local-case-storage > summary').click();await page.locator('#save-name').fill('Ensayo de navegación');
  assert.equal(await page.locator('#save-name').inputValue(),'Ensayo de navegación');await closeDialog();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(e){failure=String(e.stack||e);if(page&&!page.isClosed())await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({...report,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:report.cases.length,failure,evidence:out}));if(failure)process.exitCode=1;
