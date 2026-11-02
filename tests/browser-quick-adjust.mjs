/** Native edits -> existing model pipeline; editor never changes the paper to fit. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {chromium} from 'playwright';
import {chooseCatalogPreset} from './support/catalog-navigation.mjs';
import {installWorkerTap,readTrace,workerReplies,waitForReply} from './support/worker-tap.mjs';
const out=resolve(process.argv[2]??'../ECG-QA/quick-adjust');await mkdir(dirname(out),{recursive:true});await mkdir(out);
const baselines=process.argv[3]?JSON.parse(await readFile(resolve(process.argv[3]),'utf8')):[];
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const browser=await chromium.launch(),results=[],errors=[];let failure,active;
const url=process.env.ECG_TEST_URL??'http://127.0.0.1:4173/';
const geometry=p=>p.locator('#ecg').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,png:e.toDataURL()};});
const ready=p=>p.locator('#signal-loading').waitFor({state:'hidden'});
try{
 for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1280,height:720},{width:390,height:844,dark:true},{width:320,height:568}]){
  const p=active=await browser.newPage({viewport,reducedMotion:'reduce',acceptDownloads:true});p.setDefaultTimeout(15000);await installWorkerTap(p);
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.addInitScript(dark=>{localStorage.setItem('ecglab-acquisition','ideal');localStorage.setItem('ecglab-theme',dark?'dark':'light');},!!viewport.dark);
  await p.goto(url);await ready(p);await p.evaluate(()=>document.fonts.ready);
  assert.match(await p.title(),/ECG Lab/);assert.equal(await p.locator('vite-error-overlay').count(),0);
  const source=await readTrace(p,{seconds:65}),before=hash(source),paper=await geometry(p),replies=await workerReplies(p);
  const root=p.locator('#quick-adjust');assert(await root.isVisible());
  assert.deepEqual(await root.locator('[data-key]').evaluateAll(es=>es.map(e=>e.dataset.key)),['hr','pr','axis','qrs','conduction','qtc']);
  for(const key of ['hr','pr','axis','qrs','conduction','qtc']){
   assert.equal(await p.locator(`[data-key="${key}"]`).count(),1,'A single source control, no secondary copy');
   if(key==='conduction')continue;
   assert.equal(+(await root.locator(`[data-key="${key}"]`).inputValue()),source.case[key]);
   assert.equal(+(await root.locator(`[data-quick-number="${key}"]`).inputValue()),source.case[key]);
   assert(await root.locator(`[data-quick-number="${key}"]`).evaluate(e=>e.checkValidity()));
  }
  const layout=JSON.parse(await p.locator('#reading-overlay').getAttribute('data-geometry'));
  assert.equal(new Set(layout.segments.map(s=>s.lead)).size,12);
  const frame=await p.locator('#canvas-wrap').boundingBox(),panel=await root.boundingBox();
  if(viewport.width>=1152)assert(panel.x>=frame.x+frame.width-1,'Wide desktop: editor beside paper');
  else assert(panel.y>=paper.y+paper.h-1,'Editor below, full paper width');
  if(viewport.width>=800)assert(await p.locator('#canvas-wrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1));
  const baseline=baselines.find(b=>b.viewport.width===viewport.width&&!!b.viewport.dark===!!viewport.dark);
  if(baseline){
   assert.equal(before,baseline.hash,'Unedited complete signal and measurements match pre-change record');
   // The authorized right rail changes the fitted paper geometry; samples and export stay exact.
  }
  // Presentation is a negative control: no synthesis or change of paper.
  assert.equal(await p.locator('#adjust,#inspector,#exploration-context').count(),0);
  await p.locator('[data-action=about]').click();await p.keyboard.press('Escape');
  assert.equal(hash(await readTrace(p,{seconds:65})),before);assert.equal(await workerReplies(p),replies);assert.deepEqual(await geometry(p),paper);
  await root.scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,`${viewport.width}-initial.png`)});
  for(const key of ['hr','pr','axis','qrs','qtc']){
   const b=await root.locator(`[data-quick-number="${key}"]`).boundingBox();assert(b.height>=44);const r=await root.locator(`[data-key="${key}"]`).boundingBox();assert(r.height>=44);
  }
  if(viewport.width===1440){
   // Number edits are committed natively by Tab; every visible input affects the actual worker.
   for(const [key,value] of [['hr',90],['pr',180],['axis',-35],['qrs',120],['qtc',420]]){
    const n=await workerReplies(p),prior=await readTrace(p),input=root.locator(`[data-quick-number="${key}"]`);
    await input.fill(String(value));await input.press('Tab');await waitForReply(p,n);
    const next=await readTrace(p);assert.equal(next.case[key],value);assert.equal(+(await root.locator(`[data-key="${key}"]`).inputValue()),value);
    assert.notEqual(hash(next.leads),hash(prior.leads));
    for(const stable of ['rhythm','ischemia','phase','overload','ectopy'])assert.equal(next.case[stable],source.case[stable]);
    assert.equal(next.case.view.format,source.case.view.format);assert.equal(next.case.view.gain,source.case.view.gain);assert.equal(next.case.view.speed,source.case.view.speed);
    results.push({key,value,actualCaseAndSamplesUpdated:true});
   }
   for(const [mode,qrs,axis,pr] of [['rbbb',150,35,180],['wpw',135,55,100]]){
    const n=await workerReplies(p),select=root.locator('[data-key=conduction]');await select.focus();await select.selectOption(mode);await waitForReply(p,n);
    const t=await readTrace(p);assert.equal(t.case.conduction,mode);assert.equal(t.case.qrs,qrs);assert.equal(t.case.axis,axis);assert.equal(t.case.pr,pr);
    for(const key of ['qrs','axis','pr'])assert.equal(+(await root.locator(`[data-quick-number=${key}]`).inputValue()),t.case[key]);
    assert(await root.locator('[data-key=conduction]').evaluate(e=>document.activeElement===e));results.push({mode,coordinatedTargets:true});
   }
   // Invalid input and an uncommitted draft do not mutate or regenerate the record.
   const n=await workerReplies(p),invalidBefore=hash(await readTrace(p,{seconds:65})),invalid=root.locator('[data-quick-number=pr]');
   await invalid.fill('999');assert.equal(await invalid.evaluate(e=>e.checkValidity()),false);await invalid.press('Tab');
   assert.equal(await invalid.inputValue(),'100');assert(await invalid.evaluate(e=>document.activeElement!==e),'Invalid blur must allow keyboard navigation');
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.equal(await workerReplies(p),n);assert.equal(hash(await readTrace(p,{seconds:65})),invalidBefore);await p.keyboard.press('Escape');
   await invalid.fill('100');await invalid.press('Tab');assert.equal(await workerReplies(p),n);
   const reset=await workerReplies(p);await p.locator('[data-action=reset]').click();await waitForReply(p,reset);
   assert.equal(hash(await readTrace(p,{seconds:65})),before);assert.equal(hash((await geometry(p)).png),hash(paper.png));
   await p.locator('[data-action=export]').click();const download=p.waitForEvent('download');await p.locator('[data-action=png]').click();const d=await download;const file=resolve(out,'restored-export.png');await d.saveAs(file);await p.keyboard.press('Escape');
   if(baseline?.exportHash)assert.equal(hash(await readFile(file)),baseline.exportHash);
   const slider=root.locator('[data-key=hr]'),nSlider=await workerReplies(p);
   await slider.focus();await slider.press('ArrowRight');await slider.press('ArrowRight');await waitForReply(p,nSlider);
   assert.equal((await readTrace(p)).case.hr,source.case.hr+2);assert.equal(+(await root.locator('[data-quick-number=hr]').inputValue()),source.case.hr+2);
   assert(await slider.evaluate(e=>document.activeElement===e),'Synchronizing a slider must preserve its live node/focus');
   const familyCases=[['af',['hr','axis','qrs','conduction','qtc']],['flutter',['axis','qrs','conduction','qtc']],['wenckebach',['hr','pr','axis','qrs','conduction','qtc']],['complete',['hr','axis','qrs','conduction','qtc']],['complete_v',['hr']],['vt',['hr']],['vvi',['hr']],['vf',[]],['asystole',[]]];
   for(const [id,expected] of familyCases){
    await chooseCatalogPreset(p,id);await ready(p);
    const shown=await root.locator('[data-key]').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>e.dataset.key));
    assert.deepEqual(shown,expected,id);assert.equal(await root.isVisible(),expected.length>0);
    if(id==='wenckebach')assert.match(await root.innerText(),/FC auricular/);if(id==='complete')assert.match(await root.innerText(),/FC escape/);
    results.push({family:id,applicable:shown});
   }
   await p.locator('[data-action=quiz]').click();await ready(p);assert(await root.isHidden());assert.equal(await root.innerHTML(),'');
   await p.locator('#quiz-panel [data-answer]').first().click();assert.equal(await p.locator('[data-action=export]').isDisabled(),false);
   await p.getByRole('button',{name:'Salir de práctica'}).click();results.push({concealedPractice:true});
   const fractional={...source.case,pr:144.5,naturalPr:false};
   await p.goto(url+'#case='+Buffer.from(JSON.stringify(fractional)).toString('base64url'));await ready(p);
   assert.equal((await readTrace(p)).case.pr,144.5);assert.equal(await root.locator('[data-key=pr]').inputValue(),'144.5');
   assert.equal(await root.locator('[data-quick-number=pr]').inputValue(),'144.5');assert(await root.locator('[data-quick-number=pr]').evaluate(e=>e.checkValidity()));
   results.push({fractionalImportPreserved:true});
   const demand={...source.case,rhythm:'paced',pacing:'VVI',pacingBehavior:'demand',intrinsicRate:90,hr:60,qrs:165,qtc:410,ventricularSource:'auto'};
   await p.goto(url+'#case='+Buffer.from(JSON.stringify(demand)).toString('base64url'));await ready(p);
   assert.match(await root.innerText(),/QRS escape/);assert.match(await root.innerText(),/QTc escape/);
   const escapeBefore=await readTrace(p),nEscape=await workerReplies(p);
   await root.locator('[data-quick-number=qrs]').fill('185');await root.locator('[data-quick-number=qrs]').press('Tab');await waitForReply(p,nEscape);
   const escapeAfter=await readTrace(p);assert.equal(escapeAfter.case.qrs,185);assert.notEqual(hash(escapeAfter.leads),hash(escapeBefore.leads));
   results.push({vviDemandEscapeControlActs:true});
  }
  if(viewport.width===1280||viewport.width===320){
   await p.addStyleTag({content:'html{font-size:200% !important}'});await root.scrollIntoViewIfNeeded();
   const overflow=await root.locator('.qa-field:visible').evaluateAll(es=>es.map(e=>({scroll:e.scrollWidth,client:e.clientWidth})));
   assert(overflow.every(o=>o.scroll<=o.client+1),JSON.stringify(overflow));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.screenshot({path:resolve(out,`${viewport.width}-text-200.png`)});
  }
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,baselinePreserved:!!baseline,layout:true});await p.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e.stack??e);await active?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({passed:!failure,results,errors,failure},null,2));}
console.log(JSON.stringify({passed:!failure,results:results.length,errors,failure,evidence:out}));if(failure)process.exitCode=1;
