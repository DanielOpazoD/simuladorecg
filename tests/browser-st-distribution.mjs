/** Production UI + independent sample-window oracle. No renderer/measurement imports. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
import { installWorkerTap, readTrace, settledTrace, workerReplies } from './support/worker-tap.mjs';
const url = process.env.ECG_TEST_URL || 'http://127.0.0.1:4173/';
const out = resolve(process.argv[2] || '.sites-runtime/st-distribution');
// A rerun must never erase screenshots or an earlier adverse report.
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = s => hash(JSON.stringify({ case: s.case, leads: s.leads, events: s.events }));
function expected(s, beat, lead, point) {
  const b = s.events.beats[beat], a = s.leads[lead], at = t => Math.round(t * s.fs);
  const mean = (from, to) => { const values = a.slice(at(from), at(to) + 1); return values.reduce((x, y) => x + y, 0) / values.length; };
  const baseline = mean(b.time - .04, b.time - .02), j = b.time + b.qrs;
  return (point === 'j0' ? mean(j, j + .01) : a[at(j + .06)]) - baseline;
}
const results = [], errors = [], warnings = [];
const browser = await chromium.launch({ headless: true });
let failure;
try {
 for (const variant of [{ width:1440, theme:'light', scale:1 }, { width:390, theme:'light', scale:1 }, { width:320, theme:'dark', scale:1 }, { width:320, theme:'light', scale:2 }]) {
  const page = await browser.newPage({ viewport:{ width:variant.width, height:1000 }, reducedMotion:'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); if (m.type()==='warning') warnings.push(m.text()); });
  await installWorkerTap(page);
  await page.addInitScript(theme => localStorage.setItem('ecglab-theme', theme), variant.theme);
  await page.goto(url); await page.locator('#signal-loading').waitFor({ state:'hidden' });
  assert.match(await page.title(), /ECG/); assert.equal(await page.locator('vite-error-overlay').count(), 0);
  if (variant.scale === 2) await page.addStyleTag({ content:'html{font-size:200%!important}' });
  const families = variant.width === 1440 ? ['sinus','inferior','anterior','posterior','lbbb','af'] : ['inferior'];
  for (const family of families) {
   if (family !== 'sinus') { await chooseCatalogPreset(page, family); await page.locator('#signal-loading').waitFor({ state:'hidden' }); }
   const trace = await readTrace(page), before = fingerprint(trace), count = await workerReplies(page);
   const paperBefore = hash(await page.locator('#ecg').evaluate(c => c.toDataURL()));
   await page.locator('#structured-description [data-action=st-distribution]').click();
   const map = page.locator('.st-distribution'); await map.waitFor();
   const beat = Number(await map.getAttribute('data-beat'));
   assert.ok(Number.isInteger(beat) && trace.events.beats[beat].time < 10);
   assert.equal(await page.locator('[data-st-lead]').count(), 12);
   for (const point of ['j0','j60']) {
    await page.locator(`[data-st-point=${point}]`).click();
    const values = await page.locator('[data-st-lead]').evaluateAll(bs => bs.map(b => ({lead:b.dataset.stLead,mv:Number(b.dataset.valueMv)})));
    for (const row of values) assert.ok(Math.abs(row.mv - expected(trace, beat, row.lead, point)) < 1e-12, `${family}/${row.lead}/${point}`);
   }
   await page.locator('[data-st-region=posterior]').click();
   assert.match(await page.locator('.st-distribution-explanation').innerText(), /no se registran/);
   assert.deepEqual(await page.locator('.st-region-member').evaluateAll(bs => bs.map(b => b.dataset.stLead)), ['V1','V2','V3']);
   await page.locator('[data-st-region=avr]').click();
   assert.match(await page.locator('.st-distribution-explanation').innerText(), /No confirma.*ni descarta/);
   await page.locator('[data-st-region=inferior]').click();
   await page.locator('[data-st-lead=aVL]').focus(); await page.keyboard.press('Enter');
   assert.equal(await map.getAttribute('data-selected-lead'), 'aVL');
   assert.equal(await page.locator('[data-st-lead=aVL]').getAttribute('aria-pressed'), 'true');
   await page.locator('#dialog').evaluate(d => { d.scrollTop = 0; });
   if (family === 'inferior') await page.screenshot({ path:resolve(out,`map-${variant.width}-${variant.theme}-${variant.scale}.png`) });
   const overflow = await page.locator('.st-distribution').evaluate(root => {
    const bound = root.getBoundingClientRect();
    return [...root.querySelectorAll('button,output,p,figure,summary')].filter(el => el.checkVisibility()).filter(el => {
     const r = el.getBoundingClientRect(); return r.left < bound.left - 2 || r.right > bound.right + 2 || el.scrollWidth > el.clientWidth + 2;
    }).map(el => ({ text:el.textContent, width:el.clientWidth, scroll:el.scrollWidth }));
   });
   assert.deepEqual(overflow, [], JSON.stringify(variant));
   await page.locator('[data-st-enlarge]').click();
   assert.equal(await page.locator('.st-zoom').getAttribute('data-zoom-beat'), String(beat));
   assert.equal(await page.locator('.st-zoom').getAttribute('data-selected-lead'), 'aVL');
   assert.equal(await page.locator('#dialog').evaluate(d => d.contains(document.activeElement)), true);
   await page.locator('[data-zoom-lead=V3]').click();
   assert.equal(await page.locator('.st-zoom').getAttribute('data-zoom-beat'), String(beat));
   await page.locator('.st-zoom [data-action=st-distribution]').click();
   assert.equal(await map.getAttribute('data-beat'), String(beat));
   assert.equal(await map.getAttribute('data-selected-lead'), 'V3');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#dialog').evaluate(d => d.open), false);
   assert.equal(await workerReplies(page), count, 'Visual actions must not synthesize');
   assert.equal(fingerprint(await readTrace(page)), before, 'Visual actions must not mutate case or samples');
   assert.equal(hash(await page.locator('#ecg').evaluate(c => c.toDataURL())), paperBefore, 'Paper pixels unchanged');
   results.push({ ...variant, family, beat, sampleOracle:true, keyboard:true, noOverflow:true, sampleAndPaperIdentity:true });
  }
  if (variant.width === 1440) {
   const base = (await readTrace(page)).case;
   await settledTrace(page, () => page.locator('#file-input').setInputFiles({name:'reversed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...base,artifacts:{...base.artifacts,reversed:true}}))}));
   await page.locator('#structured-description [data-action=st-distribution]').click();
   assert.match(await page.locator('.st-distribution-warning').innerText(), /invertidos/);
   assert.equal(await page.locator('[data-st-region]').count(), 0);
   assert.equal(await page.locator('.st-distribution-diagrams').isHidden(), true);
   await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Practicar',exact:true}).click();
   await page.locator('#signal-loading').waitFor({state:'hidden'});
   assert.equal(await page.locator('[data-action=st-distribution]').count(),0);
   // Negative control: even a forged route activation cannot reveal the hidden exercise.
   await page.evaluate(() => {const b=document.createElement('button');b.dataset.action='st-distribution';document.body.append(b);b.click();b.remove();});
   assert.equal(await page.locator('#dialog').evaluate(d => d.open),false);
   await page.getByRole('button',{name:'Salir de práctica'}).click();
   results.push({ reversedOrientationBlocked:true, concealedPracticeRouteBlocked:true });
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
} catch (error) { failure=String(error.stack||error); }
finally {await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({url,results,errors,warnings,failure,clinicalValidation:false},null,2));}
if (failure) {console.error(failure);process.exitCode=1;} else console.log(JSON.stringify({passed:true,cases:results.length,errors,warnings,evidence:out}));
