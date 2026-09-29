import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
/** The built app: pin A -> change B -> shared-scale overlay -> exports -> invalidation -> quiz isolation. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const url=process.env.ECG_TEST_URL||'http://127.0.0.1:5173/';
const out=resolve(process.env.ECG_EVIDENCE_DIR||'.sites-runtime/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],warnings=[],checks=[];
const hash=object=>createHash('sha256').update(JSON.stringify(object)).digest('hex');
try {
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
    await page.addInitScript(()=>{
      const NativeWorker=window.Worker;
      window.__comparisonFailures=0;
      window.Worker=class extends NativeWorker {
        postMessage(...args){if(window.__comparisonFailures>0){window.__comparisonFailures--;throw new DOMException('A/B test transport failure','DataCloneError');}return super.postMessage(...args);}
      };
    });
    const ready=()=>page.locator('#signal-loading').waitFor({state:'hidden'});
    const select=async id=>{if(width===390)await page.locator('[data-action="catalog"]').click();await chooseCatalogPreset(page, id);await ready();};
    const exported=async name=>{const wait=page.waitForEvent('download');await page.locator('#compare-json').click();const file=resolve(out,`comparison-${name}-${width}.json`);await(await wait).saveAs(file);return JSON.parse(await readFile(file,'utf8'));};
    await page.goto(url);await ready();assert.match(await page.title(),/ECG/);assert.equal(await page.locator('vite-error-overlay').count(),0);
    await page.screenshot({path:resolve(out,`comparison-entry-${width}.png`)});
    await page.locator('[data-action="compare"]').click();await page.locator('#compare-pin').click();
    await page.locator('#comparison-canvas').waitFor();
    const initial=await exported('same');
    assert.equal(initial.kind,'ecg-lab-comparison');assert.equal(initial.syntheticOnly,true);assert.equal(initial.clinicalValidation,false);
    assert.deepEqual(initial.A.leads,initial.B.leads);assert.ok(initial.sampledDifferences.every(r=>r.maxAbsMv===0&&r.coverage===1));
    const referenceHash=hash(initial.A.leads);
    await select('lbbb');await page.locator('#comparison-canvas').waitFor();
    const changed=await exported('lbbb');
    assert.equal(hash(changed.A.leads),referenceHash);assert.notEqual(hash(changed.B.leads),referenceHash);
    assert.ok(changed.changedSettings.some(r=>r.key==='conduction'&&r.b==='lbbb'));
    assert.equal(changed.sampledDifferences.length,12);assert.ok(changed.sampledDifferences.some(r=>r.maxAbsMv>0));
    for(const metric of changed.metrics)if(metric.statusA!=='usable'||metric.statusB!=='usable')assert.equal(metric.delta,null);
    await page.locator('#compare-range').selectOption('4');
    const wider=await exported('range');assert.deepEqual(wider.A.leads,changed.A.leads);assert.deepEqual(wider.B.leads,changed.B.leads);
    await page.locator('#compare-alignment').selectOption('beat');await page.locator('#compare-beat-b').selectOption('1');
    const aligned=await exported('aligned');assert.equal(aligned.window.duration,1.2);assert.notEqual(aligned.window.startA,aligned.window.startB);
    assert.deepEqual(aligned.B.leads,changed.B.leads);assert.match(aligned.alignmentSource,/not clinical/);
    await page.locator('#compare-alignment').selectOption('record');await page.locator('#compare-start').fill('2');await page.locator('#compare-start').press('Tab');
    await page.locator('#compare-range').selectOption('2');
    const lab=page.locator('#comparison-lab');await lab.scrollIntoViewIfNeeded();
    if(width===390) {
      const heading=await lab.locator('.comparison-heading').boundingBox();
      const scroller=lab.locator('.comparison-scroll');await scroller.evaluate(e=>{e.scrollLeft=e.scrollWidth-e.clientWidth;});
      assert.ok(await scroller.evaluate(e=>e.scrollLeft>0));assert.equal((await lab.locator('.comparison-heading').boundingBox()).x,heading.x);
      assert.ok(await lab.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Do not scroll the entire card');
      const controls=await lab.locator('.comparison-controls label').evaluateAll(labels=>labels.map(label=>{
        const a=label.getBoundingClientRect(),b=label.querySelector('input,select').getBoundingClientRect();
        return {left:a.left,right:a.right,controlLeft:b.left,controlRight:b.right,height:b.height};
      }));
      for(const field of controls)assert.ok(field.controlLeft>=field.left-1&&field.controlRight<=field.right+1&&field.height>=44,'Native controls must fit their columns without overlap');
      await scroller.evaluate(e=>{e.scrollLeft=0;});
    }
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');
    await lab.screenshot({path:resolve(out,`comparison-lab-${width}.png`)});
    const pngWait=page.waitForEvent('download');await page.locator('#compare-png').click();const png=resolve(out,`comparison-export-${width}.png`);await(await pngWait).saveAs(png);
    assert.deepEqual([...((await readFile(png)).subarray(0,8))],[137,80,78,71,13,10,26,10]);
    // Synchronous invalidation: no stale B/PNG/JSON during the slider debounce gap.
    await page.locator('[data-panel="base"]').click();
    const pending=await page.locator('[data-key="hr"]').evaluate(el=>{
      el.value='80';el.dispatchEvent(new Event('input',{bubbles:true}));
      const root=document.querySelector('#comparison-lab');
      return {canvas:!!root.querySelector('canvas'),export:!!root.querySelector('#compare-json'),pin:root.querySelector('#compare-pin').disabled,text:root.innerText};
    });
    assert.equal(pending.canvas,false);assert.equal(pending.export,false);assert.equal(pending.pin,true);assert.match(pending.text,/permanece fijada/);
    await ready();assert.equal(hash((await exported('after-pending')).A.leads),referenceHash);
    await select('asystole');
    // Read the native OPTION state: isDisabled() retargets through its enclosing LABEL to SELECT.
    assert.equal(await page.locator('#compare-alignment option[value="beat"]').evaluate(option=>option.disabled),true);
    assert.equal(await page.locator('#compare-alignment').isDisabled(),false,'Recording-time comparison remains available');
    const empty=await exported('asystole');assert.equal(empty.B.events.beats.length,0);assert.equal(empty.view.alignment,'record');assert.ok(empty.metrics.every(r=>r.delta===null));
    await select('sinus');const restored=await exported('restored');assert.deepEqual(restored.B.leads,initial.A.leads);
    await page.evaluate(()=>{window.__comparisonFailures=2;});
    if(width===390)await page.locator('[data-action="catalog"]').click();
    await chooseCatalogPreset(page, 'brady');
    await page.locator('#signal-loading.signal-unavailable').waitFor({state:'visible'});
    assert.equal(await lab.locator('canvas').count(),0);assert.equal(await lab.locator('#compare-json').count(),0);
    assert.equal(await page.locator('#compare-pin').isDisabled(),true);assert.match(await lab.innerText(),/permanece fijada/);
    await select('sinus');assert.equal(hash((await exported('after-error')).A.leads),referenceHash);
    // A reference must not disclose the answer to a later blind question.
    await page.locator('[data-action="quiz"]').click();await ready();assert.equal(await page.locator('#compare-pin').isDisabled(),true);
    assert.equal(await lab.locator('canvas').count(),0);assert.match(await lab.innerText(),/no revelar respuestas/);
    await page.locator('[data-answer]').first().click();assert.equal(await lab.locator('canvas').count(),0);assert.equal(await page.locator('#compare-pin').isDisabled(),false);
    await page.locator('[data-action="end-quiz"]').click();await select('sinus');await page.locator('#compare-pin').click();await page.locator('#compare-clear').click();
    assert.equal(await lab.locator('canvas').count(),0);assert.equal(await lab.locator('#compare-json').count(),0);
    checks.push({width,referenceSha256:referenceHash,changedBSha256:hash(changed.B.leads),recordSamples:initial.sampledDifferences[0].samples,
      flow:'pin same -> LBBB -> range -> independent beat origins -> exports -> pending clears B -> asystole -> exact return -> terminal worker error -> recovered B -> quiz clears A -> clear'});
    await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  await writeFile(resolve(out,'comparison-ui-results.json'),JSON.stringify({url,browser:await browser.version(),checks,errors,warnings,physicalDeviceTest:false},null,2));
  console.log(JSON.stringify({comparisonFlows:checks.length,errors,warnings}));
} catch(error) { await writeFile(resolve(out,'comparison-failure.json'),JSON.stringify({error:String(error.stack),checks,errors,warnings},null,2));throw error; } finally {await browser.close();}
