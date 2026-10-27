/** Actual UI, complete worker records, exports and independent sample checks. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace,workerReplies,waitForReply} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {startManualMeasurement} from './support/manual-measurement.mjs';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:4173/',out=resolve(process.argv[2]||'../ECG-QA/interactive-reading-browser');
await mkdir(dirname(out),{recursive:true});await mkdir(out);
const hash=x=>createHash('sha256').update(x).digest('hex');
const signature=async page=>hash(JSON.stringify(await readTrace(page,{seconds:65})));
const browser=await chromium.launch({headless:true}),report={cases:[],errors:[],warnings:[],clinicalValidation:false};let active,failure;
async function importCase(page,c){const n=await workerReplies(page);await page.locator('#file-input').setInputFiles({name:'case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c))});await waitForReply(page,n);}
async function png(page,name){await page.locator('[data-action=export]').click();const p=page.waitForEvent('download');await page.locator('[data-action=png]').click();await(await p).saveAs(resolve(out,name));await page.locator('[data-action=close-dialog]').click();return hash(await readFile(resolve(out,name)));}
async function assertBoxes(page,trace){
 const boxes=await page.locator('.reading-focus-box').evaluateAll(es=>es.map(e=>({...e.dataset,x:Number(e.getAttribute('x')),width:Number(e.getAttribute('width'))})));
 for(const b of boxes){const lo=Math.round(Number(b.start)*trace.fs),hi=Math.round(Number(b.end)*trace.fs),a=trace.leads[b.lead].slice(lo,hi+1);
  assert(a.length>1);assert.equal(Number(b.low),Math.min(...a));assert.equal(Number(b.high),Math.max(...a));assert(Math.abs(b.width-(Number(b.end)-Number(b.start))*trace.case.view.speed)<1e-8);
 }
 return boxes;
}
try{
 for(const v of [{width:1440,theme:'light',scale:1},{width:390,theme:'light',scale:1},{width:320,theme:'dark',scale:1},{width:320,theme:'light',scale:2}]){
  const page=active=await browser.newPage({viewport:{width:v.width,height:1000},hasTouch:v.width<600,reducedMotion:'reduce',acceptDownloads:true});await installWorkerTap(page);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.addInitScript(theme=>{localStorage.setItem('ecglab-theme',theme);localStorage.setItem('ecglab-acquisition','ideal');},v.theme);
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  if(v.scale===2)await page.addStyleTag({content:'html{font-size:200%!important}'});
  const families=v.width===1440?['sinus','lbbb','inferior','anterior','af','pvc','vf','asystole']:['sinus','anterior'];
  for(const id of families){
   if(id!=='sinus'){await chooseCatalogPreset(page,id);await page.locator('#signal-loading').waitFor({state:'hidden'});}
   const before=await signature(page),trace=await readTrace(page),count=await workerReplies(page),canvas=await page.locator('#ecg').evaluate(c=>c.toDataURL()),metrics=await page.locator('#metrics').innerText();
   const opener=page.locator('[data-reading-segment="7"]');await opener.focus();await page.keyboard.press('Enter');
   const detail=page.locator('#lead-explorer');assert.equal(await detail.getAttribute('data-lead'),'V2');assert(Number(await detail.getAttribute('data-start'))>=5);
   const t0=await detail.getAttribute('data-start');await page.getByLabel('Derivación ampliada',{exact:true}).selectOption('aVL');assert.equal(await detail.getAttribute('data-start'),t0);
   assert.equal(await page.locator('.lead-detail-orientation,.lead-detail-time,.reading-lead-arrow').count(),0);
   assert.doesNotMatch(await detail.innerText(),/del registro|QRS \d+ del modelo|Orientación anatómica|Observa la forma/);
   if(id==='sinus')await page.screenshot({path:resolve(out,`lead-${v.width}-${v.theme}-${v.scale}.png`)});
   const overflowing=await detail.evaluate(root=>[...root.querySelectorAll('p,label,select,figure')].filter(e=>e.checkVisibility()).filter(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.left<b.left-2||a.right>b.right+2;}).map(e=>e.className));assert.deepEqual(overflowing,[]);
   if(v.width<600){const box=await page.locator('#dialog').boundingBox();assert(Math.abs(box.x)<2);assert(Math.abs(box.y+box.height-1000)<2);}
   await page.keyboard.press('Escape');assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
   assert.equal(await opener.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','Lead hit areas must never paint over acquired waves');
   const findings=page.locator('[data-finding]');assert(await findings.count()>0);
   await findings.first().click();assert.equal(await page.locator('[data-finding][aria-pressed=true]').count(),1);assert.equal(await page.locator('#finding-focus').isVisible(),true);
   const banner=await page.locator('#finding-focus').boundingBox();assert(banner.y>=-2&&banner.y<1000,'Explanation and close control stay in the viewport');
   const boxes=await assertBoxes(page,trace);assert(boxes.length>0);
   if(id==='anterior'||id==='lbbb')await page.screenshot({path:resolve(out,`focus-${id}-${v.width}-${v.theme}-${v.scale}.png`)});
   if(await findings.count()>1){await findings.nth(1).click();assert.equal(await page.locator('[data-finding][aria-pressed=true]').count(),1);await assertBoxes(page,trace);}
   assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),canvas,'Only the separate overlay changes');
   assert.equal(await signature(page),before);assert.equal(await workerReplies(page),count);assert.equal(await page.locator('#metrics').innerText(),metrics);
   await page.getByRole('button',{name:'Quitar explicación',exact:true}).click();assert.equal(await page.locator('.reading-focus-box').count(),0);
   report.cases.push({...v,id,hash:before,boxes:boxes.length});
  }
  await chooseCatalogPreset(page,'anterior');await page.locator('#signal-loading').waitFor({state:'hidden'});
  const saved=(await readTrace(page)).case;
  if(v.width===1440){
   const a=await png(page,'plain-before.png');await page.locator('[data-finding]').first().click();const b=await png(page,'plain-after.png');assert.equal(a,b,'PNG is byte-identical with a finding selected');
   await page.getByRole('button',{name:'Quitar explicación',exact:true}).click();
   // The simplified UI intentionally normalizes imported hidden view controls.
   await importCase(page,{...saved,view:{...saved.view,format:'3x4',timing:'simultaneous',cabrera:true,speed:50,gain:5,chestGain:20}});
   await page.getByRole('button',{name:/Ampliar aVR/}).click();assert.equal(await page.locator('#lead-explorer').getAttribute('data-polarity'),'1');assert(Number(await page.locator('#lead-explorer').getAttribute('data-start'))>=2.5);
   assert.equal(await page.getByLabel('Derivación ampliada',{exact:true}).inputValue(),'aVR');await page.keyboard.press('Escape');
   await page.locator('[data-finding]').first().click();await assertBoxes(page,await readTrace(page));
  }
  await importCase(page,{...saved,artifacts:{...saved.artifacts,reversed:true}});
  assert.equal(await page.locator('[data-finding]').count(),0);assert.equal(await page.locator('.reading-focus-box').count(),0);
  await page.locator('[data-reading-segment="0"]').click();assert.equal(await page.locator('.lead-detail-orientation svg').count(),0);assert.match(await page.locator('.lead-detail-observe').innerText(),/invertidos/);await page.keyboard.press('Escape');
  await importCase(page,saved);
  if(v.width<600){
   await page.locator('#canvas-wrap').evaluate(e=>{e.scrollLeft=0;e.scrollIntoView({block:'start'});});
   const r=await page.locator('#ecg').boundingBox(),cdp=await page.context().newCDPSession(page),y=Math.max(0,r.y)+200;
   assert(y>r.y&&y<r.y+r.height&&y<1000,'Touch starts inside the visible paper, including enlarged text');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:v.width-50,y}]});
   for(let k=1;k<=5;k++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:v.width-50-k*30,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);assert(await page.locator('#canvas-wrap').evaluate(e=>e.scrollLeft)>0,'Native touch pan must still work');await cdp.detach();
  }
  // A dragging gesture is not a tap, and calibrating does not open a sheet.
  const cb=await page.locator('#ecg').boundingBox();await page.evaluate(()=>scrollTo(0,0));await page.locator('#canvas-wrap').evaluate(e=>e.scrollLeft=0);
  const rect=await page.locator('#ecg').boundingBox(),x=rect.x+110,y=rect.y+190;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+15,{steps:5});await page.mouse.up();assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
  await startManualMeasurement(page);assert.equal(await page.locator('#reading-overlay').isHidden(),true);await page.locator('#ecg').click({position:{x:150,y:190}});assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);await page.locator('[data-action=caliper]').click();
  await page.locator('[data-action=quiz]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.equal(await page.locator('[data-finding]').count(),0);assert.equal(await page.locator('#reading-overlay').isHidden(),true);
  await page.getByRole('button',{name:'Salir de práctica'}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(e){failure=String(e.stack||e);if(active&&!active.isClosed())await active.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({...report,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:report.cases.length,failure,evidence:out}));if(failure)process.exitCode=1;
