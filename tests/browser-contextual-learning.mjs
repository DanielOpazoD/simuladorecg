/** Coordinator's browser checks: teaching copy never owns samples or measurements. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/contextual-learning-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let active,failure;
const ready=p=>p.locator('#signal-loading').waitFor({state:'hidden'});
const education=p=>p.locator('#reading-education').textContent();
async function audit(p){
 await p.addInitScript(()=>{
  const Native=window.Worker;window.__contextWorkers=[];window.__holdTeaching=false;window.__heldTeaching=[];
  window.__releaseTeaching=()=>{const q=window.__heldTeaching.splice(0);for(const f of q)f();};
  window.Worker=class extends Native{
   constructor(...args){super(...args);this.audit={posts:0,last:null,requests:new Map()};window.__contextWorkers.push(this.audit);this.addEventListener('message',e=>{if(!e.data?.signal)return;this.audit.last={c:this.audit.requests.get(e.data.id),data:e.data};});}
   postMessage(m,...args){this.audit.posts++;if(m?.ecg)this.audit.requests.set(m.id,structuredClone(m.ecg));return super.postMessage(m,...args);}
   set onmessage(fn){super.onmessage=fn?e=>{if(window.__holdTeaching)window.__heldTeaching.push(()=>fn.call(this,e));else fn.call(this,e);}:null;}
  };
 });
}
const snapshot=p=>p.evaluate(async()=>{
 const worker=window.__contextWorkers[0],{signal,measurement}=worker.last.data;
 const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof x==='string'?new TextEncoder().encode(x):x))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const e=document.querySelector('#ecg'),r=e.getBoundingClientRect();
 return {posts:worker.posts,samples:await Promise.all(Object.entries(signal.leads).map(async([l,a])=>[l,await hash(new Uint8Array(a.buffer,a.byteOffset,a.byteLength))])),metadata:await hash(JSON.stringify({events:signal.events,truth:signal.truth,measurement})),paper:await hash(e.toDataURL()),geometry:{x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}};
});
async function choose(p,id){await chooseCatalogPreset(p,id);await ready(p);}
async function close(p){await p.keyboard.press('Escape');await p.locator('#dialog').waitFor({state:'hidden'});}
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const p=active=await browser.newPage({viewport,reducedMotion:'reduce'});p.setDefaultTimeout(15000);await audit(p);
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.addInitScript(()=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme','light');});
  await p.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await ready(p);await p.evaluate(()=>document.fonts.ready);
  assert.match(await p.title(),/ECG Lab/);assert.equal(await p.locator('vite-error-overlay').count(),0);
  for(const id of ['rbbb','lbbb']){
   await choose(p,id);const text=await education(p);assert(text.length<=450&&text.length>40);assert.match(text,/V1|V6/);
   const before=await snapshot(p);
   await p.locator('[data-action=compare]').click();await p.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
   await p.locator('#comparison-reference').selectOption('sinus');await p.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
   const prompt=p.locator('#comparison-prompt');assert(await prompt.isVisible());assert.match(await prompt.innerText(),/QRS|V1|V6/);
   assert.equal(await p.locator('.case-comparison select').count(),1);
   await p.locator('#comparison-reference').selectOption(id);await p.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
   assert(await prompt.isHidden());assert.equal(await prompt.textContent(),'');
   await p.locator('#comparison-reference').selectOption('af');await p.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();assert(await prompt.isHidden());assert.equal(await prompt.textContent(),'');
   await close(p);assert.deepEqual(await snapshot(p),before,'Comparison teaches without changing the main65s/measurements/paper');
   await p.locator('#reading-details').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,`${id}-${viewport.width}.png`)});
   results.push({viewport,id,brief:true,comparisonPreserved:true,excludedPairs:true});
  }
  if(viewport.width===1440){
   for(const [key,value]of [['hr','90'],['pr','190'],['axis','-35'],['qrs','125'],['qtc','440'],['conduction','rbbb']]){
    await choose(p,'sinus');const ordinary=await education(p);
    await p.evaluate(()=>window.__holdTeaching=true);
    if(key==='conduction')await p.locator('#quick-adjust [data-key=conduction]').selectOption(value);
    else{const input=p.locator(`#quick-adjust [data-quick-number=${key}]`);await input.fill(value);await input.press('Tab');}
    await p.waitForFunction(()=>window.__heldTeaching.length>0);
    assert.equal(await education(p),'','New teaching must wait for the published result');
    await p.evaluate(()=>{window.__holdTeaching=false;window.__releaseTeaching();});await ready(p);
    const text=await education(p);assert(text.length>0&&text.length<=450);assert.notEqual(text,ordinary,`Feedback for ${key} must explain the actual edit`);
    const before=await snapshot(p),kept=text;
    await p.locator('.paper-menu > summary').click();await p.locator('[data-key="view.grid"]').uncheck();await p.locator('[data-key="view.grid"]').check();await p.keyboard.press('Escape');
    assert.equal(await education(p),kept);assert.deepEqual(await snapshot(p),before);
    const draft=p.locator('#quick-adjust [data-quick-number=hr]');await draft.fill('');await draft.press('Tab');assert.equal(await education(p),kept);assert.deepEqual(await snapshot(p),before);
    results.push({key,feedbackAfterPublishOnly:true,viewAndInvalidDraftPreserve:true});
   }
   // Hold one valid reply, then choose a different case before delivery.
   await choose(p,'sinus');await p.evaluate(()=>window.__holdTeaching=true);
   const input=p.locator('#quick-adjust [data-quick-number=pr]');await input.fill('210');await input.press('Tab');await p.waitForFunction(()=>window.__heldTeaching.length>0);
   await chooseCatalogPreset(p,'rbbb');await p.evaluate(()=>{window.__holdTeaching=false;window.__releaseTeaching();});await ready(p);
   assert.equal(await p.locator('#case-title').innerText(),'Bloqueo de rama derecha');assert(!/210/.test(await education(p)),'A late edit must not narrate the newly selected case');
   results.push({retiredEditCannotNarrateAnotherCase:true});
  }
  await choose(p,'anterior');
  const order=await p.evaluate(()=>{const a=document.querySelector('#structured-description'),b=document.querySelector('#reading-lesson');return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);});assert(order,'Electrical description precedes contraction in DOM and visual reading');
  const beforeEcho=await snapshot(p),slider=p.locator('#lesson-echo-time');await slider.scrollIntoViewIfNeeded();await slider.press('End');await slider.press('Home');assert.deepEqual(await snapshot(p),beforeEcho);
  await choose(p,'wenckebach');assert.equal(await p.locator('#reading-lesson').getAttribute('data-kind'),'av');
  assert(await p.evaluate(()=>!!(document.querySelector('#reading-lesson').compareDocumentPosition(document.querySelector('#structured-description'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  await p.getByRole('button',{name:'Practicar',exact:true}).click();await ready(p);assert.equal(await education(p),'');assert.equal(await p.locator('#reading-lesson').textContent(),'');assert.equal(await p.locator('#reading-details').isVisible(),false);
  results.push({viewport,electricalFirst:true,avOrderPreserved:true,echoReadOnly:true,quizConcealed:true});await p.close();
 }
 assert.deepEqual(errors,[]);
}catch(error){failure=String(error.stack??error);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,evidence:out}));if(failure)process.exitCode=1;
