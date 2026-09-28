// A11 + scoped A15: original samples, explicit source ownership and reversible navigation.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/',out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');
await mkdir(out,{recursive:true});
const root='tests/reference/ludb/fixtures/development/',meta=JSON.parse(await readFile(root+'1.json','utf8')),dat=await readFile(root+'1.dat');
const names=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const leads=Object.fromEntries(meta.channels.map((c,j)=>[c.lead,Array.from({length:5000},(_,i)=>(dat.readInt16LE((i*12+j)*2)-c.baseline)/c.adcGain)]));
const header=['1 12 500 5000',...meta.channels.map((c,j)=>{
  let sum=0;for(let i=0;i<5000;i++)sum=(sum+dat.readInt16LE((i*12+j)*2))&65535;
  return `1.dat 16 ${c.adcGain}(${c.baseline})/mV 16 0 ${dat.readInt16LE(j*2)} ${sum} 0 ${c.lead}`;
}),'# PRIVATE_NOT_EXPORTED'].join('\n');
const wfdb=[{name:'1.hea',mimeType:'text/plain',buffer:Buffer.from(header)},{name:'1.dat',mimeType:'application/octet-stream',buffer:dat}];
const csv=(fs,seconds)=>Buffer.from([`# ECG-LAB CSV 1; fs=${fs}; units=mV`,'time_s,'+names.join(','),...Array.from({length:fs*seconds},(_,i)=>[i/fs,...names.map(l=>leads[l][i%5000])].join(','))].join('\n'));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const browser=await chromium.launch({headless:true}),errors=[],warnings=[],checks=[];
try {
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
    await page.addInitScript(()=>{
      const Native=window.Worker;window.__a11Failures=0;
      window.Worker=class extends Native {
        constructor(...args){super(...args);this.external=String(args[0]).includes('external-worker');}
        postMessage(...args){if(!this.external&&window.__a11Failures>0){window.__a11Failures--;throw new DOMException('A11 transport failure','DataCloneError');}return super.postMessage(...args);}
      };
    });
    const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
    const select=async id=>{if(width===390)await page.locator('[data-action=catalog]').click();await page.locator(`[data-preset="${id}"]`).click();await ready();};
    const reader=()=>page.locator('[data-compare=reader]').click();
    const field=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');};
    const load=async files=>{await page.locator('#external-files').setInputFiles(files);await page.locator('[data-external=load]').click();await page.locator('#external-aptitude').waitFor();};
    const transfer=async slot=>{await page.locator(`[data-external=compare-${slot.toLowerCase()}]`).click();await page.waitForFunction(()=>!document.querySelector('#external-lab').open);};
    const exportAB=async name=>{const waiting=page.waitForEvent('download');await page.locator('#compare-json').click();const p=resolve(out,`ab-external-${name}-${width}.json`);await(await waiting).saveAs(p);return JSON.parse(await readFile(p,'utf8'));};
    await page.goto(url);await ready();assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
    const build=await(await page.request.get(new URL('build-info.json',url).href)).json();
    if(process.env.ECG_EXPECT_COMMIT)assert.equal(build.commit,process.env.ECG_EXPECT_COMMIT);
    const original=await page.locator('#ecg').evaluate(c=>c.toDataURL()),requests=[];
    page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
    await page.locator('[data-action=compare]').click();await page.locator('#compare-pin').click();
    const syn=await exportAB('synthetic');assert.equal(syn.schemaVersion,1);assert.equal(syn.syntheticOnly,true);
    // Park/resume a saved manual reading; navigation must not recreate its editor.
    await reader();await load(wfdb);
    await page.locator('[data-review=new]').click();await field('manual-start-sample',640);await field('manual-end-sample',680);await page.locator('[data-review=save]').click();
    assert.equal(await page.locator('#manual-annotations tbody tr').count(),1);
    await transfer('A');
    const mixed=await exportAB('mixed');assert.equal(mixed.schemaVersion,2);
    assert.equal(mixed.A.sourceKind,'external');assert.equal(mixed.B.sourceKind,'synthetic');
    assert.deepEqual(mixed.A.leads,leads);assert.deepEqual(mixed.B.leads,syn.B.leads);assert.equal(mixed.A.recordWindow.startSample,0);
    assert.equal(mixed.A.capturedWith.commit,build.commit);assert.equal(mixed.A.capturedWith.analysisSourceSha256,build.analysisSourceSha256);
    for(const k of ['case','events','truth','diagnosis'])assert.ok(!(k in mixed.A));
    assert.ok(!JSON.stringify(mixed).includes('PRIVATE_NOT_EXPORTED'));
    assert.ok(mixed.metrics.every(r=>r.delta===null));assert.equal(await page.locator('#compare-alignment option[value=beat]').evaluate(e=>e.disabled),true);
    const identityA=mixed.A.recordIdentity.sha256;
    await select('brady');assert.equal((await exportAB('new-synthetic')).A.recordIdentity.sha256,identityA);
    await reader();assert.equal(await page.locator('#manual-annotations tbody tr').count(),1);
    await load({name:'long.csv',mimeType:'text/csv',buffer:csv(500,20)});
    // Input invalidates transfer synchronously, before blur/debounce.
    const pending=await page.locator('#external-start').evaluate(e=>{
      e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}));
      return [...document.querySelectorAll('[data-external=compare-a],[data-external=compare-b]')].map(b=>b.disabled);
    });assert.deepEqual(pending,[true,true]);
    await page.locator('#external-start').press('Tab');await page.locator('[data-external=analyze]').click();await page.locator('#external-aptitude').waitFor();
    await transfer('B');
    const pair=await exportAB('pair');assert.equal(pair.B.sourceKind,'external');assert.equal(pair.B.recordWindow.startSample,1000);
    assert.equal(pair.A.recordIdentity.sha256,identityA);assert.equal(pair.B.recordIdentity.samples,10000);
    for(const l of names)assert.deepEqual(pair.B.leads[l],Array.from({length:5000},(_,i)=>leads[l][(i+1000)%5000]));
    for(const r of pair.metrics)if(r.statusA!=='usable'||r.statusB!=='usable')assert.equal(r.delta,null);
    const snapshotHash=hash({A:pair.A,B:pair.B});
    // Neither normal generator updates nor a terminal generator error owns external B.
    await select('lbbb');assert.equal(hash({A:(await exportAB('retained')).A,B:(await exportAB('retained-b')).B}),snapshotHash);
    await page.evaluate(()=>window.__a11Failures=2);
    if(width===390)await page.locator('[data-action=catalog]').click();
    await page.locator('[data-preset=brady]').click();await page.locator('#signal-loading.signal-unavailable').waitFor();
    const duringFailure=await exportAB('generator-failed');assert.equal(hash({A:duringFailure.A,B:duringFailure.B}),snapshotHash);
    assert.equal(await page.locator('[data-action=compare]').isDisabled(),false);
    await select('sinus');
    await page.locator('#compare-alignment').selectOption('manual');await field('compare-manual-a',500);await field('compare-manual-b',1000);
    const aligned=await exportAB('aligned');assert.deepEqual(aligned.window,{startA:1,startB:2,duration:2,axisStart:0});
    assert.deepEqual(aligned.alignmentRecordSamples,{A:500,B:2000});assert.deepEqual(aligned.A.leads,pair.A.leads);assert.deepEqual(aligned.B.leads,pair.B.leads);
    assert.deepEqual(aligned.metrics,pair.metrics);
    await field('compare-manual-a',4900);await field('compare-manual-b',4900);
    const tail=await exportAB('tail');assert.ok(tail.sampledDifferences.every(r=>r.samples===100&&r.coverage===.1));
    await field('compare-manual-a',500);await field('compare-manual-b',1000);
    await page.locator('#compare-range').selectOption('4');const wider=await exportAB('range');assert.deepEqual(wider.B.leads,pair.B.leads);
    const lab=page.locator('#comparison-lab');await lab.scrollIntoViewIfNeeded();
    if(width===390){
      assert.ok(await lab.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Only the graph/table scroll sideways');
      const fields=await lab.locator('.comparison-controls label').evaluateAll(es=>es.map(e=>{
        const a=e.getBoundingClientRect(),b=e.querySelector('input,select').getBoundingClientRect();return{left:a.left,right:a.right,cl:b.left,cr:b.right,h:b.height};
      }));assert.ok(fields.every(f=>f.cl>=f.left-1&&f.cr<=f.right+1&&f.h>=44));
      const scroll=lab.locator('.comparison-scroll');await scroll.evaluate(e=>e.scrollLeft=400);assert.ok(await scroll.evaluate(e=>e.scrollLeft>0));await scroll.evaluate(e=>e.scrollLeft=0);
    }
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
    await lab.screenshot({path:resolve(out,`ab-external-lab-${width}.png`)});
    const pngWait=page.waitForEvent('download');await page.locator('#compare-png').click();await(await pngWait).saveAs(resolve(out,`ab-external-trace-${width}.png`));
    // Mismatched sampling is explicit, not coerced; pin B then compare a manual-only pair.
    await reader();await load({name:'250.csv',mimeType:'text/csv',buffer:csv(250,10)});await transfer('B');
    assert.match(await page.locator('#comparison-error').innerText(),/Muestreo incompatible/);
    assert.equal(await page.locator('#compare-json').count(),0);assert.equal(await page.locator('#comparison-canvas').count(),0);
    await page.locator('#compare-pin').click();
    const manualOnly=await exportAB('manual-only');assert.equal(manualOnly.A.fs,250);assert.equal(manualOnly.B.measurement,null);
    assert.ok(manualOnly.sampledDifferences.every(r=>r.maxAbsMv===0));assert.ok(manualOnly.metrics.every(r=>r.delta===null));
    await page.locator('[data-compare=synthetic]').click();assert.match(await page.locator('#comparison-error').innerText(),/Muestreo incompatible/);
    // Recover to external A / synthetic B without changing the synthetic signal.
    await reader();await load(wfdb);await transfer('A');
    const restored=await exportAB('restored');assert.deepEqual(restored.A.leads,mixed.A.leads);assert.deepEqual(restored.B.leads,syn.B.leads);
    assert.equal(await page.locator('#ecg').evaluate(c=>c.toDataURL()),original);
    // Pending generator input must clear only live B, not the pinned external A.
    await page.locator('[data-panel=base]').click();
    const changed=await page.locator('[data-key=hr]').evaluate(e=>{
      e.value='80';e.dispatchEvent(new Event('input',{bubbles:true}));
      return {canvas:!!document.querySelector('#comparison-canvas'),export:!!document.querySelector('#compare-json'),text:document.querySelector('#comparison-lab').innerText};
    });assert.equal(changed.canvas,false);assert.equal(changed.export,false);assert.match(changed.text,/permanece fijada/);await ready();
    assert.equal((await exportAB('pending-recovered')).A.recordIdentity.sha256,identityA);
    // Explicit erase + quiz isolation: no answer-bearing or external copy retained.
    await page.locator('[data-action=quiz]').click();await ready();
    assert.equal(await page.locator('#comparison-canvas').count(),0);assert.equal(await page.locator('#external-review').count(),0);
    assert.equal(await page.locator('[data-action=external]').isDisabled(),true);
    await page.locator('[data-answer]').first().click();assert.equal(await page.locator('#comparison-canvas').count(),0);
    await page.locator('[data-action=end-quiz]').click();await select('sinus');await page.locator('#compare-pin').click();
    await page.locator('[data-compare=clear-all]').click();assert.equal(await page.locator('#compare-json').count(),0);
    assert.deepEqual(requests.filter(r=>r.method!=='GET'||!r.url.startsWith(new URL(url).origin)),[],'No data upload / third-party request');
    checks.push({width,build,sourcePairs:['synthetic/synthetic','external/synthetic','external/external'],physicalSamplesChecked:120000,
      originalFingerprint:identityA,externalBRetainedAcrossGeneratorFailure:true,manualReviewRetainedAcrossNavigation:true,
      excluded250HzAnalyzerNotPromoted:true,originalsNotMutated:true,externalTruthFabricated:false,networkRequests:requests.length});
    await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  await writeFile(resolve(out,'comparison-external-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,clinicalValidation:false,physicalDevice:false},null,2));
  console.log(JSON.stringify({comparisonExternalFlows:checks.length,errors,warnings}));
}catch(error){
  await writeFile(resolve(out,'comparison-external-failure.json'),JSON.stringify({error:String(error.stack),checks,errors,warnings},null,2));
  for(const ctx of browser.contexts())for(const page of ctx.pages())await page.screenshot({path:resolve(out,'comparison-external-failure.png')}).catch(()=>{});
  throw error;
}finally{await browser.close();}
