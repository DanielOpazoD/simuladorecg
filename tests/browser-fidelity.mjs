/** Real Chromium checks. Run against Vite: ECG_TEST_URL=http://127.0.0.1:5173.
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
const browser=await chromium.launch({headless:true}), errors=[], warnings=[], checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});
const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
async function select(id){await page.locator(`[data-preset="${id}"]`).click();await ready();}
async function phase(value){await page.locator('[data-panel="st"]').click();await page.locator('[data-key="phase"]').selectOption(value);await ready();}
const scale=()=>page.locator('.beat-plot').evaluate(e=>[e.dataset.scaleMin,e.dataset.scaleMax]);
try {
 await page.goto(url);await ready();assert.match(await page.title(),/ECG/i);assert.equal(new URL(page.url()).origin,new URL(url).origin);
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
 await select('inferior');await phase('hyperacute');
 await page.locator('[data-action="export"]').click();const download=page.waitForEvent('download');await page.locator('[data-action="png"]').click();
 const pngPath=path.join(out,'export-300dpi.png');await (await download).saveAs(pngPath);
 const png=await readFile(pngPath);assert.equal(png.subarray(1,4).toString(),'PNG');let phys;
 for(let off=8;off+12<=png.length;) {const len=png.readUInt32BE(off),type=png.toString('ascii',off+4,off+8);if(type==='pHYs')phys=[png.readUInt32BE(off+8),png.readUInt32BE(off+12),png[off+16]];off+=12+len;}
 assert.deepEqual(phys,[11811,11811,1]);checks.push('real UI PNG download + 300 dpi pHYs');
 await page.locator('#dialog').evaluate(d=>d.close());
 // Exercise the actual renderer and then decode its encoded PNG: independent pixel measurements.
 const pixels=await page.evaluate(async()=>{
  const {renderPaper}=await import('/src/render/ecg.ts'),{DEFAULT_CASE,cloneCase,LEADS}=await import('/src/engine/types.ts');
  const {synthesize}=await import('/src/engine/signal.ts');
  const seed=cloneCase(DEFAULT_CASE),s=synthesize(seed,10);for(const l of LEADS)s.leads[l].fill(0);
  const results=[],ppm=300/25.4;
  for(const speed of [12.5,25,50])for(const gain of [2.5,5,10,20]){
   const c=cloneCase(seed);Object.assign(c.view,{speed,gain,chestGain:gain,grid:true,fit:false,palette:'paper',format:'3x4'});
   const canvas=document.createElement('canvas'),layout=renderPaper(canvas,s,c,1000,{pxPerMm:ppm,ratio:1});
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),img=await createImageBitmap(blob);
   const decoded=document.createElement('canvas');decoded.width=img.width;decoded.height=img.height;
   const ctx=decoded.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const {data}=ctx.getImageData(0,0,img.width,img.height);
   const dark=(x,y)=>{const i=4*(Math.round(y)*img.width+Math.round(x));return data[i]<120&&data[i+1]<120&&data[i+2]<120;};
   const base=layout.segments[0].baseline;
   // Pulse top at midpoint of its plateau; bottom at the leading baseline stub.
   const ys=[];for(let y=Math.floor((base-gain-1)*ppm);y<=Math.ceil((base+1)*ppm);y++)if(dark((2+.1*speed)*ppm,y))ys.push(y);
   const bs=[];for(let y=Math.floor((base-.5)*ppm);y<=Math.ceil((base+.5)*ppm);y++)if(dark(1.5*ppm,y))bs.push(y);
   // Half-height intersects only the two vertical sides.
   const xs=[];for(let x=Math.floor(ppm);x<=Math.ceil((3+.2*speed)*ppm);x++)if(dark(x,(base-gain*.5)*ppm))xs.push(x);
   const groups=[];for(const x of xs){if(!groups.length||x>groups.at(-1).at(-1)+1)groups.push([]);groups.at(-1).push(x);}
   const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
   // Bold 5-mm grid measured from a clean scan line below the title, before traces.
   const majors=[];const gy=Math.round(15.4*ppm);
   for(let x=Math.round(20*ppm);x<Math.round(80*ppm);x++){const i=4*(gy*img.width+x);if(data[i]>190&&data[i]<240&&data[i+1]<210&&data[i+2]<218)majors.push(x);}
   const gg=[];for(const x of majors){if(!gg.length||x>gg.at(-1).at(-1)+1)gg.push([]);gg.at(-1).push(x);}
   const centers=gg.map(mean),steps=centers.slice(1).map((v,i)=>v-centers[i]);
   results.push({speed,gain,widthPx:groups.length===2?mean(groups[1])-mean(groups[0]):null,heightPx:ys.length&&bs.length?mean(bs)-mean(ys):null,expectedWidthPx:.2*speed*ppm,expectedHeightPx:gain*ppm,grid5mmPx:steps.length?mean(steps):null,expectedGrid5mmPx:5*ppm});
   img.close();canvas.width=decoded.width=0;
  }
  return results;
 });
 for(const p of pixels){assert.ok(p.widthPx!==null&&Math.abs(p.widthPx-p.expectedWidthPx)<2,JSON.stringify(p));assert.ok(p.heightPx!==null&&Math.abs(p.heightPx-p.expectedHeightPx)<2,JSON.stringify(p));assert.ok(p.grid5mmPx!==null&&Math.abs(p.grid5mmPx-p.expectedGrid5mmPx)<1,JSON.stringify(p));}
 checks.push('12 PNG pixel-calibration combinations: pulse width/height + 5-mm grid');
 await page.setViewportSize({width:390,height:844});await page.goto(url);await ready();
 assert.ok(await page.locator('#ecg').isVisible());assert.match(await page.locator('#case-title').innerText(),/sinusal/i);
 await page.locator('[data-action="catalog"]').click();await select('anterior');await phase('hyperacute');
 await page.locator('#beat-detail').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile.png')});checks.push('390x844 emulated viewport: catalog / phase / trace');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'browser-results.json'),JSON.stringify({url,checks,pixels,errors,warnings,browser:await browser.version(),viewports:[[1440,1000],[390,844]],physicalDeviceTest:false},null,2));
 console.log(JSON.stringify({passed:checks.length,pixelCases:pixels.length,errors}));
} catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({checks,errors,warnings,error:String(e)},null,2));throw e;}
finally{await browser.close();}
