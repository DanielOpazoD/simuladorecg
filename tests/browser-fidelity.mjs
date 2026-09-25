/** Real Chromium checks. Run against the built dist (vite preview): ECG_TEST_URL=http://127.0.0.1:5173.
 * Outputs outside source by default; no patient data, diagnostic labels or network AI.
 * npm install --no-save --package-lock=false playwright@1.63.0
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const url=process.env.ECG_TEST_URL || 'http://127.0.0.1:5173/';
const out=path.resolve(process.env.ECG_EVIDENCE_DIR || '.sites-runtime/browser');
await mkdir(out,{recursive:true});
const productionResponse=await fetch(new URL('build-info.json',url));
assert.equal(productionResponse.status,200,'production manifest unavailable');
const productionInfo=await productionResponse.json();
assert.deepEqual(productionInfo,JSON.parse(await readFile('dist/build-info.json','utf8')));
assert.equal(productionInfo.dirty,false,'do not QA a dirty build');
const browser=await chromium.launch({headless:true}), errors=[], warnings=[], checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const requested=[];page.on('request',r=>requested.push(r.url()));
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});
const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
async function select(id){await page.locator(`[data-preset="${id}"]`).click();await ready();}
async function phase(value){await page.locator('[data-panel="st"]').click();await page.locator('[data-key="phase"]').selectOption(value);await ready();}
const scale=()=>page.locator('.beat-plot').evaluate(e=>[e.dataset.scaleMin,e.dataset.scaleMax]);
try {
 await page.goto(url);await ready();
 assert.equal(await page.locator('[data-product-version]').getAttribute('data-product-version'),productionInfo.packageVersion,'visible version differs from build');
assert.match(await page.title(),/ECG/i);assert.equal(new URL(page.url()).origin,new URL(url).origin);
 assert.match(await page.locator('#case-title').innerText(),/sinusal/i);
 assert.equal(await page.locator('vite-error-overlay').count(),0);
 assert.ok(await page.locator('#ecg').evaluate(c=>c.width>0&&c.height>0));checks.push('page identity / nonblank / no overlay');
 await page.screenshot({path:path.join(out,'desktop.png')});
 for(const id of ['inferior','anterior','lateral']) {
  await select(id);await phase('hyperacute');
  const fixed=await scale();assert.ok(fixed.every(Boolean));
  for(const lead of ['II','V3','V5']) {await page.locator('#detail-lead').selectOption(lead);assert.deepEqual(await scale(),fixed);}
  await page.locator('[data-action="next-beat"]').click();assert.deepEqual(await scale(),fixed);
  await page.locator('#beat-detail').screenshot({path:path.join(out,`${id}-hyperacute.png`)});
  await phase('evolving');await page.locator('#beat-detail').screenshot({path:path.join(out,`${id}-evolving.png`)});
 }
 checks.push('regional phase controls and fixed scale across three leads / next beat');
 await select('sinus');await page.locator('[data-mode="monitor"]').click();await page.locator('[data-action="pause"]').click();
 assert.equal(await page.locator('#monitor-state').innerText(),'CONGELADO');
 await select('brady');assert.equal(await page.locator('#monitor-state').innerText(),'REPRODUCCIÓN');
 await page.locator('[data-mode="paper"]').click();await page.locator('[data-action="caliper"]').click();
 assert.equal(await page.locator('[data-action="caliper"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-mode="monitor"]').click();await page.locator('[data-mode="paper"]').click();
 assert.equal(await page.locator('[data-action="caliper"]').getAttribute('aria-pressed'),'false');checks.push('pause and caliper regression');
 // Use the real JSON import path, not DOM injection of a synthetic title.
 await select('inferior');
 await page.locator('[data-action="export"]').click();
 const exported=page.waitForEvent('download');await page.locator('[data-action="json"]').click();
 const jsonPath=path.join(out,'inferior-case.json');await (await exported).saveAs(jsonPath);
 const reversed=JSON.parse(await readFile(jsonPath,'utf8'));reversed.artifacts.reversed=true;
 await page.locator('#file-input').setInputFiles({name:'inverted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(reversed))});
 await page.waitForFunction(()=>document.querySelector('#case-title')?.textContent==='Registro con brazos invertidos');await ready();
 await page.locator('#dialog').evaluate(d=>d.close());
 assert.equal(await page.locator('#case-title').innerText(),'Registro con brazos invertidos');
 assert.equal(await page.locator('#finding-title').innerText(),'Transformación de la adquisición');
 assert.doesNotMatch(await page.locator('#findings').innerText(),/III\s*>\s*II|ST↓ recíproco en I/);
 assert.match(await page.locator('#warnings').innerText(),/inversión de electrodos de brazos/i);
 assert.match(await page.locator('#ecg').getAttribute('aria-label'),/Registro con brazos invertidos/);
 await page.screenshot({path:path.join(out,'inverted-electrodes.png')});
 checks.push('P1: actual JSON import preserves reversed acquisition and retires basal observations');
 for(const id of ['wpw','lbbb','vvi','ddd']) {
  await select(id);
  const message=await page.locator('#warnings').innerText();
  assert.match(message,id==='wpw'?/delta no modifica el ST-T secundario/:/relación ST\/QRS no está calibrada/);
  assert.match(await page.locator('#limitation').innerText(),id==='wpw'?/delta no modifica/:/no está calibrada/);
 }
 await page.screenshot({path:path.join(out,'secondary-repolarization-limit.png')});
 await select('aai');assert.doesNotMatch(await page.locator('#warnings').innerText(),/ST\/QRS no está calibrada/);
 checks.push('P2: WPW / LBBB / VVI / DDD warnings visible; AAI alone excluded');
 // P6: invalidate synchronously during a real slider input; no stale export window.
 await select('sinus');await page.locator('[data-mode="monitor"]').click();
 await page.locator('[data-action="pause"]').click();
 await page.locator('[data-panel="base"]').click();
 const retired=await page.locator('[data-key="hr"]').evaluate(el=>{
  el.value='90';el.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-action="export"]').click();
  const state={loading:!document.querySelector('#signal-loading').hidden,
   metrics:document.querySelectorAll('#metrics .metric').length,
   pauseDisabled:document.querySelector('[data-action="pause"]').disabled,
   pngDisabled:document.querySelector('[data-action="png"]').disabled};
  document.querySelector('#dialog').close();return state;
 });
 assert.deepEqual(retired,{loading:true,metrics:0,pauseDisabled:true,pngDisabled:true});
 await ready();assert.equal(await page.locator('#monitor-state').innerText(),'REPRODUCCIÓN');
 checks.push('P6: slider invalidates paused samples, measurements and PNG synchronously');
 await page.locator('[data-mode="paper"]').click();
 const unsupported={...reversed,presetId:'custom',name:'Prueba de dominio',rhythm:'sinus',
  ischemia:'none',conduction:'normal',ectopy:'couplet',hr:250,coupling:.3,qrs:90,
  artifacts:{...reversed.artifacts,reversed:false}};
 await page.locator('#file-input').setInputFiles({name:'unsupported.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(unsupported))});
 await page.locator('#signal-loading.signal-unavailable').waitFor({state:'visible'});
 assert.match(await page.locator('#signal-loading').innerText(),/Fuera del alcance del modelo/);
 assert.equal(await page.locator('#metrics .metric').count(),0);
 await page.locator('[data-action="export"]').click();
 assert.equal(await page.locator('[data-action="png"]').isDisabled(),true);
 await page.locator('#dialog').evaluate(d=>d.close());
 await page.screenshot({path:path.join(out,'session-error.png')});
 await select('sinus');assert.ok(await page.locator('#metrics .metric').count()>0);
 assert.doesNotMatch(await page.locator('#toast').textContent(),/Fuera del alcance del modelo/,'previous domain error must not remain after recovery');
 await page.locator('[data-action="export"]').click();
 assert.equal(await page.locator('[data-action="png"]').isDisabled(),false);
 await page.locator('#dialog').evaluate(d=>d.close());
 await page.screenshot({path:path.join(out,'session-recovered.png')});
 checks.push('P6: real worker domain error disables stale export; new case recovers');

 await select('inferior');await phase('hyperacute');
 await page.locator('[data-action="export"]').click();const download=page.waitForEvent('download');await page.locator('[data-action="png"]').click();
 const pngPath=path.join(out,'export-300dpi.png');await (await download).saveAs(pngPath);
 const png=await readFile(pngPath);assert.equal(png.subarray(1,4).toString(),'PNG');let phys;
 for(let off=8;off+12<=png.length;) {const len=png.readUInt32BE(off),type=png.toString('ascii',off+4,off+8);if(type==='pHYs')phys=[png.readUInt32BE(off+8),png.readUInt32BE(off+12),png[off+16]];off+=12+len;}
 assert.deepEqual(phys,[11811,11811,1]);checks.push('real UI PNG download + 300 dpi pHYs');
 await page.locator('#dialog').evaluate(d=>d.close());
 // Measure actual UI downloads. No source imports, zeroed signals, or layout truth.
 await select('sinus');
 await page.locator('[data-key="view.format"]').selectOption('3x4');
 await page.locator('[data-key="view.grid"]').check();
 const pixels=[];
 for(const speed of [12.5,25,50])for(const gain of [2.5,5,10,20]){
  await page.locator('[data-key="view.speed"]').selectOption(String(speed));
  await page.locator('[data-key="view.gain"]').selectOption(String(gain));
  await page.locator('[data-action="export"]').click();
  const pending=page.waitForEvent('download');await page.locator('[data-action="png"]').click();
  const file=path.join(out,`calibration-${speed}-${gain}.png`);await (await pending).saveAs(file);
  await page.locator('#dialog').evaluate(d=>d.close());
  const result=await page.evaluate(async ({base64,speed,gain})=>{
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const img=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   const {data}=ctx.getImageData(0,0,img.width,img.height),ppm=300/25.4;
   const dark=(x,y)=>{const i=4*(Math.round(y)*img.width+Math.round(x));return data[i]<120&&data[i+1]<120&&data[i+2]<120;};
   const groups=values=>{const out=[];for(const v of values){if(!out.length||v>out.at(-1).at(-1)+1)out.push([]);out.at(-1).push(v);}return out;};
   const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
   // Read the first calibration baseline from its leading stub, not renderer coordinates.
   const baselinePixels=[];
   for(let y=Math.ceil(18*ppm);y<img.height-Math.ceil(8*ppm);y++)if(dark(1.5*ppm,y))baselinePixels.push(y);
   const baselineGroups=groups(baselinePixels);
   if(!baselineGroups.length)throw Error('Calibration baseline not found');
   const baseline=mean(baselineGroups[0]),ys=[];
   for(let y=Math.floor(baseline-(gain+1)*ppm);y<=Math.ceil(baseline+ppm);y++)if(dark((2+.1*speed)*ppm,y))ys.push(y);
   const xs=[];for(let x=Math.floor(ppm);x<=Math.ceil((3+.2*speed)*ppm);x++)if(dark(x,baseline-gain*.5*ppm))xs.push(x);
   const sides=groups(xs),tops=groups(ys),majors=[],gy=Math.round(15.4*ppm);
   for(let x=Math.round(20*ppm);x<Math.round(80*ppm);x++){const i=4*(gy*img.width+x);if(data[i]>190&&data[i]<240&&data[i+1]<210&&data[i+2]<218)majors.push(x);}
   const centers=groups(majors).map(mean),steps=centers.slice(1).map((v,i)=>v-centers[i]);
   const result={speed,gain,widthPx:sides.length===2?mean(sides[1])-mean(sides[0]):null,heightPx:tops.length===1?baseline-mean(tops[0]):null,expectedWidthPx:.2*speed*ppm,expectedHeightPx:gain*ppm,grid5mmPx:steps.length?mean(steps):null,expectedGrid5mmPx:5*ppm};
   img.close();canvas.width=0;return result;
  },{base64:(await readFile(file)).toString('base64'),speed,gain});
  pixels.push(result);
 }
 for(const p of pixels){assert.ok(p.widthPx!==null&&Math.abs(p.widthPx-p.expectedWidthPx)<2,JSON.stringify(p));assert.ok(p.heightPx!==null&&Math.abs(p.heightPx-p.expectedHeightPx)<2,JSON.stringify(p));assert.ok(p.grid5mmPx!==null&&Math.abs(p.grid5mmPx-p.expectedGrid5mmPx)<1,JSON.stringify(p));}
 checks.push('12 actual production PNG downloads: pulse width/height + 5-mm grid');
 await page.setViewportSize({width:390,height:844});await page.goto(url);await ready();
 assert.ok(await page.locator('#ecg').isVisible());assert.match(await page.locator('#case-title').innerText(),/sinusal/i);
 await page.locator('[data-action="catalog"]').click();await select('anterior');await phase('hyperacute');
 await page.locator('#beat-detail').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile.png')});checks.push('390x844 emulated viewport: catalog / phase / trace');
 const localPaths=requested.filter(u=>new URL(u).origin===new URL(url).origin).map(u=>new URL(u).pathname);
 assert.ok(localPaths.some(p=>/^\/assets\/.*\.js$/.test(p)),'compiled application not loaded');
 assert.ok(!localPaths.some(p=>p.startsWith('/src/')||p.includes('@vite/client')),'development source loaded');
 checks.push('production assets loaded without source-module imports');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'browser-results.json'),JSON.stringify({url,productionInfo,checks,pixels,errors,warnings,browser:await browser.version(),viewports:[[1440,1000],[390,844]],physicalDeviceTest:false},null,2));
 console.log(JSON.stringify({passed:checks.length,pixelCases:pixels.length,errors}));
} catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({checks,errors,warnings,error:String(e)},null,2));throw e;}
finally{await browser.close();}
