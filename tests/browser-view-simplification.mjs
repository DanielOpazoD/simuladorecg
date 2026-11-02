/** Menu geometry and contextual reading against the actual built application. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {installWorkerTap,workerReplies,waitForReply} from './support/worker-tap.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/view-simplification');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let active,failure;
const url=process.env.ECG_TEST_URL??'http://127.0.0.1:4173/';
const ready=p=>p.locator('#signal-loading').waitFor({state:'hidden'});
const geometry=p=>p.evaluate(()=>{const b=document.querySelector('#canvas-wrap').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,scrollY,doc:document.documentElement.scrollHeight};});
async function importCase(page,c){const n=await workerReplies(page);await page.locator('#file-input').setInputFiles({name:'case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});await waitForReply(page,n);}
try {
 for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  const page=active=await browser.newPage({viewport,reducedMotion:'reduce'});await installWorkerTap(page);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await ready(page);await page.evaluate(()=>document.fonts.ready);
  const c=await page.evaluate(()=>window.__ecgTap.last.ecg);assert.equal(c.view.format,'3x4+1');assert.equal(c.acquisition,'ideal');
  assert.equal(await page.locator('#reading-details > h3').innerText(),'Explicación');
  assert(await page.locator('#structured-description').isVisible());assert.equal(await page.locator('#reading-details > summary,[data-action=present-30]').count(),0);
  assert.equal(await page.locator('#inspector .control-limits').count(),0);
  assert(!(await page.locator('#structured-description dt').allTextContents()).includes('Ref. ST'));
  assert.equal(await page.locator('#trace-calibration').evaluate(e=>getComputedStyle(e).textAlign),'right');
  assert.equal(await page.locator('[data-mode=rhythm],[data-action=annotations],[data-key=filter],.view-settings,.view-aids').count(),0);
  const before=await geometry(page),pixels=await page.locator('#ecg').evaluate(e=>e.toDataURL()),n=await workerReplies(page);
  await page.locator('.paper-menu > summary').click();
  assert.deepEqual(await geometry(page),before,'Opening Vista must not move the ECG or extend the page');
  const menu=await page.locator('.view-options').evaluate(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,overflow:e.scrollHeight-e.clientHeight};});
  assert(menu.x>=0&&menu.y>=0&&menu.right<=viewport.width+1&&menu.bottom<=viewport.height+1,JSON.stringify(menu));assert(menu.overflow<=1,'No scrolling inside Vista at standard sizes');
  assert.deepEqual(await page.locator('[data-key="view.format"] option').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>e.value)),['3x4+1','6x2','12x1']);
  assert.equal(await page.locator('.view-tabs [role=tab]').count(),2);
  await page.screenshot({path:resolve(out,`vista-${viewport.width}.png`)});
  await page.keyboard.press('Escape');assert.deepEqual(await geometry(page),before);
  assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),pixels);assert.equal(await workerReplies(page),n);
  await page.locator('#ecg').focus();await page.keyboard.press('r');assert.equal(await page.locator('[data-mode=paper]').getAttribute('aria-selected'),'true');assert.equal(await workerReplies(page),n);
  const reference=page.getByRole('button',{name:'Referencia del ST',exact:true});await reference.scrollIntoViewIfNeeded();
  const beforeReference=await geometry(page);await reference.click();await page.locator('#dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#dialog').innerText(),/V2–V3.*2 mm.*varón/);
  const dialog=await page.locator('#dialog').evaluate(e=>({scroll:e.scrollHeight-e.clientHeight,h:e.getBoundingClientRect().height}));
  assert(dialog.scroll<=1&&dialog.h<=viewport.height,'The reference is a short note without scrolling');
  await page.screenshot({path:resolve(out,`reference-${viewport.width}.png`)});
  await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});
  assert(await reference.evaluate(e=>document.activeElement===e));assert.deepEqual(await geometry(page),beforeReference);
  assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),pixels);assert.equal(await workerReplies(page),n);
  if(viewport.width===1440){
   // Scope of controls is about the implemented rhythm, not a clinical prohibition.
   for(const [rhythm,hidden,visible]of [
    ['sinus',['atrialRate'],['hr','pr','qrs']],['af',['pr','pAmp','pAxis','variability'],['hr','qrs']],
    ['flutter',['hr','pr','variability'],['atrialRate','flutterRatio']],['vt',['pr','axis','conduction'],['hr','atrialRate']],
    ['vf',['hr','pr','qrs','qtc','ischemia','phase','stShape','overload','septalQ'],['rhythm']],
    ['asystole',['hr','pr','qrs','qtc','ischemia','phase','stShape','overload','septalQ'],['rhythm']]
   ]){
    await importCase(page,{...c,rhythm});if(!await page.locator('#adjust').evaluate(e=>e.open))await page.locator('#adjust > summary').click();
    const seen=new Set();for(const tab of ['conduction','base','st','signal']){
     await page.locator(`[data-panel="${tab}"]`).click();
     // The six common parameters now live in the quick editor; secondary
     // parameters remain in the inspector. Check the visible editing surface.
     const fields=await page.locator('#quick-adjust [data-key], #inspector [data-key]').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>({key:e.dataset.key,disabled:e.disabled})));
     assert(fields.every(e=>!e.disabled),'No disabled controls shown in '+rhythm);fields.forEach(e=>seen.add(e.key));
    }
    hidden.forEach(key=>assert(!seen.has(key),rhythm+' must hide '+key));visible.forEach(key=>assert(seen.has(key),rhythm+' must retain '+key));
    results.push({rhythm,visible:[...seen]});
   }
   await importCase(page,c);await page.locator('[data-panel=conduction]').click();await page.locator('#adjust').scrollIntoViewIfNeeded();
   await page.locator('#toast.visible').waitFor({state:'hidden'});await page.screenshot({path:resolve(out,'adjust-desktop.png')});
   results.push({adjustHeight:await page.locator('#inspector').evaluate(e=>e.getBoundingClientRect().height)});
   await page.locator('[data-action=about]').click();await page.getByText('Cómo se genera este ECG',{exact:true}).click();
   assert.match(await page.locator('#dialog').innerText(),/Límites del modelo/);assert(await page.locator('#dialog #amplitude-note').isVisible());
   assert.equal(await page.locator('.information-content > details').count(),3);
   await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});
   // Import compatibility is deliberately broader than the three offered layouts.
   const legacy={...c,view:{...c.view,format:'3x4+3'},filter:'monitor',acquisition:'realistic'};await importCase(page,legacy);
   const actual=await page.evaluate(()=>window.__ecgTap.last.ecg);assert.equal(actual.view.format,legacy.view.format);assert.equal(actual.filter,'monitor');assert.equal(actual.acquisition,'realistic');
   assert.equal(await page.locator('[data-key="view.format"] option:checked').getAttribute('disabled'),'');
   await page.evaluate(()=>localStorage.setItem('ecglab-acquisition','realistic'));await page.reload();await ready(page);assert.equal(await page.locator('[data-key=acquisition]').inputValue(),'realistic');
  }
  results.push({viewport,menu,stablePaper:true});await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,evidence:out}));if(failure)process.exitCode=1;
