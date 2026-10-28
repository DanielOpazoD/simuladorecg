import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace,workerReplies} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/lead-lens');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:390,height:844,dark:true}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});await installWorkerTap(page);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-theme',dark?'dark':'light');localStorage.setItem('ecglab-acquisition','ideal');},!!viewport.dark);
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  for(const id of ['sinus','tachy','brady','lbbb','anterior','vf']){
   if(id!=='sinus'){await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});}
   const trace=await readTrace(page),replies=await workerReplies(page),canvas=await page.locator('#ecg').evaluate(c=>c.toDataURL());
   let intervalColors;
   if(id==='sinus'){
    await page.locator('[data-action="automatic"]').click();
    intervalColors=await page.locator('#automatic-overlay [data-interval]').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.interval,getComputedStyle(e).color])));
    const summaryColors=await page.locator('#metrics [data-metric] > span').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.parentElement.dataset.metric,getComputedStyle(e).color])));
    for(const key of ['pr','qrs','qt'])assert.equal(summaryColors[key],intervalColors[key],'The metric identity must agree in summary and paper');
    const review=await page.locator('#automatic-overlay text').evaluateAll(es=>es.some(e=>e.textContent.endsWith('*')));
    assert.equal(await page.locator('.auto-review').count(),review?1:0);
    const bounds=await page.locator('#ecg').boundingBox();
    await page.locator('[data-action="automatic"]').click();
    assert.deepEqual(await page.locator('#ecg').boundingBox(),bounds,'Hiding marks must not move the ECG');
   }
   await page.locator('[data-reading-segment="7"]').click();
   const root=page.locator('#lead-explorer'),start=Number(await root.getAttribute('data-start')),end=Number(await root.getAttribute('data-end'));
   assert(start>=5&&end<=10);
   if(id!=='vf')assert.equal(await root.getAttribute('data-beat-count'),'2');
   else assert.equal(await root.getAttribute('data-beat-count'),'0');
   const path=await page.locator('.lead-sample-path').getAttribute('d'),viewBox=await page.locator('.lead-detail-trace').getAttribute('viewBox');
   for(const mode of ['all','pr','qrs','qt','st','none']){
    await page.getByLabel('Marcas de la lupa').selectOption(mode);
    assert.equal(await page.locator('.lead-sample-path').getAttribute('d'),path);
    assert.equal(await page.locator('.lead-detail-trace').getAttribute('viewBox'),viewBox);
    const marks=await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>({key:e.dataset.key,start:+e.dataset.start,end:+e.dataset.end,value:e.querySelector('text').textContent})));
    if(mode==='none'||id==='vf')assert.equal(marks.length,0);
    for(const mark of marks){
     assert(mark.start>=start&&mark.end<=end);
     if(mode!=='st'){
      assert.notEqual(trace.measurement.evidence[mark.key].status,'unavailable');
      assert.equal(parseInt(mark.value.replace(/^[A-Z]+ /,'')),Math.round((mark.end-mark.start)*1000));
      assert(trace.measurement.beats.some(b=>mark.start===(mark.key==='pr'?b.pOnset:b.onset)&&mark.end===(mark.key==='pr'?b.onset:mark.key==='qrs'?b.offset:b.tEnd)));
     }
    }
    const geometry=await page.locator('#dialog').evaluate(d=>{
     const b=d.getBoundingClientRect(),labels=[...d.querySelectorAll('.lens-mark text')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};});
     const svg=d.querySelector('.lead-detail-trace').getBoundingClientRect(),waveBottom=d.querySelector('.lead-sample-path').getBoundingClientRect().bottom;
     return {top:b.top,bottom:b.bottom,overflow:d.scrollHeight-d.clientHeight,labels,waveBottom,svg:{left:svg.left,right:svg.right,bottom:svg.bottom}};
    });
    assert(geometry.top>=-1&&geometry.bottom<=viewport.height+1&&geometry.overflow<=1,JSON.stringify({viewport,id,mode,geometry}));
    for(const l of geometry.labels){assert(l.height>=13);assert(l.top>geometry.waveBottom);assert(l.left>=geometry.svg.left-1&&l.right<=geometry.svg.right+1&&l.bottom<=geometry.svg.bottom+1,JSON.stringify({viewport,id,mode,geometry}));}
    for(let i=0;i<geometry.labels.length;i++)for(let j=i+1;j<geometry.labels.length;j++){const a=geometry.labels[i],b=geometry.labels[j];assert(a.right+3<=b.left||b.right+3<=a.left||a.bottom+3<=b.top||b.bottom+3<=a.top,JSON.stringify({id,mode,viewport,a,b}));}
   }
   await page.getByLabel('Marcas de la lupa').selectOption('all');
   const reserved=await page.locator('.lead-detail-trace').evaluate(svg=>(svg.viewBox.baseVal.height-Number(svg.dataset.traceHeight))*svg.getBoundingClientRect().width/svg.viewBox.baseVal.width);
   const availableKeys=await page.locator('.lens-mark').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.key))]);
   if(id==='anterior'){
    assert.deepEqual(availableKeys,['qrs'],'This case provides a single accepted interval lane');
    assert(reserved<=36.1,`One available interval must not reserve three lanes: ${reserved}px`);
   }
   if(id==='vf')assert(reserved<.1,'No empty annotation band without estimable marks');
   if(id==='sinus'){
    assert.equal(await page.locator('.lens-mark').count(),6);
    const colors=await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>getComputedStyle(e).fill));assert.equal(new Set(colors).size,3);
    const lensColors=await page.locator('.lens-mark').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.key,getComputedStyle(e).fill])));
    assert.deepEqual(lensColors,intervalColors,'Paper and lens must use identical interval colors');
    const space=await root.evaluate(r=>{
     const svg=r.querySelector('svg').getBoundingClientRect(),paper=r.querySelector('.lead-detail-scroll').getBoundingClientRect();
     const labels=[...r.querySelectorAll('.lens-mark text')].map(e=>e.getBoundingClientRect());
     return {width:svg.width,available:r.clientWidth,white:paper.width-svg.width,captionHeight:Math.max(...labels.map(x=>x.bottom))-Math.min(...labels.map(x=>x.top))};
    });
    assert(space.white<=3,'Paper container must not leave blank side panels');
    assert(space.captionHeight<=82,'Three readable lanes stay compact when the ECG is enlarged');
    if(viewport.height>=568)assert(space.width>=space.available*.95,'Use the available width when height permits');
   }
   await page.screenshot({path:resolve(out,`${viewport.width}-${viewport.height}-${id}${viewport.dark?'-dark':''}.png`)});
   if(id==='sinus'){
    for(const preference of ['none','qrs','st']){
     await page.getByLabel('Marcas de la lupa').selectOption(preference);
     const marks=await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>({key:e.dataset.key,start:e.dataset.start,end:e.dataset.end,value:e.querySelector('text').textContent})));
     await page.keyboard.press('Escape');await page.locator('[data-reading-segment="7"]').click();
     assert.equal(await page.getByLabel('Marcas de la lupa').inputValue(),preference,'Reopening must preserve the reading preference');
     assert.deepEqual(await page.locator('.lens-mark').evaluateAll(es=>es.map(e=>({key:e.dataset.key,start:e.dataset.start,end:e.dataset.end,value:e.querySelector('text').textContent}))),marks);
     assert.equal(await page.locator('.lens-manual-mark').count(),0,'No manual endpoints carried into a new lens');
    }
    await page.getByLabel('Marcas de la lupa').selectOption('all');
   }
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),canvas);
   assert.equal(await workerReplies(page),replies);
   results.push({viewport,id,start,end,reserved,availableKeys});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({results,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure}));if(failure)process.exitCode=1;
