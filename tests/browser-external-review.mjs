/** A05 + A10 + A17: actual built UI, files, manual indices and downloads; no synthetic truth input. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/',out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');
await mkdir(out,{recursive:true});
const root='tests/reference/ludb/fixtures/development/',meta=JSON.parse(await readFile(root+'1.json','utf8')),dat=await readFile(root+'1.dat');
const leadNames=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const leads=Object.fromEntries(meta.channels.map((c,j)=>[c.lead,Array.from({length:5000},(_,i)=>(dat.readInt16LE((i*12+j)*2)-c.baseline)/c.adcGain)]));
const qrs=meta.annotations.II.find(a=>a.wave==='QRS'); // Exposed annotation ONLY positions the operator's QA clicks. Never supplied to the app/worker.
const header=['1 12 500 5000',...meta.channels.map((c,j)=>{let sum=0;for(let i=0;i<5000;i++)sum=(sum+dat.readInt16LE((i*12+j)*2))&65535;return `1.dat 16 ${c.adcGain}(${c.baseline})/mV 16 0 ${dat.readInt16LE(j*2)} ${sum} 0 ${c.lead}`;}),'# PRIVATE_NOT_EXPORTED'].join('\n');
const wfdb=[{name:'1.hea',mimeType:'text/plain',buffer:Buffer.from(header)},{name:'1.dat',mimeType:'application/octet-stream',buffer:dat}];
const csv=(fs,seconds,signal=leads)=>Buffer.from([`# ECG-LAB CSV 1; fs=${fs}; units=mV`,'time_s,'+leadNames.join(','),...Array.from({length:fs*seconds},(_,i)=>[i/fs,...leadNames.map(l=>signal[l][i%5000])].join(','))].join('\n'));
const browser=await chromium.launch({headless:true}),checks=[],errors=[],warnings=[];
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{const Native=window.Worker;window.__badExternalIdentity=false;window.__externalReplySummary=[];
   window.Worker=class extends Native {
    constructor(...args){super(...args);this.external=String(args[0]).includes('external-worker');}
    set onmessage(fn){super.onmessage=e=>{if(this.external){window.__externalReplySummary.push({status:e.data.assessment?.status,hasMeasurement:!!e.data.measurement});if(window.__badExternalIdentity&&e.data.identity)e.data.identity.sha256='f'.repeat(64);}return fn(e);};}
   };
  });
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const identity=await(await page.request.get(new URL('build-info.json',url).href)).json();
  const original=await page.locator('#ecg').evaluate(c=>c.toDataURL()),requests=[];
  page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  await page.locator('[data-action=external]').click();
  const load=async files=>{await page.locator('#external-files').setInputFiles(files);await page.locator('[data-external=load]').click();};
  const ready=()=>page.locator('#external-aptitude').waitFor();
  const report=async name=>{const wait=page.waitForEvent('download');await page.locator('[data-external=json]').click();const p=resolve(out,`manual-${name}-${width}.json`);await(await wait).saveAs(p);return JSON.parse(await readFile(p,'utf8'));};
  const sidecar=async name=>{const wait=page.waitForEvent('download');await page.locator('[data-review=export]').click();const p=resolve(out,`manual-${name}-${width}.json`);await(await wait).saveAs(p);return JSON.parse(await readFile(p,'utf8'));};
  const field=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');};
  const readReview=async data=>{await page.locator('#manual-import').setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});};
  await load(wfdb);await ready();assert.equal(await page.locator('#external-aptitude').getAttribute('data-status'),'exploratory');
  const before=await report('automatic-before');assert.deepEqual(before.leads,leads);assert.equal(before.schemaVersion,2);
  assert.equal(before.build.commit,identity.commit);assert.equal(before.build.sourceSha256,identity.sourceSha256);
  assert.equal(before.build.analysisSourceSha256,identity.analysisSourceSha256);assert.equal(before.build.dirty,false);
  const rawHeader=Buffer.from(`ecg-physical-f64le-v1\n500\n5000\nmV\n${leadNames.join(',')}\n`),physical=Buffer.alloc(rawHeader.length+5000*12*8);rawHeader.copy(physical);
  let p=rawHeader.length;for(const l of leadNames)for(const v of leads[l]){physical.writeDoubleLE(v===0?0:v,p);p+=8;}
  assert.equal(before.identity.sha256,createHash('sha256').update(physical).digest('hex'));
  await page.locator('#manual-candidate').selectOption({index:1});assert.equal(await page.locator('#manual-annotations tbody tr').count(),0);
  await page.locator('#manual-span').selectOption('0.8');await field('manual-view-start',1);
  await page.locator('[data-review=new]').click();assert.equal(await page.locator('[data-review=save]').isDisabled(),true);
  await field('manual-start-sample',qrs.onset);await field('manual-end-sample',qrs.offset);
  const expected=(qrs.offset-qrs.onset)*2;
  assert.equal(Number(await page.locator('#manual-readout').getAttribute('data-ms')),expected);
  await page.locator('[data-review=focus]').click();await page.locator('#manual-canvas').press('ArrowRight');
  assert.equal(Number(await page.locator('#manual-readout').getAttribute('data-ms')),expected+2);
  await page.locator('#manual-canvas').press('ArrowLeft');await page.locator('#manual-canvas').press('Shift+ArrowRight');
  assert.equal(Number(await page.locator('#manual-readout').getAttribute('data-ms')),expected+20);
  await page.locator('#manual-canvas').press('Shift+ArrowLeft');
  // Pointer uses the same absolute sample grid at either viewport.
  await page.locator('#manual-canvas').scrollIntoViewIfNeeded();
  const point=await page.locator('#manual-canvas').evaluate((c,sample)=>{const w=parseFloat(c.style.width),b=c.getBoundingClientRect();return{x:(38+(sample-500)/399*(w-54))*b.width/w,y:b.height/2};},qrs.offset+5);
  await page.locator('#manual-canvas').click({position:point});assert.equal(Number(await page.locator('#manual-end-sample').inputValue()),qrs.offset+5);
  await field('manual-end-sample',qrs.onset);assert.equal(await page.locator('[data-review=save]').isDisabled(),true);
  await field('manual-end-sample',qrs.offset);await page.locator('[data-review=save]').click();
  const saved=await sidecar('saved');assert.equal(saved.annotations.length,1);assert.equal(saved.annotations[0].origin,'manual');
  assert.equal(saved.annotations[0].startSample,qrs.onset);assert.equal(saved.annotations[0].endSample,qrs.offset);assert.equal(saved.annotations[0].createdWith.commit,identity.commit);
  const after=await report('automatic-after');assert.deepEqual(after.measurement,before.measurement);assert.deepEqual(after.leads,before.leads);assert.deepEqual(after.identity,before.identity);
  assert.deepEqual(after.manualReview.annotations,saved.annotations);
  await page.locator('[data-review=edit]').click();await field('manual-end-sample',qrs.offset+5);await page.locator('[data-review=save]').click();
  await page.locator('[data-review=undo]').click();assert.deepEqual((await sidecar('undo')).annotations,saved.annotations);
  await page.locator('[data-review=redo]').click();assert.equal((await sidecar('redo')).annotations[0].endSample,qrs.offset+5);
  await page.locator('[data-review=undo]').click();
  await page.locator('[data-review=edit]').click();await field('manual-end-sample',qrs.offset+3);await page.locator('[data-review=cancel]').click();
  assert.deepEqual((await sidecar('cancel')).annotations,saved.annotations);
  await readReview({...saved,signal:{...saved.signal,sha256:'0'.repeat(64)}});
  await page.waitForFunction(()=>document.querySelector('#manual-message').textContent.includes('otra señal'));assert.equal(await page.locator('#manual-annotations tbody tr').count(),1);
  await readReview({...saved,patient:'PRIVATE_NOT_EXPORTED'});await page.waitForFunction(()=>document.querySelector('#manual-message').textContent.includes('Campos'));
  assert.deepEqual((await sidecar('reject')).annotations,saved.annotations);
  await page.locator('[data-review=remove]').click();assert.equal(await page.locator('#manual-annotations tbody tr').count(),0);
  await readReview(saved);await page.waitForFunction(()=>document.querySelector('#manual-message').textContent.includes('Importadas 1'));
  await page.locator('[data-review=edit]').click(); // Show the recovered boundaries; still a draft, not promoted to automatic values.
  await page.locator('#external-review h3').evaluate(e=>e.scrollIntoView({block:'start'}));
  await page.screenshot({path:resolve(out,`manual-review-${width}.png`)});
  const canvasPng=await page.locator('#manual-canvas').evaluate(c=>c.toDataURL().split(',')[1]);await writeFile(resolve(out,`manual-detail-${width}.png`),Buffer.from(canvasPng,'base64'));
  if(width===390) {
    assert.ok(await page.locator('#external-lab').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    const controls=await page.locator('.review-controls input,.review-controls select').evaluateAll(es=>es.map(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return{left:a.left,right:a.right,parentLeft:b.left,parentRight:b.right,height:a.height};}));
    assert.ok(controls.every(c=>c.left>=c.parentLeft-1&&c.right<=c.parentRight+1&&c.height>=44),'Manual controls must fit mobile columns');
  }
  await load({name:'roundtrip.csv',mimeType:'text/csv',buffer:csv(500,10)});await ready();
  assert.equal(await page.locator('#manual-annotations tbody tr').count(),0);await readReview(saved);await page.waitForFunction(()=>document.querySelector('#manual-message').textContent.includes('Importadas 1'));
  assert.deepEqual((await report('roundtrip')).manualReview.annotations,saved.annotations);
  await load({name:'250hz.csv',mimeType:'text/csv',buffer:csv(250,10)});await ready();
  assert.equal(await page.locator('#external-aptitude').getAttribute('data-status'),'manual-only');assert.equal(await page.locator('#external-metrics').count(),0);
  const blocked=await report('outside-domain');assert.equal(blocked.measurement,null);assert.equal(blocked.analysisAttempted,false);assert.equal(blocked.assessment.resolutionMs,4);
  await readReview(saved);await page.waitForFunction(()=>document.querySelector('#manual-message').textContent.includes('otra señal'));
  await page.locator('[data-review=new]').click();await field('manual-start-sample',10);await field('manual-end-sample',11);
  assert.equal(Number(await page.locator('#manual-readout').getAttribute('data-ms')),4);await page.locator('[data-review=save]').click();
  const manualOnly=await sidecar('manual-only');assert.equal(manualOnly.annotations[0].endSample-manualOnly.annotations[0].startSample,1);
  await page.locator('#external-aptitude').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:resolve(out,`manual-domain-${width}.png`)});
  await load({name:'flat.csv',mimeType:'text/csv',buffer:csv(500,10,{...leads,I:Array(5000).fill(0)})});await ready();
  const flat=await report('flat');assert.equal(flat.measurement,null);assert.ok(flat.assessment.issues.some(i=>i.code==='flat-channel'&&i.lead==='I'));
  await load({name:'long.csv',mimeType:'text/csv',buffer:csv(500,20)});await ready();
  await page.locator('[data-review=new]').click();await field('manual-start-sample',qrs.onset);await field('manual-end-sample',qrs.offset);await page.locator('[data-review=save]').click();
  const longBefore=await sidecar('long-before');
  const pending=await page.locator('#external-start').evaluate(e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}));return{metrics:!!document.querySelector('#external-metrics'),disabled:document.querySelector('[data-external=json]').disabled};});
  assert.deepEqual(pending,{metrics:false,disabled:true});await page.locator('#external-start').press('Tab');await page.locator('[data-external=analyze]').click();await ready();
  const moved=await report('window');assert.equal(moved.window.startSample,1000);assert.deepEqual(moved.manualReview.annotations,longBefore.annotations);
  assert.equal(moved.identity.sha256,longBefore.signal.sha256);
  await page.evaluate(()=>window.__badExternalIdentity=true);await load(wfdb);
  await page.waitForFunction(()=>document.querySelector('#external-message').textContent.includes('Respuesta del worker inválida'));
  assert.equal(await page.locator('#external-metrics').count(),0);assert.equal(await page.locator('#external-review').count(),0);
  await page.evaluate(()=>window.__badExternalIdentity=false);await load(wfdb);await ready();
  await page.locator('[data-external=close]').click();
  await page.locator('#external-review').waitFor({state:'detached'}); // Native dialog close dispatches its cleanup event asynchronously.
  assert.equal(await page.locator('#external-review').count(),0);
  assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),original);
  assert.deepEqual(requests.filter(r=>r.method!=='GET'||!r.url.startsWith(new URL(url).origin)),[],'No data upload or third-party data request');
  checks.push({width,stepMs500:2,stepMs250:4,signalSha256:before.identity.sha256,build:before.build,manualBounds:saved.annotations[0],originalSamplesPreserved:60000,automaticMeasurementsUnchanged:true,networkRequests:requests.length});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'manual-review-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,clinicalValidation:false,physicalDevice:false},null,2));
 console.log(JSON.stringify({manualReviewFlows:checks.length,errors,warnings}));
} catch(e) {
 await writeFile(resolve(out,'manual-review-failure.json'),JSON.stringify({error:String(e.stack),checks,errors,warnings},null,2));
 for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:resolve(out,'manual-review-failure.png')}).catch(()=>{});
 throw e;
} finally {await browser.close();}
