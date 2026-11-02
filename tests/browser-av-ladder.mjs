/** Final-sample AV illustration and an independent raster timing judge. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {chromium} from 'playwright';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {installWorkerTap,readTrace,workerReplies} from './support/worker-tap.mjs';
import {rasterJudge} from './support/inline-av-pixels.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/inline-av');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const browser=await chromium.launch(),results=[],errors=[];let failure,active;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
  const page=active=await browser.newPage({viewport,reducedMotion:'reduce'});await installWorkerTap(page);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme',dark?'dark':'light');},viewport.width===390);
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  for(const id of viewport.width===1440?['av1','wenckebach','mobitz2','av21','highav','complete','complete_v']:['wenckebach','complete_v']){
   await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});
   const source=await readTrace(page,{seconds:65}),before=hash(source),replies=await workerReplies(page);
   const paper=()=>page.locator('#ecg').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,png:e.toDataURL()};});
   const initial=await paper(),svg=page.locator('.lesson-av-svg');await svg.waitFor({state:'visible'});
   assert.equal(await page.locator('[data-action=teaching],#teaching-root,[data-teach]').count(),0);
   assert.equal(await page.locator('#reading-lesson button,#reading-lesson input,#reading-lesson select').count(),0);
   const data=await svg.evaluate(e=>({from:+e.dataset.start,to:+e.dataset.end,speed:+e.dataset.speed,left:+e.dataset.left,baseline:+e.dataset.baseline,gain:+e.dataset.gain,
    atria:[...e.querySelectorAll('.av-atrial')].map(e=>+e.dataset.time),blocked:[...e.querySelectorAll('.av-blocked')].map(e=>+e.dataset.time),
    links:[...e.querySelectorAll('.av-link')].map(e=>({a:+e.dataset.atrialTime,v:+e.dataset.ventricularTime,pr:+e.dataset.prMs})),
    v:[...e.querySelectorAll('.av-ventricular')].map(e=>({time:+e.dataset.time,linked:e.dataset.linked==='1'})),path:e.querySelector('.lesson-wave').getAttribute('d')}));
   const near=(a,b)=>Math.abs(a-b)<.000051,inside=t=>t>=data.from-.000051&&t<=data.to+.000051;
   assert(data.from>=0&&data.to<=10&&data.speed===50&&data.gain===10);
   assert.equal(data.atria.length,source.events.atria.filter(a=>inside(a.time)).length);
   assert.equal(data.blocked.length,source.events.atria.filter(a=>!a.conducted&&inside(a.time)).length);
   assert.equal(data.v.length,source.events.beats.filter(b=>inside(b.time)).length);
   for(const l of data.links){const a=source.events.atria.find(a=>near(a.time,l.a));assert(a?.conducted);assert(near(l.v,a.time+a.pr));assert(Math.abs(l.pr-a.pr*1000)<.00001);assert(source.events.beats.some(b=>near(b.time,l.v)));}
   if(id.startsWith('complete')){assert.equal(data.links.length,0);assert(data.v.every(v=>!v.linked));}
   if(id==='wenckebach')for(const value of ['160','240','280'])assert((await svg.locator('.av-pr').allTextContents()).some(t=>t.includes(value)));
   const points=[...data.path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>[+m[1],+m[2]]),i0=Math.ceil(data.from*source.fs-1e-6),i1=Math.floor(data.to*source.fs+1e-6);
   assert.equal(points.length,i1-i0+1);
   for(let j=0;j<points.length;j+=17){assert(Math.abs(points[j][0]-(data.left+((i0+j)/source.fs-data.from)*data.speed))<.0051);assert(Math.abs(points[j][1]-(data.baseline-source.leads.II[i0+j]*data.gain))<.00011);}
   const frame=page.locator('.lesson-av-scroll');await frame.scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`${id}-${viewport.width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert(await frame.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'No nested vertical scrolling');
   if(id==='wenckebach'&&viewport.width===1440){
    const wave=await svg.locator('.lesson-av-wave').screenshot(),band=await svg.locator('.lesson-av-diagram').screenshot();
    const wb=await svg.locator('.lesson-av-wave').boundingBox(),bb=await svg.locator('.lesson-av-diagram').boundingBox();
    await writeFile(resolve(out,'raster-ecg.png'),wave);await writeFile(resolve(out,'raster-ladder.png'),band);
    const pixels=[];for(const mutation of [null,'time','scale'])pixels.push(await page.evaluate(rasterJudge,{wave:wave.toString('base64'),band:band.toString('base64'),events:{atria:source.events.atria.filter(a=>inside(a.time)),beats:source.events.beats.filter(b=>inside(b.time))},start:data.from,speed:50,offset:wb.x-bb.x,mutation}));
    await writeFile(resolve(out,'pixel-results.json'),JSON.stringify(pixels,null,2));
    assert(pixels[0].checked>=6&&pixels[0].ratio>=.9,JSON.stringify(pixels));assert(pixels[1].ratio<.5&&pixels[2].ratio<.5,JSON.stringify(pixels));results.push({pixels});
   }
   await frame.focus();await frame.press('End');await frame.press('Home');
   assert.deepEqual(await paper(),initial);assert.equal(hash(await readTrace(page,{seconds:65})),before);assert.equal(await workerReplies(page),replies);
   results.push({id,viewport,atria:data.atria.length,blocked:data.blocked.length,links:data.links.length,sourceHash:before,samplesAndMeasurementsPreserved:true,geometry:true});
  }
  await chooseCatalogPreset(page,'af');await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.equal(await page.locator('.lesson-av-svg,.lesson-echo').count(),0);assert(await page.locator('#reading-lesson').isHidden());results.push({viewport,negativeAf:true});await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);await active?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,results:results.length,errors,failure,evidence:out}));if(failure)process.exitCode=1;
