/** Real production Worker after bounded transport fault injection. No source imports. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=path.resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');
await mkdir(out,{recursive:true});
const response=await fetch(new URL('build-info.json',url));assert.equal(response.status,200);
const identity=await response.json();assert.deepEqual(identity,JSON.parse(await readFile('dist/build-info.json')));
assert.equal(identity.dirty,false);
const browser=await chromium.launch({headless:true}), errors=[], warnings=[], checks=[], probes=[];
let page;
async function open(failures,width=1440) {
 const p=await browser.newPage({viewport:{width,height:width===390?844:1000}});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
 await p.addInitScript(({failures})=>{
  const NativeWorker=window.Worker;
  const probe=window.__workerRecoveryProbe={failures,workers:0,posts:0};
  window.Worker=class extends NativeWorker {
   constructor(...args){super(...args);probe.workers++;}
   postMessage(...args){probe.posts++;if(probe.failures>0){probe.failures--;throw new DOMException('Injected transport failure','DataCloneError');}return super.postMessage(...args);}
  };
 },{failures});
 await p.goto(url);
 assert.match(await p.title(),/ECG/);assert.equal(await p.locator('vite-error-overlay').count(),0);
 return p;
}
async function ready(p) {await p.locator('#signal-loading').waitFor({state:'hidden'});assert.ok(await p.locator('#metrics .metric').count()>0);}
async function pngEnabled(p,enabled) {
 await p.locator('[data-action="export"]').click();
 assert.equal(await p.locator('[data-action="png"]').isDisabled(),!enabled);
 await p.locator('#dialog').evaluate(d=>d.close());
}
try {
 page=await open(1);await ready(page);
 assert.match(await page.locator('#case-title').innerText(),/sinusal/i);
 let p=await page.evaluate(()=>window.__workerRecoveryProbe);assert.equal(p.workers,2);assert.equal(p.posts,2);probes.push(p);
 await pngEnabled(page,true);await page.screenshot({path:path.join(out,'worker-recovered.png')});
 checks.push('one failed send -> new real compiled Worker -> valid measurements and PNG');await page.close();

 page=await open(2);
 await page.locator('#signal-loading.signal-unavailable').waitFor({state:'visible'});
 assert.match(await page.locator('#signal-loading').innerText(),/único reintento/);
 assert.equal(await page.locator('#metrics .metric').count(),0);
 p=await page.evaluate(()=>window.__workerRecoveryProbe);assert.equal(p.workers,2);assert.equal(p.posts,2);probes.push(p);
 await pngEnabled(page,false);await page.screenshot({path:path.join(out,'worker-exhausted.png')});
 checks.push('two failed sends -> bounded terminal error, no stale measures or PNG');
 await page.locator('[data-preset="brady"]').click();await ready(page);
 assert.doesNotMatch(await page.locator('#toast').textContent(),/único reintento/);
 p=await page.evaluate(()=>window.__workerRecoveryProbe);assert.equal(p.workers,3);probes.push(p);
 await pngEnabled(page,true);await page.screenshot({path:path.join(out,'worker-user-retry.png')});
 checks.push('new user case after exhaustion -> actual Worker result and cleared old error');await page.close();

 page=await open(1,390);await ready(page);assert.ok(await page.locator('#ecg').isVisible());
 await page.screenshot({path:path.join(out,'worker-recovered-mobile.png')});
 checks.push('390x844 emulated viewport recovers without stale loading');
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 await writeFile(path.join(out,'worker-recovery-results.json'),JSON.stringify({identity,url,checks,probes,errors,warnings,browser:await browser.version(),viewports:[[1440,1000],[390,844]],faultInjection:'postMessage throws; recovered response comes from the actual production worker',physicalDeviceTest:false},null,2));
 console.log(JSON.stringify({workerRecoveryChecks:checks.length,errors,warnings}));
} catch(error) {
 if(page)await page.screenshot({path:path.join(out,'worker-recovery-failure.png')}).catch(()=>{});
 await writeFile(path.join(out,'worker-recovery-failure.json'),JSON.stringify({error:String(error),checks,probes,errors,warnings},null,2));throw error;
} finally {await browser.close();}
