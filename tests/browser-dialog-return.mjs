/** Returning to the exact reading position after a note, against the built application, including a deliberate scroll-drift control. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]??'../ECG-QA/dialog-return');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let active,failure;
const url=process.env.ECG_TEST_URL??'http://127.0.0.1:4173/';
const ready=p=>p.locator('#signal-loading').waitFor({state:'hidden'});
const geometry=p=>p.evaluate(()=>{const b=document.querySelector('#canvas-wrap').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,scrollY,doc:document.documentElement.scrollHeight};});
const pixels=p=>p.locator('#ecg').evaluate(e=>e.toDataURL());
const reference=p=>p.getByRole('button',{name:'Referencia del ST',exact:true});
// Closing is asynchronous: the close event is a later task and the focus return a microtask after it; compare only once settled.
const armClose=p=>p.evaluate(()=>{const d=document.querySelector('#dialog');window.__dialogClose={fired:false,done:new Promise(r=>d.addEventListener('close',()=>{window.__dialogClose.fired=true;queueMicrotask(()=>requestAnimationFrame(()=>r()));},{once:true}))};});
async function settleClose(p,action){await armClose(p);await action();const hiddenFirst=await p.evaluate(()=>!document.querySelector('#dialog').open&&!window.__dialogClose.fired);await p.evaluate(()=>window.__dialogClose.done);await p.locator('#dialog').waitFor({state:'hidden'});return hiddenFirst;}
async function fresh(viewport){const page=active=await browser.newPage({viewport,reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await ready(page);await page.evaluate(()=>document.fonts.ready);return page;}
async function openNote(page){const r=reference(page);await r.scrollIntoViewIfNeeded();const before=await geometry(page);await r.click();await page.locator('#dialog').waitFor({state:'visible'});assert.match(await page.locator('#dialog').innerText(),/V2–V3/);return before;}
// Negative control, not a product behaviour: the page drifts 1px while the modal is open and the geometry is unchanged.
const drift=p=>p.evaluate(()=>{const y=scrollY;scrollBy(0,y>0?-1:1);return scrollY-y;});
const closers={escape:p=>p.keyboard.press('Escape'),button:p=>p.locator('#dialog [data-action=close-dialog]').click()};
try{
 for(const viewport of [{width:320,height:568},{width:1440,height:900}]){
  const page=await fresh(viewport);
  for(const [closer,close]of Object.entries(closers)){
   const before=await openNote(page),px=await pixels(page),drifted=await drift(page);
   if(viewport.width===320)assert.notEqual(drifted,0,'the control needs a scrollable page at 320');
   const closeAsync=await settleClose(page,()=>close(page));
   assert(await reference(page).evaluate(e=>document.activeElement===e),closer+' returns focus to the opener');
   assert.deepEqual(await geometry(page),before,closer+' returns to the exact reading position');
   assert.equal(await pixels(page),px);
   results.push({viewport,closer,drifted,closeAsync});
  }
  await page.close();
 }
 // Stale anchors are never applied: a resize while the note is open, or a new opening before the first close event.
 const page=await fresh({width:320,height:568});
 const before=await openNote(page);await page.setViewportSize({width:390,height:844});
 const beforeClose=await geometry(page);assert.notEqual(beforeClose.w,before.w);
 await settleClose(page,()=>page.keyboard.press('Escape'));
 const resized=await geometry(page);assert.deepEqual(resized,beforeClose,'after a resize the page stays where the resize left it; no old anchor');
 results.push({resize:{before,beforeClose,after:resized}});
 await page.setViewportSize({width:320,height:568});
 const first=await openNote(page);assert.notEqual(await drift(page),0);const drifted=await geometry(page);
 const handle=await reference(page).elementHandle();
 await page.evaluate(b=>{document.querySelector('#dialog').close();b.click();},handle);
 assert(await page.locator('#dialog').evaluate(e=>e.open),'reopened before the first close event');
 assert.deepEqual(await geometry(page),drifted,'reopening does not scroll');
 await settleClose(page,()=>page.keyboard.press('Escape'));
 const after=await geometry(page);assert.deepEqual(after,drifted,'the second opening is the valid anchor');assert.notEqual(after.scrollY,first.scrollY,'the stale anchor is not applied');
 results.push({reopen:{first,drifted,after}});await page.close();
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,evidence:out}));if(failure)process.exitCode=1;
