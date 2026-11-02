/** Inline education: native interactions, lifecycle, source and paper preservation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {chromium} from 'playwright';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {installWorkerTap,readTrace,workerReplies} from './support/worker-tap.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/inline-reading');await mkdir(dirname(out),{recursive:true});await mkdir(out);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const browser=await chromium.launch(),results=[],errors=[];let failure,active;
const url=process.env.ECG_TEST_URL??'http://127.0.0.1:4173/';
const paper=p=>p.locator('#ecg').evaluate(e=>{const b=e.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height,png:e.toDataURL()};});
try{
 for(const view of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844,dark:true},{width:320,height:568}]){
  const page=active=await browser.newPage({viewport:{width:view.width,height:view.height},reducedMotion:'no-preference'});page.setDefaultTimeout(15000);await installWorkerTap(page);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme',dark?'dark':'light');},!!view.dark);
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert(await page.locator('#reading-education').isVisible());assert(await page.locator('#reading-lesson').isHidden());
  assert.equal(await page.locator('[data-action=teaching],#teaching-root,[data-teach]').count(),0);
  for(const id of view.width===1440?['anterior','inferior','inferior_lcx']:['anterior']){
   await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const root=page.locator('#reading-lesson');await root.locator('.lesson-echo').waitFor({state:'visible'});
   const source=await readTrace(page,{seconds:65}),before=hash(source),replies=await workerReplies(page),initial=await paper(page);
   assert.equal(await root.locator('button').count(),1);assert.equal(await root.locator('input').count(),1);assert.equal(await root.locator('select,details').count(),0);
   const slider=root.locator('input'),play=root.locator('button');await root.scrollIntoViewIfNeeded();
   assert.equal(await root.getAttribute('data-playing'),'false');
   const start=+(await root.getAttribute('data-start')),end=+(await root.getAttribute('data-end'));
   assert(start>=0&&end>start&&end<=10);assert(source.events.beats.some(b=>Math.abs(b.time-start)<1e-9));
   await slider.press('End');assert.equal(+await root.getAttribute('data-time'),end);assert.equal(await root.getAttribute('data-playing'),'false');
   assert.equal(await slider.getAttribute('aria-valuetext'),'Reposo');await slider.press('Home');
   await play.click();await page.waitForFunction(()=>{const r=document.querySelector('#reading-lesson');return +r.dataset.time>+r.dataset.start+.025;});
   await play.click();assert.equal(await root.getAttribute('data-playing'),'false');
   const time=await root.getAttribute('data-time');
   await page.locator('[data-action=theme]').click();assert.equal(await root.getAttribute('data-time'),time,'Theme must not reset lesson');
   await page.locator('[data-action=theme]').click();
   await root.scrollIntoViewIfNeeded();await play.click();
   await page.locator('[data-action=measurements]').first().click();await page.locator('#dialog[open]').waitFor();
   await page.waitForFunction(()=>document.querySelector('#reading-lesson').dataset.playing==='false');await page.keyboard.press('Escape');
   assert.deepEqual(await paper(page),initial);assert.equal(hash(await readTrace(page,{seconds:65})),before);assert.equal(await workerReplies(page),replies);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-lesson-play]').disabled);assert(await play.isDisabled());await slider.press('End');assert.equal(+await root.getAttribute('data-time'),end);await slider.press('Home');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('[data-lesson-play]').disabled);assert(await play.isEnabled());
   await root.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${id}-${view.width}-reading.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(view.width===320){
    await page.addStyleTag({content:'html {font-size:200% !important}'});await root.scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Text 200%: no page overflow');
    const r=await slider.boundingBox();assert(r.height>=44&&r.width>=100);await page.screenshot({path:resolve(out,'320-text-200.png')});
   }
   results.push({id,view,sourceHash:before,sourceAndMeasuresPreserved:true,paperStable:true,explicitMotion:true,reducedMotion:true});
  }
  // Unsupported cases have neither empty diagrams nor a notice asking for more settings.
  for(const id of view.width===1440?['sinus','af','av1','lbbb']:['af']){
   await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});
   assert.equal(await page.locator('.lesson-echo').count(),0);if(id!=='av1')assert(await page.locator('#reading-lesson').isHidden());
  }
  if(view.width===1440){
   await chooseCatalogPreset(page,'anterior');await page.locator('#signal-loading').waitFor({state:'hidden'});
   await page.locator('#reading-lesson').scrollIntoViewIfNeeded();await page.locator('[data-lesson-play]').click();
   await page.waitForFunction(()=>document.querySelector('#reading-lesson').dataset.playing==='true');
   await chooseCatalogPreset(page,'af');await page.locator('#signal-loading').waitFor({state:'hidden'});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert(await page.locator('#reading-lesson').isHidden());assert.equal(await page.locator('#reading-lesson').getAttribute('data-kind'),null);
   await chooseCatalogPreset(page,'anterior');await page.locator('#signal-loading').waitFor({state:'hidden'});
   const c=(await readTrace(page)).case;c.phase='chronic';
   await page.goto(url+'#case='+Buffer.from(JSON.stringify(c)).toString('base64url'));await page.locator('#signal-loading').waitFor({state:'hidden'});assert(await page.locator('#reading-lesson').isHidden());
   c.phase='acute';c.artifacts.reversed=true;
   await page.goto(url+'#case='+Buffer.from(JSON.stringify(c)).toString('base64url'));await page.locator('#signal-loading').waitFor({state:'hidden'});assert(await page.locator('#reading-lesson').isHidden());
   await page.locator('[data-action=quiz]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});
   assert.equal(await page.locator('#reading-education').textContent(),'');assert.equal(await page.locator('#reading-lesson').textContent(),'');assert.equal(await page.locator('#reading-lesson').getAttribute('data-kind'),null);
   await page.getByRole('button',{name:'Salir de práctica'}).click();results.push({practiceConcealed:true,reversedAndChronicExcluded:true});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);await active?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,results:results.length,errors,failure,evidence:out}));if(failure)process.exitCode=1;
