import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace,workerReplies} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/educational-reading');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1440,height:900,dark:true}]){
  const page=await browser.newPage({viewport,reducedMotion:'no-preference'});await installWorkerTap(page);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme',dark?'dark':'light');},!!viewport.dark);
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  assert(await page.locator('.reading-education').isVisible());
  // On narrow screens the chosen precordial column must first be brought into
  // view, as for a real click. That navigation precedes the preservation baseline.
  await page.locator('[data-reading-segment="7"]').scrollIntoViewIfNeeded();
  const before=await readTrace(page),replies=await workerReplies(page),paper=await page.locator('#ecg').boundingBox(),png=await page.locator('#ecg').evaluate(e=>e.toDataURL());
  await page.locator('[data-reading-segment="7"]').click();
  const root=page.locator('#lead-explorer'),button=page.locator('.lens-play'),slider=page.getByRole('slider',{name:'Recorrer el latido'}),svg=page.locator('.lead-detail-trace');
  assert(await button.isVisible());assert(await button.isEnabled());
  const path=await page.locator('.lead-sample-path').getAttribute('d'),viewBox=await svg.getAttribute('viewBox'),bounds=await svg.boundingBox();
  const marks=await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>({key:e.dataset.key,start:+e.dataset.start,end:+e.dataset.end,text:e.textContent})));
  const start=Number(await root.getAttribute('data-playhead-start')),end=Number(await root.getAttribute('data-playhead-end'));
  assert(marks.some(m=>m.key==='qt'&&m.end===end));assert(marks.some(m=>m.key==='pr'&&m.start===start));
  await button.click();await page.waitForFunction(()=>+document.querySelector('#lead-explorer').dataset.playheadTime>+document.querySelector('#lead-explorer').dataset.playheadStart+.015);
  await button.click();assert.equal(await root.getAttribute('data-playing'),'false');
  for(const key of ['End','Home','ArrowRight']){
   await slider.press(key);
   const cursor=await svg.evaluate(e=>({x:e.querySelector('.lens-playback-cursor').transform.baseVal.consolidate().matrix.e,t:+document.querySelector('#lead-explorer').dataset.playheadTime,start:+document.querySelector('#lead-explorer').dataset.start}));
   const expected=4+(cursor.t-cursor.start)*50;
   // SVGMatrix stores float32: 1e-4 mm permits representational rounding only
   // (0.002 ms at 50 mm/s), far below a 2 ms sample at 500 Hz.
   assert(Math.abs(cursor.x-expected)<1e-4,JSON.stringify({message:'Cursor must follow the acquired sample clock',cursor,expected,error:cursor.x-expected}));
   // Independent negative timing and scale controls: they must not fit this cursor.
   assert(Math.abs(cursor.x-(4+(cursor.t+.04-cursor.start)*50))>1.9);
   assert(Math.abs(cursor.x-(4+(cursor.t-cursor.start)*55))>.1);
   assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
   assert.equal(await svg.getAttribute('viewBox'),viewBox);assert.deepEqual(await svg.boundingBox(),bounds);
  }
  await button.click();await page.getByLabel('Marcas de la lupa').selectOption('none');
  assert.equal(await root.getAttribute('data-playing'),'false');
  await page.getByLabel('Marcas de la lupa').selectOption('all');
  assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
  assert.equal(await svg.getAttribute('viewBox'),viewBox);
  await button.click();await page.getByLabel('Derivación ampliada').selectOption('II');
  assert.equal(await root.getAttribute('data-playing'),'false');
  await page.getByLabel('Derivación ampliada').selectOption('V2');
  assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
  assert.deepEqual(await svg.boundingBox(),bounds);
  await button.click();await page.getByRole('button',{name:'Medir en la lupa',exact:true}).click();
  assert.equal(await root.getAttribute('data-playing'),'false');
  const g=await svg.evaluate(e=>{const b=e.getBoundingClientRect();return {left:b.left,top:b.top,scale:b.width/e.viewBox.baseVal.width,baseline:+e.dataset.baseline};});
  const a={x:g.left+(4+.1*50)*g.scale,y:g.top+g.baseline*g.scale},b={x:a.x+.1*50*g.scale,y:a.y};
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();
  const manual=await root.getAttribute('data-manual-ms');assert(Math.abs(+manual-100)<2.1);
  await page.getByRole('button',{name:'Ocultar medición manual',exact:true}).click();
  await slider.press('End');await slider.press('Home');
  await page.getByRole('button',{name:'Medir en la lupa',exact:true}).click();assert.equal(await root.getAttribute('data-manual-ms'),manual);
  await page.getByRole('button',{name:'Ocultar medición manual',exact:true}).click();
  await slider.press('End');await page.screenshot({path:resolve(out,`${viewport.width}-${viewport.height}${viewport.dark?'-dark':''}-playback.png`)});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.lens-play').disabled,null,{timeout:2000});
  assert(await button.isDisabled());
  await slider.press('End');assert.match(await page.locator('.lens-phase').textContent(),/ST–T/);
  assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
  assert.deepEqual(await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>({key:e.dataset.key,start:+e.dataset.start,end:+e.dataset.end,text:e.textContent}))),marks);
  const fit=await page.locator('#dialog').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,overflow:e.scrollHeight-e.clientHeight};});
  assert(fit.top>=-1&&fit.bottom<=viewport.height+1&&fit.overflow<=1,JSON.stringify({viewport,fit}));
  await page.screenshot({path:resolve(out,`${viewport.width}-${viewport.height}${viewport.dark?'-dark':''}-lens.png`)});
  await page.keyboard.press('Escape');assert.deepEqual(await page.locator('#ecg').boundingBox(),paper);
  assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),png);assert.equal(await workerReplies(page),replies);assert.deepEqual(await readTrace(page),before);
  await page.screenshot({path:resolve(out,`${viewport.width}-${viewport.height}${viewport.dark?'-dark':''}-reading.png`),fullPage:true});
  results.push({viewport,identity:true,manualPreserved:true,geometry:true,cursorNegativeControls:true,reducedMotion:true});
  if(viewport.width===1440&&!viewport.dark){
   for(const id of ['wenckebach','af','vf']){
    await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});
    const copy=await page.locator('.reading-education').textContent();assert(copy.length>50);
    if(id==='wenckebach')assert.match(copy,/PR se alarga/);
    if(id==='af')assert.match(copy,/no hay una P organizada/);
    if(id==='vf'){
     assert.match(copy,/Sin complejos delimitables/);await page.locator('[data-reading-segment="7"]').click();assert.equal(await page.locator('.lens-playback').isVisible(),false);await page.keyboard.press('Escape');
    }
    results.push({id,educationalCopy:copy});
   }
   // Interface imports deliberately normalize Cabrera to false; exercise the
   // reachable connection notice here rather than enabling a hidden format.
   {
    const example=structuredClone(before.case);example.artifacts.reversed=true;
    await page.goto((process.env.ECG_TEST_URL??'http://127.0.0.1:4173/')+'#case='+Buffer.from(JSON.stringify(example)).toString('base64url'));
    await page.locator('#signal-loading').waitFor({state:'hidden'});await page.locator('[data-reading-segment="7"]').click();
    assert.equal(await page.locator('.lens-playback').isVisible(),false);
    assert(await page.locator('.lead-observation').isVisible());
    assert.match(await page.locator('.lead-observation').textContent(),/brazos invertidos/);
    await page.keyboard.press('Escape');results.push({reversed:true,connectionNoticePreserved:true});
   }
   await page.locator('[data-action="quiz"]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});
   assert.equal(await page.locator('.reading-education').isVisible(),false,'No educational answer may leak into concealed practice');
   assert.equal(await page.locator('.reading-education').textContent(),'');
   assert.equal(await page.locator('#reading-lesson').textContent(),'');
   await page.getByRole('button',{name:'Salir de práctica'}).click();results.push({practiceConcealed:true});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);for(const p of browser.contexts().flatMap(c=>c.pages()))await p.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,results:results.length,errors,failure,evidence:out}));if(failure)process.exitCode=1;
