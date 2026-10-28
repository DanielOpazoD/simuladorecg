/** Independent catalog comparison: final worker samples and raster calibration.
 * No renderer helper participates in the oracle. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { chooseCatalogPreset } from './support/catalog-navigation.mjs';

const url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/';
const out=resolve(process.argv[2]||'../ECG-QA/case-comparison-browser');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const browser=await chromium.launch({headless:true}),results=[],errors=[],warnings=[];
let failure,activePage;

async function installAudit(page) {
 await page.addInitScript(()=>{
  const Native=window.Worker,audit=window.__comparisonAudit={workers:[],mainId:null};
  window.Worker=class extends Native {
   constructor(...args) {
    super(...args);const state=this.auditState={id:audit.workers.length+1,terminated:false,posts:0,last:null};
    this.auditRequests=new Map();audit.workers.push(state);
    this.addEventListener('message',event=>{
     const ecg=this.auditRequests.get(event.data?.id);this.auditRequests.delete(event.data?.id);
     if(ecg)state.last={ecg,data:event.data};
    });
   }
   postMessage(message,...args) {
    if(message?.ecg){this.auditState.posts++;this.auditRequests.set(message.id,structuredClone(message.ecg));}
    return super.postMessage(message,...args);
   }
   terminate(){this.auditState.terminated=true;this.auditRequests.clear();return super.terminate();}
  };
 });
}

// Retain the same worker object delivered to the app. Hash every acquired double,
// events, measurement and request case, rather than an arbitrary10s window.
async function mainSnapshot(page) {
 return page.evaluate(async()=>{
  const state=window.__comparisonAudit.workers.find(w=>w.id===window.__comparisonAudit.mainId),record=state.last;
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const text=value=>digest(new TextEncoder().encode(JSON.stringify(value)));
  const {leads,...signal}=record.data.signal;
  return {posts:state.posts,case:await text(record.ecg),metadata:await text({...signal,measurement:record.data.measurement}),
   leads:await Promise.all(Object.entries(leads).map(async([lead,values])=>[lead,values.length,await digest(values)])),
   paper:await text(document.querySelector('#ecg').toDataURL())};
 });
}

// Connected dark pixels in the calibration margin identify the1mV pulse.
// Its height and top plateau are measured independently of drawing operations.
async function calibrationPixels(page,speed,gain) {
 return page.locator('.comparison-paper canvas').evaluateAll((canvases,{speed,gain})=>canvases.map(canvas=>{
  const cssWidth=parseFloat(canvas.style.width),ratio=canvas.width/cssWidth;
  // Initial6x2 paper:10s times speed plus22mm outer margins and one1mm lead gap.
  const pxPerMm=canvas.width/(speed*10+23),width=Math.min(canvas.width,Math.floor(15*pxPerMm));
  const y0=Math.floor(18*pxPerMm),height=Math.min(Math.ceil(60*pxPerMm),canvas.height-y0);
  const rgba=canvas.getContext('2d').getImageData(0,y0,width,height).data,seen=new Uint8Array(width*height),components=[];
  const dark=i=>rgba[i*4+3]>128&&rgba[i*4]<185&&rgba[i*4+1]<190&&rgba[i*4+2]<195;
  for(let i=0;i<seen.length;i++){
   if(seen[i]||!dark(i))continue;
   const todo=[i],points=[];seen[i]=1;
   while(todo.length){const p=todo.pop(),x=p%width,y=Math.floor(p/width);points.push({x,y});
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]]){
     if(nx<0||nx>=width||ny<0||ny>=height)continue;const n=ny*width+nx;if(!seen[n]&&dark(n)){seen[n]=1;todo.push(n);}
    }
   }
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minY=Math.min(...ys),maxY=Math.max(...ys);
   if(Math.max(...xs)-Math.min(...xs)<speed*.15*pxPerMm||maxY-minY<gain*.65*pxPerMm)continue;
   // Rounded/antialiased corners can occupy only inner pixels on the first
   // raster row. Include the next row to locate the two vertical step edges.
   const top=points.filter(p=>p.y<=minY+1).map(p=>p.x);
   components.push({y:minY+y0,height:maxY-minY,plateau:Math.max(...top)-Math.min(...top)});
  }
  components.sort((a,b)=>a.y-b.y);
  return {width:canvas.width,cssWidth,ratio,pxPerMm,pulse:components[0]||null,expectedHeight:gain*pxPerMm,expectedPlateau:.2*speed*pxPerMm};
 }),{speed,gain});
}

try {
 for(const {width,height} of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});activePage=page;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await installAudit(page);
  await page.addInitScript(width=>{localStorage.setItem('ecglab-theme','light');localStorage.setItem('ecglab-acquisition',width===390?'ideal':'realistic');},width);
  await page.goto(url);assert.match(await page.title(),/ECG/i);
  await page.locator('#signal-loading').waitFor({state:'hidden'});await chooseCatalogPreset(page,'anterior');
  await page.waitForFunction(()=>document.querySelector('#signal-loading').hidden&&window.__comparisonAudit.workers.some(w=>w.last?.ecg.presetId==='anterior'));
  await page.evaluate(()=>{window.__comparisonAudit.mainId=window.__comparisonAudit.workers.findLast(w=>!w.terminated&&w.last?.ecg.presetId==='anterior').id;});
  const visibleControls=await page.locator('.trace-toolbar button, .trace-toolbar summary').evaluateAll(es=>es.filter(e=>e.checkVisibility()).length);
  assert.equal(visibleControls,8,'Reuse the five reading actions and the three existing zoom controls');
  assert.equal(await page.locator('.view-aids').evaluate(e=>e.open),false);
  const info=page.locator('[data-action=about]:visible');assert.equal(await info.count(),1);assert.match(await info.innerText(),/Información y fuentes/);
  assert.equal(await page.locator('[data-action=lens-previous], [data-action=lens-change]').count(),0);
  const speed=width===1440?50:25,gain=width===1440?5:10;
  if(width===1440){await page.locator('.paper-menu > summary').click();if(!await page.locator('.view-settings').evaluate(e=>e.open))await page.locator('.view-settings > summary').click();await page.locator('[data-key="view.speed"]').selectOption('50');await page.locator('[data-key="view.gain"]').selectOption('5');await page.locator('.paper-menu > summary').click();}
  // Read -> inspect -> measure using the same controls as the learner.
  const lead=page.locator('[data-reading-segment="7"]');await lead.click();
  assert.equal(await page.locator('#lead-explorer').getAttribute('data-lead'),'V2');
  await page.keyboard.press('Escape');assert.equal(await lead.evaluate(e=>e===document.activeElement),true);
  await page.locator('[data-action=automatic]').click();
  const automatic=await page.locator('#automatic-overlay').innerHTML();
  await page.locator('[data-action=caliper]').click();
  await page.locator('#caliper-segment').selectOption('0');
  await page.locator('#caliper-endpoint').selectOption('1');await page.locator('#caliper-time').fill('200');await page.locator('#caliper-time').press('Tab');
  await page.locator('#caliper-endpoint').selectOption('2');await page.locator('#caliper-time').fill('400');await page.locator('#caliper-time').press('Tab');
  assert.equal(await page.locator('#measurement-values').getAttribute('data-ms'),'200');
  const manual=await page.locator('#measurement-values').innerText();
  await page.locator('[data-action=compare]').scrollIntoViewIfNeeded();
  const readingPosition=await page.evaluate(()=>({x:scrollX,y:scrollY,left:document.querySelector('#canvas-wrap').scrollLeft,top:document.querySelector('#canvas-wrap').scrollTop}));
  const before=await mainSnapshot(page);
  assert(before.leads.every(([,length])=>length===32500),'Identity includes the complete65s at500Hz');
  await page.locator('[data-action=compare]').click();await page.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
  assert.equal(await page.locator('#comparison-reference').inputValue(),'sinus');
  assert.equal(await page.locator('#comparison-current-name').textContent(),await page.locator('#case-title').textContent());
  assert.match(await page.locator('.comparison-controls').innerText(),/Ejemplos independientes/);
  const geometry=await page.locator('#dialog').evaluate(d=>({overflow:d.scrollHeight-d.clientHeight,panes:[...d.querySelectorAll('.comparison-paper')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};})}));
  assert(geometry.overflow<=2&&geometry.panes.every(r=>r.top>=0&&r.bottom<=height&&r.height>=80),'Both ECGs and their controls must remain in the viewport: '+JSON.stringify(geometry));
  const calibration=await calibrationPixels(page,speed,gain);
  await writeFile(resolve(out,`calibration-${width}.json`),JSON.stringify(calibration,null,2));
  assert.equal(calibration[0].width,calibration[1].width);assert.equal(calibration[0].pxPerMm,calibration[1].pxPerMm);
  assert.equal(calibration[0].pulse?.y,calibration[1].pulse?.y,'Corresponding rows share the same raster baseline');
  for(const c of calibration){assert(c.pulse,'Calibration pulse visible in raster');assert(Math.abs(c.pulse.height-c.expectedHeight)<=1.5,'1mV pulse height');assert(Math.abs(c.pulse.plateau-c.expectedPlateau)<=1.5,'200ms pulse plateau');}
  await page.screenshot({path:resolve(out,`comparison-${width}.png`)});
  // Negative control: removing the calibration margin must fail the pixel oracle.
  // Choosing the next reference redraws the image from the untouched samples.
  await page.locator('#comparison-example').evaluate((canvas,speed)=>canvas.getContext('2d').clearRect(0,0,Math.ceil(15*canvas.width/(speed*10+23)),canvas.height),speed);
  const erasedCalibration=await calibrationPixels(page,speed,gain);
  await writeFile(resolve(out,`negative-calibration-${width}.json`),JSON.stringify(erasedCalibration,null,2));
  assert.equal(erasedCalibration[1].pulse,null,'Missing raster calibration must be rejected');
  await page.locator('#comparison-reference').selectOption('lbbb');await page.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
  assert.match(await page.locator('#comparison-reference-name').textContent(),/izquierd/i);
  await page.evaluate(()=>{const select=document.querySelector('#comparison-reference');for(const id of ['af','inferior','lateral']){select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));}});
  await page.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();
  assert.equal(await page.locator('#comparison-reference').inputValue(),'lateral');assert.match(await page.locator('#comparison-reference-name').textContent(),/lateral/i);
  const reference=await page.evaluate(()=>window.__comparisonAudit.workers.findLast(w=>!w.terminated&&w.id!==window.__comparisonAudit.mainId).last.ecg);
  assert.equal(reference.presetId,'lateral');assert.equal(reference.view.speed,speed);assert.equal(reference.view.gain,gain);
  assert.equal(reference.acquisition,width===390?'ideal':'realistic');
  await page.locator('.comparison-paper').first().evaluate(e=>e.scrollLeft=100);
  await page.waitForFunction(()=>{const e=[...document.querySelectorAll('.comparison-paper')];return Math.abs(e[0].scrollLeft-e[1].scrollLeft)<=1;});
  const canScroll=await page.locator('.comparison-paper').first().evaluate(e=>e.scrollHeight>e.clientHeight);
  await page.locator('.comparison-paper').first().evaluate(e=>e.scrollTop=150);
  await page.waitForFunction(canScroll=>{const e=[...document.querySelectorAll('.comparison-paper')];return (!canScroll||e[0].scrollTop>0)&&Math.abs(e[0].scrollTop-e[1].scrollTop)<=1;},canScroll);
  if(canScroll){
   const pane=await page.locator('.comparison-paper').last().boundingBox();
   const previousTop=await page.locator('.comparison-paper').last().evaluate(e=>e.scrollTop);
   await page.mouse.move(pane.x+30,pane.y+30);await page.mouse.wheel(0,-80);
   await page.waitForFunction(previousTop=>{const e=[...document.querySelectorAll('.comparison-paper')];return e[1].scrollTop<previousTop&&Math.abs(e[0].scrollTop-e[1].scrollTop)<=1;},previousTop);
  }
  // Gestures on the backdrop must not move the original reading position.
  await page.mouse.move(2,height/2);await page.mouse.wheel(0,400);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,left:document.querySelector('#canvas-wrap').scrollLeft,top:document.querySelector('#canvas-wrap').scrollTop})),readingPosition);
  const overflow=await page.locator('.case-comparison').evaluate(root=>{const bounds=root.getBoundingClientRect();return [...root.querySelectorAll('select,label,p,figcaption')].filter(e=>e.checkVisibility()).filter(e=>{const b=e.getBoundingClientRect();return b.left<bounds.left-2||b.right>bounds.right+2;}).map(e=>e.outerHTML);});assert.deepEqual(overflow,[]);
  await page.locator('#dialog [data-action=close-dialog]').click();
  assert.equal(await page.locator('[data-action=compare]').evaluate(b=>b===document.activeElement),true);assert.deepEqual(await mainSnapshot(page),before);
  assert.equal(await page.locator('#measurement-values').innerText(),manual);
  assert.equal(await page.locator('#automatic-overlay').innerHTML(),automatic);
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,left:document.querySelector('#canvas-wrap').scrollLeft,top:document.querySelector('#canvas-wrap').scrollTop})),readingPosition);
  await page.waitForFunction(()=>window.__comparisonAudit.workers.every(w=>w.id===window.__comparisonAudit.mainId||w.terminated));
  await page.locator('[data-action=compare]').click();await page.locator('#comparison-reference-sheet[aria-busy=false]').waitFor();assert.equal(await page.locator('#comparison-reference').inputValue(),'lateral');
  await page.locator('#dialog [data-action=close-dialog]').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
  assert.equal(await page.locator('[data-action=compare]').evaluate(b=>b===document.activeElement),true);
  await page.locator('[data-action=compare]').click();await page.locator('#comparison-reference').waitFor();
  const closedPending=await page.evaluate(()=>{const s=document.querySelector('#comparison-reference');s.value='vf';s.dispatchEvent(new Event('change',{bubbles:true}));const busy=document.querySelector('#comparison-reference-sheet').getAttribute('aria-busy')==='true';document.querySelector('#dialog [data-action=close-dialog]').click();return busy;});assert.equal(closedPending,true);
  await page.waitForFunction(()=>window.__comparisonAudit.workers.every(w=>w.id===window.__comparisonAudit.mainId||w.terminated));assert.deepEqual(await mainSnapshot(page),before);
  await page.getByRole('button',{name:'Practicar',exact:true}).click();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-action=compare]').isHidden(),true);
  const workers=await page.evaluate(()=>window.__comparisonAudit.workers.length);
  await page.evaluate(()=>{const button=document.createElement('button');button.dataset.action='compare';document.body.append(button);button.click();button.remove();});
  assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);assert.equal(await page.evaluate(()=>window.__comparisonAudit.workers.length),workers);
  await page.getByRole('button',{name:'Salir de práctica'}).click();assert.equal(await page.locator('vite-error-overlay').count(),0);
  results.push({width,speed,gain,visibleControls,calibration,erasedCalibrationRejected:true,latestReference:true,completeRecordUnchanged:true,mainCanvasUnchanged:true,cleanupPending:true,keyboardFocus:true,practiceRouteBlocked:true});await page.close();
 }
 assert.deepEqual(errors,[]);
} catch(error) {failure=String(error.stack||error);if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'failure-dom.html'),await activePage.content()).catch(()=>{});}}
finally {await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({url,results,errors,warnings,failure,clinicalValidation:false},null,2));}
if(failure){console.error(failure);process.exitCode=1;}else console.log(JSON.stringify({passed:true,cases:results.length,evidence:out}));
