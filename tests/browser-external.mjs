/** Local WFDB/CSV -> original samples -> sample-only analysis; synthetic state remains untouched. */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}), checks=[], errors=[], warnings=[];
const root='tests/reference/ludb/fixtures/development/';
const meta=JSON.parse(await readFile(root+'1.json','utf8')), dat=await readFile(root+'1.dat');
const header=['1 12 500 5000',...meta.channels.map((c,j)=>{
  let sum=0;for(let i=0;i<5000;i++)sum=(sum+dat.readInt16LE((i*12+j)*2))&65535;
  return `1.dat 16 ${c.adcGain}(${c.baseline})/mV 16 0 ${dat.readInt16LE(j*2)} ${sum} 0 ${c.lead}`;
}), '# TEST PRIVATE COMMENT - not exported'].join('\n');
const leads=Object.fromEntries(meta.channels.map((c,j)=>[c.lead,Array.from({length:5000},(_,i)=>(dat.readInt16LE((i*12+j)*2)-c.baseline)/c.adcGain)]));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const wfdb=[{name:'1.hea',mimeType:'text/plain',buffer:Buffer.from(header)},{name:'1.dat',mimeType:'application/octet-stream',buffer:dat}];
const channels=meta.channels.map(c=>c.lead);
const longCsv=['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+channels.join(','),...Array.from({length:10000},(_,i)=>[i/500,...channels.map(l=>leads[l][i%5000])].join(','))].join('\n');
// Independent analytic samples also exercise nullable per-beat directions across
// the actual worker/UI boundary, not only the pure analyzer.
const fixtureBundle=resolve(out,'zero-area-fixture.mjs');
await build({entryPoints:['tests/fixtures.ts'],bundle:true,platform:'node',format:'esm',outfile:fixtureBundle});
const {fixture}=await import(pathToFileURL(fixtureBundle));
const zero=fixture(),frontal=['I','II','III','aVR','aVL','aVF'];
for(const lead of frontal)zero.leads[lead].fill(0);
for(let beat=0;beat<10;beat++)for(const [index,value] of [[Math.round((beat+.39)*500),1e-8],[Math.round((beat+.39)*500)+1,-1e-8]]){
 const I=value,II=value/2,v={I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};
 for(const lead of frontal)zero.leads[lead][index]=v[lead];
}
const zeroCsv=['# ECG-LAB CSV 1; fs=500; units=mV','time_s,'+channels.join(','),...Array.from({length:5000},(_,i)=>[i/500,...channels.map(l=>zero.leads[l][i])].join(','))].join('\n');
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{
    const Native=window.Worker;window.__externalFail=false;window.__externalDelay=false;window.__delayed=0;
    window.Worker=class extends Native {
      constructor(...args){super(...args);this.external=String(args[0]).includes('external-worker');}
      postMessage(...args){if(this.external&&window.__externalFail)throw new DOMException('Test failure','DataCloneError');return super.postMessage(...args);}
      set onmessage(fn){super.onmessage=e=>{if(this.external&&window.__externalDelay){window.__delayed++;setTimeout(()=>fn(e),800);}else fn(e);};}
    };
  });
  await page.goto(url);await page.locator('#signal-loading').waitFor({state:'hidden'});
  assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const original=await page.locator('#ecg').evaluate(c=>c.toDataURL());
  const originalTitle=await page.locator('#case-title').innerText();
  await page.locator('[data-action=external]').click();
  const dialog=page.locator('#external-lab');await dialog.waitFor({state:'visible'});
  await dialog.screenshot({path:resolve(out,`external-entry-${width}.png`)});
  const ready=()=>page.waitForFunction(()=>!!document.querySelector('#external-metrics'));
  const read=async files=>{await page.locator('#external-files').setInputFiles(files);await page.locator('[data-external=load]').click();};
  const exported=async(name,action='json')=>{
    const wait=page.waitForEvent('download');await page.locator(`[data-external=${action}]`).click();const file=resolve(out,`external-${name}-${width}.${action==='json'?'json':action==='csv'?'csv':'png'}`);await(await wait).saveAs(file);return file;
  };
  const network=[];page.on('request',r=>network.push({method:r.method(),url:r.url()}));
  await read([{name:'balanced-frontal.csv',mimeType:'text/csv',buffer:Buffer.from(zeroCsv)}]);await ready();
  const zeroReport=JSON.parse(await readFile(await exported('zero-area'),'utf8'));
  assert.ok(zeroReport.measurement.beats.length>3);
  assert.equal(zeroReport.measurement.axis,null);
  assert.ok(zeroReport.measurement.beats.every(b=>b.axis===null));
  assert.equal(zeroReport.measurement.evidence.axis.status,'unavailable');
  assert.ok(Math.abs(zeroReport.measurement.hr-60)<1e-8);
  await page.locator('#external-metrics').screenshot({path:resolve(out,`external-zero-area-${width}.png`)});
  await read(wfdb);await ready();
  const report=JSON.parse(await readFile(await exported('wfdb'),'utf8'));
  assert.equal(report.kind,'ecg-external-analysis');assert.equal(report.modelAuditUsed,false);assert.equal(report.clinicalValidation,false);
  assert.equal(report.provenance.checksumVerified,true);assert.deepEqual(report.leads,leads);
  assert.ok(!JSON.stringify(report).includes('TEST PRIVATE'));assert.ok(!('truth' in report));assert.ok(!('events' in report));
  await page.locator('#external-marks').check();await page.locator('#external-offset').fill('2');await page.locator('#external-offset').press('Tab');
  await page.locator('#external-range').selectOption('4');
  const unchanged=JSON.parse(await readFile(await exported('view'),'utf8'));assert.deepEqual(unchanged,report);
  await page.locator('.external-summary').scrollIntoViewIfNeeded();
  await dialog.screenshot({path:resolve(out,`external-view-${width}.png`)});
  const png=await exported('trace','png');assert.deepEqual([...(await readFile(png)).subarray(0,8)],[137,80,78,71,13,10,26,10]);
  if(width===390){
    const scroller=page.locator('.external-scroll');assert.ok(await scroller.evaluate(e=>e.scrollWidth>e.clientWidth));
    await scroller.evaluate(e=>e.scrollLeft=150);assert.ok(await scroller.evaluate(e=>e.scrollLeft>0));
    assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'The dialog itself must not overflow horizontally');
    for(const control of await dialog.locator('.external-controls input,.external-controls select').evaluateAll(es=>es.map(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return {left:a.left,right:a.right,parentLeft:b.left,parentRight:b.right,height:a.height};})))assert.ok(control.left>=control.parentLeft-1&&control.right<=control.parentRight+1&&control.height>=44,'Controls fit their columns');
  }
  const csvFile=await exported('roundtrip','csv');await read(csvFile);await ready();
  const roundtrip=JSON.parse(await readFile(await exported('roundtrip'),'utf8'));assert.deepEqual(roundtrip.leads,leads);assert.deepEqual(roundtrip.measurement,report.measurement);
  assert.equal(roundtrip.provenance.format,'csv');
  // A missing row/short DAT removes the preceding result and cannot be exported as though valid.
  await read([wfdb[0],{...wfdb[1],buffer:dat.subarray(0,dat.length-2)}]);
  await page.waitForFunction(()=>document.querySelector('#external-message').textContent.includes('Longitud DAT'));
  assert.equal(await page.locator('#external-canvas').count(),0);assert.equal(await page.locator('[data-external=json]').count(),0);
  await read([{name:'long.csv',mimeType:'text/csv',buffer:Buffer.from(longCsv)}]);await ready();
  const pending=await page.locator('#external-start').evaluate(e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}));return{metrics:!!document.querySelector('#external-metrics'),disabled:document.querySelector('[data-external=json]').disabled};});
  assert.deepEqual(pending,{metrics:false,disabled:true});
  await page.locator('#external-start').press('Tab');await page.locator('[data-external=analyze]').click();await ready();
  const window=JSON.parse(await readFile(await exported('window'),'utf8'));assert.equal(window.window.startSample,1000);
  for(const l of channels)assert.deepEqual(window.leads[l],Array.from({length:5000},(_,i)=>leads[l][(i+1000)%5000]));
  // Fail the transport deliberately, then recover without a new server or altered synthetic state.
  await page.evaluate(()=>window.__externalFail=true);await read(wfdb);
  await page.waitForFunction(()=>document.querySelector('#external-message').textContent.includes('No se pudo iniciar'));
  assert.equal(await page.locator('#external-metrics').count(),0);await page.evaluate(()=>window.__externalFail=false);await read(wfdb);await ready();
  await page.locator('[data-external=close]').click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),original);assert.equal(await page.locator('#case-title').innerText(),originalTitle);
  await page.locator('[data-action=external]').click();assert.equal(await page.locator('#external-canvas').count(),0);
  // Deliberately deliver a late callback after close/reopen; it must not revive a discarded file.
  await page.evaluate(()=>window.__externalDelay=true);await read(wfdb);
  await page.waitForFunction(()=>window.__delayed>0);await page.locator('[data-external=close]').click();await dialog.waitFor({state:'hidden'});
  await page.evaluate(()=>window.__externalDelay=false);await page.locator('[data-action=external]').click();
  await page.waitForTimeout(900);assert.equal(await page.locator('#external-canvas').count(),0);
  await read(wfdb);await ready();await page.locator('[data-external=clear]').click();assert.equal(await page.locator('#external-canvas').count(),0);
  assert.deepEqual(network.filter(r=>r.method!=='GET'||!r.url.startsWith(new URL(url).origin)),[],'No data upload or external fetch in the import flow');
  checks.push({width,zeroAreaAxisTransport:true,physicalSamples:60000,sampleHash:hash(report.leads),workflow:'WFDB -> marks/scale -> PNG/CSV/JSON -> exact CSV round trip -> corrupt pair rejected -> 20s recording/window -> stale-data guard -> transport failure/recovery -> close isolation -> late result ignored -> clear',networkRequests:network.length});
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(resolve(out,'external-ui-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,physicalDevice:false,clinicalValidation:false},null,2));
 console.log(JSON.stringify({externalFlows:checks.length,errors,warnings}));
} catch(error) {
 await writeFile(resolve(out,'external-failure.json'),JSON.stringify({error:String(error.stack),checks,errors,warnings},null,2));
 for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:resolve(out,'external-failure.png')}).catch(()=>{});
 throw error;
} finally {await browser.close();}
