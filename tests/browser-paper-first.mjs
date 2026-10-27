import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {installWorkerTap,readTrace,workerReplies,waitForReply} from './support/worker-tap.mjs';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
const out=resolve(process.argv[2]||'../ECG-QA/paper-first-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),report={cases:[],errors:[]};let page,failure;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function closeDialog(){await page.evaluate(()=>{window.__paperDialogClosed=false;document.querySelector('#dialog').addEventListener('close',()=>{window.__paperDialogClosed=true;},{once:true});});await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__paperDialogClosed);}
async function view(mode){if(!await page.locator('.paper-menu').evaluate(e=>e.open))await page.locator('.paper-menu > summary').click();await page.locator(`[data-mode=${mode}]`).click();assert.equal(await page.locator(`[data-mode=${mode}]`).getAttribute('aria-selected'),'true');await page.keyboard.press('Escape');}
async function fitsDialog(){const b=await page.locator('#dialog').evaluate(e=>({scroll:e.scrollHeight-e.clientHeight,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,w:innerWidth,h:innerHeight}));assert(b.scroll<=2&&b.x>=-2&&b.right<=b.w+2&&b.y>=-2&&b.bottom<=b.h+2,JSON.stringify(b));}
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
   assert.equal(await page.locator('#metrics .metric').count(),1);assert.doesNotMatch(await page.locator('#metrics').innerText(),/PR|QRS|QTc|Eje/);
   assert.equal(await page.getByRole('tab',{name:'Monitor',exact:true}).isVisible(),false);
   const paperTop=(await page.locator('#ecg').boundingBox()).y;if(!v.zoom)assert(paperTop<260,`Paper starts too low: ${paperTop}`);
   for(const seg of layout.segments){
    const gain=seg.lead.startsWith('V')?trace.case.view.chestGain:trace.case.view.gain;
    const values=trace.leads[seg.lead].slice(Math.round(seg.start*trace.fs),Math.round((seg.start+seg.duration)*trace.fs));
    for(const sample of values){const y=seg.baseline-sample*gain*seg.polarity;assert(y>=seg.y+9-1e-6&&y<=seg.y+seg.height-3+1e-6,`${id}: sample outside row`);}
   }
   if(id==='anterior')await page.screenshot({path:resolve(out,`workspace-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
   await page.locator('.trace-tools [data-action=measurements]').click();await page.getByRole('dialog',{name:'Medidas',exact:true}).waitFor();
   assert.deepEqual(await page.locator('.measurements-summary thead th').allTextContents(),['Medida','Modelo','Estimación']);
   assert.equal(await page.locator('.measurements-summary tbody tr').count(),5);assert.equal(await page.locator('#analyzer-info').evaluate(e=>e.open),false);
   if(id==='vf')assert.deepEqual(await page.locator('.measurements-summary td').evaluateAll(es=>es.map(e=>e.firstChild.textContent)),Array(10).fill('—'));
   if(!v.zoom)await fitsDialog();
   if(id==='anterior')await page.screenshot({path:resolve(out,`measures-${v.width}-${v.height}-${v.dark?'dark':v.zoom?'zoom':'light'}.png`)});
   await page.locator('#analyzer-info > summary').click();assert(await page.locator('#analyzer-info .evidence-badge').count()>0);
   await closeDialog();assert.equal(hash(await readTrace(page)),signature);assert.equal(await workerReplies(page),n);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   report.cases.push({...v,id,paperTop,heightMm:layout.heightMm});await writeFile(resolve(out,'progress.json'),JSON.stringify(report.cases));
  }
  await page.locator('.paper-menu > summary').click();
  assert.equal(await page.locator('.view-settings').evaluate(e=>e.open),false);assert.equal(await page.locator('.view-aids').evaluate(e=>e.open),false);
  if(!v.zoom){const menu=await page.locator('.view-options').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,h:innerHeight,w:innerWidth,scroll:e.scrollHeight-e.clientHeight};});assert(menu.x>=-2&&menu.right<=menu.w+2&&menu.bottom<=menu.h+2&&menu.scroll<=2,JSON.stringify(menu));}
  if(v.width===320&&!v.zoom)await page.screenshot({path:resolve(out,'view-menu-320.png')});
  await page.locator('.view-settings > summary').click();assert.equal(await page.locator('[data-key="view.speed"]').isVisible(),true);await page.locator('.view-settings > summary').click();
  await page.locator('.view-aids > summary').click();assert.equal(await page.locator('[data-action=teaching]').isVisible(),true);await page.locator('.view-aids > summary').click();await page.keyboard.press('Escape');
  await view('monitor');assert.equal(await page.locator('[data-action=pause]').isVisible(),true);assert.equal(await page.locator('[data-action=caliper]').isHidden(),true);
  await view('rhythm');assert.match(await page.locator('#ecg').getAttribute('aria-label'),/ECG sintético/);
  await view('paper');assert.equal(await page.locator('[data-action=caliper]').isVisible(),true);
  await page.locator('[data-action=about]').click();assert.deepEqual(await page.locator('.information-content > details > summary').allTextContents(),['Cómo se genera este ECG','Referencias y atribución','Atajos de teclado']);
  await page.getByText('Cómo se genera este ECG',{exact:true}).click();assert.match(await page.locator('#dialog').innerText(),/sin ruido de adquisición añadido/);assert.equal(await page.locator('#analyzer-info').count(),0);await closeDialog();
  await page.locator('[data-action=quiz]').click();await page.locator('#signal-loading').waitFor({state:'hidden'});assert.match(await page.locator('#metrics').innerText(),/\?/);assert.equal(await page.locator('.trace-tools [data-action=measurements]').isDisabled(),true);
  await page.locator('[data-action=about]').click();assert.equal(await page.locator('.model-note').count(),0);await closeDialog();
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(e){failure=String(e.stack||e);if(page&&!page.isClosed())await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({...report,failure,passed:!failure},null,2));}
console.log(JSON.stringify({passed:!failure,cases:report.cases.length,failure,evidence:out}));if(failure)process.exitCode=1;
