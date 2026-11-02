/** Full desktop sheet, stable reading actions, deliberate zoom and accessible sources. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/desktop-overview');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];let failure,page;
const geometry=page=>page.evaluate(()=>{
 const canvas=document.querySelector('#ecg'),wrap=document.querySelector('#canvas-wrap'),r=canvas.getBoundingClientRect(),cal=document.querySelector('#trace-calibration').getBoundingClientRect();
 return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,availableWidth:wrap.clientWidth,bottom:cal.bottom+scrollY,viewport:innerHeight,overflow:wrap.scrollWidth-wrap.clientWidth,verticalOverflow:wrap.scrollHeight-wrap.clientHeight,canvasRatio:canvas.width/canvas.height,displayRatio:r.width/r.height};
});
async function selectFormat(page,format){
 await page.locator('.paper-menu > summary').click();
 await page.locator('[data-key="view.format"]').selectOption(format);await page.locator('.paper-menu > summary').click();
}
// Read the raster pulse, without importing the renderer or its layout. A missing
// pulse and independently stretched axes must fail the same measurement oracle.
async function pulsePixels(page,negative=false,widthMm=273){
 return page.locator('#ecg').evaluate((canvas,{negative,widthMm})=>{
  const ppm=canvas.width/widthMm,width=Math.floor(15*ppm),height=Math.min(canvas.height,Math.ceil(60*ppm));
  const rgba=canvas.getContext('2d').getImageData(0,0,width,height).data;
  if(negative)rgba.fill(255);
  const seen=new Uint8Array(width*height),components=[];
  const dark=i=>rgba[i*4+3]>128&&rgba[i*4]<185&&rgba[i*4+1]<190&&rgba[i*4+2]<195;
  for(let i=0;i<seen.length;i++){
   if(seen[i]||!dark(i))continue;
   const todo=[i],points=[];seen[i]=1;
   while(todo.length){const p=todo.pop(),x=p%width,y=Math.floor(p/width);points.push({x,y});
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]]){
     if(nx<0||nx>=width||ny<0||ny>=height)continue;const n=ny*width+nx;if(!seen[n]&&dark(n)){seen[n]=1;todo.push(n);}
    }
   }
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),top=Math.min(...ys),bottom=Math.max(...ys);
   if(Math.max(...xs)-Math.min(...xs)<3.75*ppm||bottom-top<6.5*ppm)continue;
   const plateau=points.filter(p=>p.y<=top+1).map(p=>p.x);
   components.push({y:top,height:bottom-top,plateau:Math.max(...plateau)-Math.min(...plateau)});
  }
  components.sort((a,b)=>a.y-b.y);return {ppm,pulse:components[0]??null};
 },{negative,widthMm});
}
const calibrated=(r,stretch=1)=>!!r.pulse&&Math.abs(r.pulse.height*stretch-10*r.ppm)<=1.5&&Math.abs(r.pulse.plateau-5*r.ppm)<=1.5;
try{
 for(const viewport of [{width:1280,height:720},{width:1440,height:900},{width:1024,height:768}]){
  page=await browser.newPage({viewport,reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme','light');});
  await page.goto(process.env.ECG_TEST_URL??'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-key="view.format"]').inputValue(),'3x4+1');
  assert.equal(await page.locator('[data-reading-segment]').count(),13,'Twelve leads and one continuous rhythm strip');
  assert.match(await page.locator('[data-reading-segment="0"]').getAttribute('aria-label'),/0 a 2.5 segundos/);
  assert.match(await page.locator('[data-reading-segment="12"]').getAttribute('aria-label'),/II, tramo 0 a 10 segundos/);
  const landscape=await geometry(page),landscapeRaster=await pulsePixels(page,false,275);
  assert(calibrated(landscapeRaster),JSON.stringify(landscapeRaster));assert(!calibrated(landscapeRaster,1.25));assert(!calibrated(await pulsePixels(page,true,275)));
  await page.locator('[data-action=automatic]').click();await page.screenshot({path:resolve(out,`${viewport.width}-landscape.png`)});await page.locator('[data-action=automatic]').click();
  await selectFormat(page,'6x2');await page.waitForTimeout(250);const portrait=await geometry(page);
  const enlargement=(landscape.width/275)/(portrait.width/273);
  // The right rail can make the compact sheet width-limited even at 1440 px.
  // Judge the actual paper viewport, not the outer browser width: a 275 mm
  // sheet filling it can have a slightly smaller scale than the 273 mm sheet.
  const widthLimited=Math.abs(landscape.width-landscape.availableWidth)<=2;
  const minimumEnlargement=widthLimited?273/275-.001:1.1;
  assert(enlargement>minimumEnlargement,JSON.stringify({enlargement,widthLimited,minimumEnlargement,landscape,portrait}));
  results.push({viewport,initialLandscape:true,enlargement,landscape,portrait,landscapeRaster});
  for(const id of ['sinus','lbbb','anterior','lvh']){
   if(id!=='sinus'){await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});}
   for(const format of ['6x2','3x4+1','12x1']){
    await selectFormat(page,format);
    await page.waitForTimeout(250);
    const g=await geometry(page);assert(g.overflow<=2&&g.verticalOverflow<=2,JSON.stringify(g));assert(g.bottom<=g.viewport,JSON.stringify(g));assert(Math.abs(g.canvasRatio-g.displayRatio)<.015,'Uniform aspect ratio');
    assert.equal(await page.locator('#trace-scroll-hint').count(),0);
    const plain=await page.locator('#ecg').evaluate(e=>e.toDataURL());
    await page.locator('[data-action=automatic]').click();assert.deepEqual(await geometry(page),g);
    const labels=await page.locator('#automatic-overlay text').evaluateAll(es=>es.map(e=>({font:parseFloat(getComputedStyle(e).fontSize)*e.getScreenCTM().a,box:e.getBoundingClientRect().toJSON()})));
    assert(labels.every(l=>l.font>=13.9));
    await page.locator('[data-action=automatic]').click();assert.deepEqual(await geometry(page),g);
    assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),plain);
    results.push({viewport,id,format,geometry:g,labels:labels.length});
   }
  }
  await selectFormat(page,'6x2');
  await chooseCatalogPreset(page,'sinus');await page.locator('#signal-loading').waitFor({state:'hidden'});await page.waitForTimeout(250);
  const before=await geometry(page),plain=await page.locator('#ecg').evaluate(e=>e.toDataURL());
  const raster=await pulsePixels(page);assert(calibrated(raster),JSON.stringify(raster));
  assert(!calibrated(raster,1.25),'Vertical distortion must fail');assert(!calibrated(await pulsePixels(page,true)),'Missing calibration must fail');
  results.push({viewport,raster,negativeControls:true});
  await page.locator('[data-action=zoom-in]').click();const enlarged=await geometry(page);assert(Math.abs(enlarged.width/before.width-1.25)<.002);assert(Math.abs(enlarged.height/before.height-1.25)<.002);
  await page.locator('[data-action=zoom-reset]').click();assert.deepEqual(await geometry(page),before);assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),plain);
  await page.locator('[data-action=automatic]').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`${viewport.width}.png`)});
  const info=page.getByRole('button',{name:'Información y fuentes',exact:true});assert.equal((await info.innerText()).trim(),'');await info.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert(await info.evaluate(e=>e===document.activeElement));
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack||e);await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:results.length,failure,out}));if(failure)process.exitCode=1;
