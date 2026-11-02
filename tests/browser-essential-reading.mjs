/** Simplification contracts: layout, source preservation and no signal work for reading. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,workerReplies} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {openControlPanel} from './support/adjust-panel.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/essential-reading');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let active,failure;
const ready=p=>p.locator('#signal-loading').waitFor({state:'hidden'});
const paper=p=>p.locator('#ecg').evaluate(e=>({pixels:e.toDataURL(),x:e.getBoundingClientRect().x+scrollX,y:e.getBoundingClientRect().y+scrollY,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));
async function source(p){await p.locator('[data-action=about]').click();await p.getByText('Referencias y atribución',{exact:true}).click();assert.equal(await p.locator('.information-content > details').count(),3);}
async function close(p){await p.keyboard.press('Escape');await p.locator('#dialog').waitFor({state:'hidden'});}
try{
 for(const view of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:900,dark:true,text:200},{width:320,height:844,text:200}]){
  const page=active=await browser.newPage({viewport:{width:view.width,height:view.height},reducedMotion:'reduce'});
  await installWorkerTap(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(dark=>localStorage.setItem('ecglab-theme',dark?'dark':'light'),!!view.dark);
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await ready(page);await page.evaluate(()=>document.fonts.ready);
  if(view.text)await page.addStyleTag({content:':root{font-size:200%!important}'});
  assert.equal(await page.locator('[data-key=acquisition]').count(),1);
  assert.equal(await page.locator('.view-options [data-key=acquisition],.view-options [data-action=teaching]').count(),0);
  assert.equal(await page.locator('[data-action=teaching]').count(),0);
  assert.deepEqual(await page.locator('#structured-description dt').allTextContents(),['Ritmo','Intervalos','Eje','ST','T','Q']);
  const description=await page.locator('#structured-description').evaluate(root=>{
   const r=root.getBoundingClientRect();return [...root.querySelectorAll('dt,dd')].map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,x:b.x,left:r.left,right:b.right,limit:r.right,overflow:e.scrollWidth-e.clientWidth};});
  });
  assert(description.every(r=>r.x>=r.left-1&&r.right<=r.limit+1&&r.overflow<=1),JSON.stringify(description));
  if(view.width>360){const xs=description.filter(r=>r.tag==='DD').map(r=>r.x);assert(Math.max(...xs)-Math.min(...xs)<1,'Description columns align');}
  const before=await paper(page),replies=await workerReplies(page);
  await openControlPanel(page,'signal');
  const hitboxes=await page.evaluate(()=>{
   const a=document.querySelector('#adjust > summary').getBoundingClientRect();
   return {height:a.height,right:a.right,width:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert(hitboxes.height>=44&&hitboxes.right<=hitboxes.viewport+1,JSON.stringify(hitboxes));assert(hitboxes.width<=hitboxes.viewport+1,JSON.stringify(hitboxes));
  assert.equal(await page.locator('[data-key=acquisition]').inputValue(),'ideal');
  await page.screenshot({path:resolve(out,`adjust-${view.width}-${view.text??100}.png`)});
  await page.locator('#adjust > summary').click();assert.deepEqual(await paper(page),before);assert.equal(await workerReplies(page),replies);
  if(view.width===1440){
   await chooseCatalogPreset(page,'anterior');await ready(page);
   const compact=page.locator('#omi-sheet');
   assert.equal(await compact.locator('h3,.omi-note,details').count(),0);
   assert.deepEqual(await compact.locator('dt').allTextContents(),['Escenario','Clave de lectura','Cuidado']);
   const context=await compact.locator('.omi-sheet-escenario p').allTextContents(),caution=await compact.locator('.omi-sheet-cuidado p').allTextContents();
   const image=await paper(page),n=await workerReplies(page);
   await source(page);assert.equal(await page.locator('#dialog .omi-note').count(),3);
   const full=await page.locator('#dialog .omi-sheet').innerText();context.concat(caution).forEach(t=>assert(full.includes(t)));
   assert(await page.locator('#dialog .omi-sheet').getByText('ECG',{exact:true}).isVisible());
   await close(page);assert.deepEqual(await paper(page),image);assert.equal(await workerReplies(page),n);
   await page.locator('#structured-description [data-action=st-reference]').click();
   assert.equal(await page.locator('.dialog-head .st-reference-actions').count(),0);
   await page.locator('#dialog [data-action=st-zoom]').click();await page.locator('.st-zoom').waitFor();await close(page);
   assert(await page.locator('#structured-description [data-action=st-reference]').evaluate(e=>document.activeElement===e));
   assert.deepEqual(await paper(page),image);assert.equal(await workerReplies(page),n);
   await openControlPanel(page,'base');await page.locator('[data-key=hr]').press('ArrowRight');await ready(page);
   assert.equal(await page.locator('#case-title').innerText(),'Exploración personalizada');assert.equal(await compact.locator('.omi-sheet').count(),0);
   await source(page);assert.equal(await page.locator('#dialog .omi-sheet').count(),0);await close(page);
   await chooseCatalogPreset(page,'anterior');await ready(page);await openControlPanel(page,'signal');await page.locator('[data-key="artifacts.reversed"]').check();await ready(page);
   assert.equal(await compact.locator('.omi-sheet').count(),0);await source(page);assert.equal(await page.locator('#dialog .omi-sheet').count(),0);await close(page);
   await page.getByRole('button',{name:'Practicar',exact:true}).click();await ready(page);
   assert.equal(await compact.locator('.omi-sheet').count(),0);await source(page);assert.equal(await page.locator('#dialog .omi-sheet').count(),0);await close(page);
   assert.equal(await page.locator('[data-key=acquisition]').count(),1);
   assert.equal(await page.locator('.view-options [data-key=acquisition]').count(),1);
   assert.equal(await page.locator('#inspector [data-key=acquisition]').count(),0);
   await page.locator('#quiz-panel [data-answer]').first().click();
   assert.equal(await page.locator('[data-key=acquisition]').count(),1);
   assert.equal(await page.locator('.view-options [data-key=acquisition]').count(),1);
   const quizReplies=await workerReplies(page);
   await page.getByRole('button',{name:'Salir de práctica'}).click();
   assert.equal(await page.locator('[data-key=acquisition]').count(),1);
   assert.equal(await page.locator('#inspector [data-key=acquisition]').count(),1);
   assert.equal(await page.locator('.view-options [data-key=acquisition]').count(),0);
   assert.equal(await workerReplies(page),quizReplies,'Leaving practice only relocates its control');
   // A physiological edit exits answered practice through another route.
   await page.getByRole('button',{name:'Practicar',exact:true}).click();await ready(page);
   await page.locator('#quiz-panel [data-answer]').first().click();
   await openControlPanel(page,'conduction');
   const rhythm=page.locator('[data-key=rhythm]');await rhythm.selectOption(await rhythm.inputValue()==='sinus'?'junctional':'sinus');await ready(page);
   assert(await page.locator('#quiz-panel').isHidden());
   assert.equal(await page.locator('[data-key=acquisition]').count(),1);
   assert.equal(await page.locator('#inspector [data-key=acquisition]').count(),1);
   results.push({sourceGates:['unaltered','custom','reversed','quiz'],sourceNotesPreserved:true,stZoomReturnsFocus:true});
  }
  results.push({view,columnsAligned:true,secondaryActionsDoNotOverlap:true,paperUnchanged:true});await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,evidence:out}));if(failure)process.exitCode=1;
