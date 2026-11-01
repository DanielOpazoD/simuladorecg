import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace,workerReplies,waitForReply} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {startManualMeasurement} from './support/manual-measurement.mjs';
const out=resolve(process.argv[2]||'../ECG-QA/paper-first-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),report={cases:[],errors:[]};let page,failure;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function closeDialog(){await page.evaluate(()=>{window.__paperDialogClosed=false;document.querySelector('#dialog').addEventListener('close',()=>{window.__paperDialogClosed=true;},{once:true});});await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__paperDialogClosed);}
async function view(mode){if(!await page.locator('.paper-menu').evaluate(e=>e.open))await page.locator('.paper-menu > summary').click();await page.locator(`[data-mode=${mode}]`).click();assert.equal(await page.locator(`[data-mode=${mode}]`).getAttribute('aria-selected'),'true');await page.keyboard.press('Escape');}
async function fitsDialog(){const b=await page.locator('#dialog').evaluate(e=>({scroll:e.scrollHeight-e.clientHeight,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,w:innerWidth,h:innerHeight}));assert(b.scroll<=2&&b.x>=-2&&b.right<=b.w+2&&b.y>=-2&&b.bottom<=b.h+2,JSON.stringify(b));}
async function exportHash(){await page.locator('[data-action=export]').click();const pending=page.waitForEvent('download');await page.locator('[data-action=png]').click();const download=await pending;const bytes=await readFile(await download.path());await closeDialog();return createHash('sha256').update(bytes).digest('hex');}
try{
 for(const v of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:390,height:844,dark:true},{width:320,height:568,zoom:true}]){
  page=await browser.newPage({viewport:v,reducedMotion:'reduce'});await installWorkerTap(page);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(dark=>{localStorage.setItem('ecglab-theme',dark?'dark':'light');localStorage.setItem('ecglab-acquisition','ideal');},!!v.dark);
  await page.goto(process.env.ECG_TEST_URL||'http://127.0.0.1:4173/');await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG Lab/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  if(v.zoom)await page.addStyleTag({content:'html{font-size:200%!important}'});
  for(const id of ['sinus','anterior','lvh','vf']){
   if(id!=='sinus'){const n=await workerReplies(page);await chooseCatalogPreset(page,id);await waitForReply(page,n);}
   await page.evaluate(()=>scrollTo(0,0));
   const trace=await readTrace(page),signature=hash(trace),n=await workerReplies(page),layout=JSON.parse(await page.locator('#reading-overlay').getAttribute('data-geometry'));
   assert.equal(await page.locator('#metrics .metric').count(),5);assert.deepEqual(await page.locator('#metrics .metric > span').allTextContents(),['FC','PR','QRS','QTc','Eje QRS']);
   if(id==='sinus'){
    const title=await page.locator('#case-title').boundingBox(),variants=await page.locator('#diagnosis-navigation').boundingBox(),summary=await page.locator('#metrics').boundingBox();
    assert(title.y+title.height<=variants.y,'Variants follow the case title');
    if(v.width>=1200&&!v.zoom)assert(variants.x+variants.width<=summary.x && Math.abs(variants.y+variants.height/2-summary.y-summary.height/2)<3,'Variants left and metrics right on the same row');
    else assert(variants.y+variants.height<=summary.y,'On smaller screens measures follow variants');
   }
   assert.equal(await page.getByRole('button',{name:'Medir automáticamente',exact:true}).isVisible(),true);
   const auto=page.locator('[data-action=automatic]'),paperPosition=await page.locator('#ecg').boundingBox();
   const originalPixels=await page.locator('#ecg').evaluate(e=>e.toDataURL());
   const autoPngBefore=id==='sinus'&&v.width===1440?await exportHash():null;
   await auto.click();assert.equal(await page.locator('#dialog').evaluate(e=>e.open),false);
   assert.equal(await auto.getAttribute('aria-pressed'),'true');
   const intervals=await page.locator('#automatic-overlay [data-interval]').evaluateAll(es=>es.map(e=>({key:e.dataset.interval,start:Number(e.dataset.start),end:Number(e.dataset.end),ms:Number(e.dataset.ms)})));
   if(id==='sinus')assert.deepEqual([...new Set(intervals.map(x=>x.key))],['pr','qrs','qt']);
   if(id==='sinus'&&!v.zoom){
    const labels=await page.locator('#automatic-overlay g[data-segment="0"] .auto-value, #automatic-overlay g[data-segment="1"] .auto-value, #automatic-overlay g[data-segment="2"] .auto-value').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,fontPx:parseFloat(getComputedStyle(e).fontSize)*e.getScreenCTM().a};}));
    assert.equal(labels.length,3);assert(labels.every(b=>b.left>=0&&b.right<=v.width),'Interval values must be readable without horizontal scrolling');
    assert(labels.every(b=>b.fontPx>=14),'Values must be at least 14 screen pixels');

   }
   if(id==='vf')assert.equal(intervals.length,0);
   for(const i of intervals)assert.equal(i.ms,Math.round((i.end-i.start)*1000));
   if(!v.zoom)assert.deepEqual(await page.locator('#ecg').boundingBox(),paperPosition,'Automatic intervals must not move the ECG');
   assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),originalPixels,'Overlay must not alter the calibrated canvas');
   if(autoPngBefore)assert.equal(await exportHash(),autoPngBefore,'Automatic reading aid must not alter the print export');
   if(id==='sinus')await page.screenshot({path:resolve(out,`auto-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
   if(!v.zoom){
    const zoom=page.locator('[data-action=zoom-in]');for(let step=0;step<3;step++)await zoom.click();
    const enlarged=await page.locator('#ecg').boundingBox(),overlay=await page.locator('#automatic-overlay').boundingBox();
    assert(Math.abs(enlarged.x-paperPosition.x)<1&&Math.abs(enlarged.y-paperPosition.y)<1,'Zoom must retain the paper anchor');
    assert(Math.abs(enlarged.width/paperPosition.width-1.75)<.001);
    assert(Math.abs(overlay.x-enlarged.x)<1&&Math.abs(overlay.y-enlarged.y)<1&&Math.abs(overlay.width-enlarged.width)<1,'Zoomed marks and paper must align');
    assert.deepEqual(await page.locator('#automatic-overlay [data-interval]').evaluateAll(es=>es.map(e=>({key:e.dataset.interval,start:Number(e.dataset.start),end:Number(e.dataset.end),ms:Number(e.dataset.ms)}))),intervals);
    if(autoPngBefore)assert.equal(await exportHash(),autoPngBefore,'Display zoom must not alter export');
    if(id==='sinus')await page.screenshot({path:resolve(out,`zoom-${v.width}-${v.height}-${v.dark?'dark':'light'}.png`)});
    await page.locator('[data-action=zoom-reset]').click();assert.deepEqual(await page.locator('#ecg').boundingBox(),paperPosition);
    assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),originalPixels,'Reset zoom must restore the original paper');
   }
   await auto.click();assert.equal(await page.locator('#automatic-overlay').isHidden(),true);
   assert.equal(hash(await readTrace(page)),signature);assert.equal(await workerReplies(page),n);
   if(id==='sinus'&&v.width===1440){
    const st=page.locator('[data-action=lens-st]');
    await st.click();await auto.click();
    assert.equal(await st.getAttribute('aria-pressed'),'false');assert.equal(await auto.getAttribute('aria-pressed'),'true');
    await st.click();assert.equal(await auto.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#automatic-overlay').isHidden(),true);
    await st.click();assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),originalPixels);
   }
   if(!v.zoom){
    for(const action of ['caliper','compare']){
     await page.locator(`[data-action=${action}]`).click();
     if(action==='compare')await page.locator('#dialog[open]').waitFor();
     assert.deepEqual(await page.locator('#ecg').boundingBox(),paperPosition,`${action} must not move the ECG`);
     if(action==='compare')await closeDialog();else await page.locator(`[data-action=${action}]`).click();
    }
    await page.locator('.paper-menu > summary').click();assert.deepEqual(await page.locator('#ecg').boundingBox(),paperPosition,'View menu must not move the ECG');await page.keyboard.press('Escape');
   }
   assert.equal(await page.getByRole('tab',{name:'Monitor',exact:true}).isVisible(),false);
   assert.equal(await page.locator('.trace-tools [data-action=caliper]').isVisible(),true);
   assert.equal(await page.locator('.case-group-count').count(),0);
   assert.equal(await page.locator('#case-subtitle').isHidden(),true);
   assert.equal(await page.locator('#reading-details > summary').innerText(),'Explicación');
   assert.equal(await page.locator('.workspace-footer [data-product-version]').count(),0);
   const paperTop=(await page.locator('#ecg').boundingBox()).y;if(!v.zoom)assert(paperTop<340,`Paper starts too low: ${paperTop}`);
   const metrics=await page.locator('#metrics .metric').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,right:r.right,overflow:e.scrollWidth-e.clientWidth};}));
   if(!v.zoom){assert(metrics.every(m=>m.y===metrics[0].y&&m.overflow<=2&&m.right<=v.width),JSON.stringify(metrics));}
   const jButton=page.locator('[data-action=lens-st]');assert.equal(await jButton.isVisible(),true);
   assert.equal(await jButton.isDisabled(),id==='vf');
   if(id!=='vf'){
    const pixels=await page.locator('#ecg').evaluate(e=>e.toDataURL());
    const pngBefore=id==='anterior'&&v.width===1440?await exportHash():null;
    await jButton.click();assert.equal(await jButton.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#st-lens-note').count(),0);
    if(!v.zoom)assert.deepEqual(await page.locator('#ecg').boundingBox(),paperPosition,'J/ST must not move the ECG');
    assert.notEqual(await page.locator('#ecg').evaluate(e=>e.toDataURL()),pixels);
    if(pngBefore)assert.equal(await exportHash(),pngBefore,'J/ST reading aid must not alter the print export');
    if(id==='anterior')await page.screenshot({path:resolve(out,`j-st-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
    await jButton.click();
    assert.equal(await page.locator('#ecg').evaluate(e=>e.toDataURL()),pixels);
    assert.equal(hash(await readTrace(page)),signature);assert.equal(await workerReplies(page),n);
   }
   for(const seg of layout.segments){
    const gain=seg.lead.startsWith('V')?trace.case.view.chestGain:trace.case.view.gain;
    const values=trace.leads[seg.lead].slice(Math.round(seg.start*trace.fs),Math.round((seg.start+seg.duration)*trace.fs));
    for(const sample of values){const y=seg.baseline-sample*gain*seg.polarity;assert(y>=seg.y+(seg.labelBandMm??9)-1e-6&&y<=seg.y+seg.height-1+1e-6,`${id}: sample outside row`);}
   }
   if(id==='anterior')await page.screenshot({path:resolve(out,`workspace-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
   await page.locator('#metrics .metric').first().click();await page.getByRole('dialog',{name:'Medidas',exact:true}).waitFor();
   const header=await page.locator('#dialog .dialog-head').evaluate(e=>[...e.children].map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:c.scrollWidth-c.clientWidth};}));
   assert(header.every(r=>r.overflow<=2),JSON.stringify(header));
   for(let a=0;a<header.length;a++)for(let b=a+1;b<header.length;b++){const x=header[a],y=header[b];assert(x.right<=y.x+1||y.right<=x.x+1||x.bottom<=y.y+1||y.bottom<=x.y+1,'Measurement header controls overlap');}
   assert.deepEqual(await page.locator('.measurements-summary thead th').allTextContents(),['Medida','Modelo','Estimación']);
   assert.equal(await page.locator('.measurements-summary tbody tr').count(),6);assert.equal(await page.locator('#analyzer-info').evaluate(e=>e.open),false);
   assert.equal(await page.locator('.measurements-summary tbody tr').nth(3).locator('th').innerText(),'QT');
   if(id==='vf')assert.deepEqual(await page.locator('.measurements-summary td').evaluateAll(es=>es.map(e=>e.firstChild.textContent)),Array(12).fill('—'));
   if(!v.zoom)await fitsDialog();
   if(id==='anterior')await page.screenshot({path:resolve(out,`measures-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
   await page.locator('#analyzer-info > summary').click();assert(await page.locator('#analyzer-info .evidence-badge').count()>0);
   await closeDialog();assert.equal(hash(await readTrace(page)),signature);assert.equal(await workerReplies(page),n);
   if(id==='anterior'){
    await startManualMeasurement(page);assert.equal(await page.locator('#ecg').evaluate(e=>e===document.activeElement),true);
    assert.equal(await page.getByRole('button',{name:'Ocultar medición',exact:true}).isVisible(),true);
    await page.locator('#caliper-segment').selectOption('0');
    await page.locator('#caliper-endpoint').selectOption('1');await page.locator('#caliper-time').fill('200');await page.locator('#caliper-time').press('Tab');
    await page.locator('#caliper-endpoint').selectOption('2');await page.locator('#caliper-time').fill('400');await page.locator('#caliper-time').press('Tab');
    assert(Math.abs(Number(await page.locator('#measurement-values').getAttribute('data-ms'))-200)<.01);
    await page.getByRole('button',{name:'Ocultar medición',exact:true}).click();assert.equal(await page.locator('#caliper-editor').isHidden(),true);
    assert.equal(await page.locator('#ecg').evaluate(e=>e===document.activeElement),true);
    assert.equal(hash(await readTrace(page)),signature);assert.equal(await workerReplies(page),n);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   report.cases.push({...v,id,paperTop,heightMm:layout.heightMm});await writeFile(resolve(out,'progress.json'),JSON.stringify(report.cases));
  }
  await page.locator('.paper-menu > summary').click();
  assert.equal(await page.locator('.view-settings').evaluate(e=>e.open),false);assert.equal(await page.locator('.view-aids').evaluate(e=>e.open),false);
  if(!v.zoom){const menu=await page.locator('.view-options').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,h:innerHeight,w:innerWidth,scroll:e.scrollHeight-e.clientHeight};});assert(menu.x>=-2&&menu.right<=menu.w+2&&menu.bottom<=menu.h+2&&menu.scroll<=2,JSON.stringify(menu));}
  if(v.width===320&&!v.zoom)await page.screenshot({path:resolve(out,'view-menu-320.png')});
  await page.locator('.view-settings > summary').click();assert.equal(await page.locator('[data-key="view.speed"]').isVisible(),true);await page.locator('.view-settings > summary').click();
  await page.locator('.view-aids > summary').click();assert.equal(await page.locator('[data-action=teaching]').isVisible(),true);await page.locator('.view-aids > summary').click();await page.keyboard.press('Escape');
  await view('monitor');assert.equal(await page.locator('[data-action=caliper]').isDisabled(),true);assert.equal(await page.locator('[data-action=pause]').isVisible(),true);assert.equal(await page.locator('[data-action=caliper]').isVisible(),true);
  await view('rhythm');assert.match(await page.locator('#ecg').getAttribute('aria-label'),/ECG sintético/);
  await view('paper');assert.equal(await page.locator('[data-action=caliper]').isVisible(),true);
  await page.locator('[data-action=about]').click();assert.deepEqual(await page.locator('.information-content > details > summary').allTextContents(),['Cómo se genera este ECG','Referencias y atribución','Atajos de teclado']);
  await page.getByText('Cómo se genera este ECG',{exact:true}).click();assert.match(await page.locator('#dialog').innerText(),/sin ruido de adquisición añadido/);assert.equal(await page.locator('#analyzer-info').count(),0);await closeDialog();
  await page.locator('[data-action=quiz]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.match(await page.locator('#metrics').innerText(),/\?/);assert.equal(await page.locator('[data-action=automatic]').isDisabled(),true);
  assert.equal(await page.locator('[data-action=lens-st]').isHidden(),true);
  await startManualMeasurement(page);assert.equal(await page.locator('#caliper-editor').isVisible(),true);
  await page.locator('#ecg').press('c');assert.equal(await page.locator('#caliper-editor').isHidden(),true);
  assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
  await page.locator('[data-action=about]').click();assert.equal(await page.locator('.model-note').count(),0);await closeDialog();
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(e){failure=String(e.stack||e);if(page&&!page.isClosed())await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({...report,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:report.cases.length,failure,evidence:out}));if(failure)process.exitCode=1;
