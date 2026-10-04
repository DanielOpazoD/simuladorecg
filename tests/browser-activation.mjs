/** Production UI -> actual worker -> activation experiment -> explicit apply.
 * No engine imports, no fake beats and no force clicks or inert overrides.
 */
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
const url = process.env.ECG_TEST_URL || 'http://127.0.0.1:5173/';
const out = path.resolve(process.env.ECG_EVIDENCE_DIR || '.sites-runtime/activation-browser');
await mkdir(out, { recursive: true });
const identity = await (await fetch(new URL('build-info.json', url))).json();
assert.deepEqual(identity, JSON.parse(await readFile('dist/build-info.json', 'utf8')));
assert.equal(identity.dirty, false);
if (process.env.ECG_EXPECT_COMMIT) assert.equal(identity.commit, process.env.ECG_EXPECT_COMMIT);
const engines = process.env.ECG_ACTIVATION_ENGINES === 'all' ? { chromium, firefox, webkit } : { chromium };
const results = [];
for (const [engine, launcher] of Object.entries(engines)) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
      const errors = [], warnings = [], requests = [], checks = [], tag = `${engine}-${width}`;
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
      page.on('request', r => requests.push(r.url()));
      const ready = () => page.locator('#signal-loading').waitFor({ state: 'hidden' });
      const open = () => page.locator('[data-action="activation"]').click();
      const close = () => page.locator('#activation-dialog [data-activation="close"]').click();
      async function download(selector, suffix) {
        const waiting = page.waitForEvent('download'); await page.locator(selector).click();
        const file = path.join(out, `${tag}-${suffix}`); await (await waiting).saveAs(file); return readFile(file, 'utf8');
      }
      async function exportCase(suffix) {
        await page.locator('[data-action="export"]').click();
        const c = JSON.parse(await download('#dialog [data-action="json"]', suffix));
        await page.locator('#dialog [data-action="close-dialog"]').click(); return c;
      }
      try {
        await page.goto(url); await ready();
        assert.match(await page.title(), /ECG/); assert.equal(new URL(page.url()).origin, new URL(url).origin);
        assert.equal(await page.locator('vite-error-overlay').count(), 0);
        await chooseCatalogPreset(page, 'sinus'); await ready();
        const original = await exportCase('before.json');
        await open();
        assert.equal(await page.locator('[data-activation-plane]').count(), 4);
        assert.equal(await page.locator('[data-activation-lead]').count(), 12);
        assert.equal(await page.locator('[data-activation="apply"]').isDisabled(), true);
        await page.locator('#activation-choice').selectOption('rbbb');
        assert.match(await page.locator('#activation-changes').innerText(), /90 → 150/);
        assert.match(await page.locator('#activation-scope').innerText(), /no es un VCG clínico/);
        const slider = page.locator('#activation-time'); await slider.focus(); await slider.press('End');
        for (let n = 0; n < 30; n++) await slider.press('ArrowLeft');
        assert.match(await page.locator('#activation-clock').innerText(), /120 \/ 150 ms/);
        assert.match(await page.locator('#activation-instant').innerText(), /A 0\.000 mV/);
        checks.push('actual summed loop, four views, twelve leads, absolute-ms cursor and unequal QRS support');
        await slider.focus(); await slider.press('Home');
        await page.locator('[data-activation="play"]').click();
        await page.waitForFunction(() => Number(document.querySelector('#activation-time').value) > 20 && document.querySelector('[data-activation="play"]').getAttribute('aria-pressed') === 'true');
        await page.locator('[data-activation="play"]').click();
        assert.equal(await page.locator('[data-activation="play"]').getAttribute('aria-pressed'), 'false');
        const data = JSON.parse(await download('[data-activation="json"]', 'experiment.json'));
        assert.equal(data.kind, 'ecg-lab-activation'); assert.equal(data.clinicalValidation, false);
        assert.equal(data.a.case.conduction, 'normal'); assert.equal(data.b.case.conduction, 'rbbb');
        assert.equal(data.build.commit, identity.commit);
        assert.equal(Object.hasOwn(data.b.beat, 'qt'), false);
        assert.equal(data.durationMs, 150); assert.equal(Object.keys(data.b.leads).length, 12);
        const svg = await download('[data-activation="svg"]', 'experiment.svg');
        assert.equal((svg.match(/data-activation-lead=/g) || []).length, 12); assert.match(svg, /No es VCG clínico/);
        assert.ok(svg.includes(`Cursor: ${data.cursorMs.toFixed(0)} ms`));
        assert.equal(await page.evaluate(s => new DOMParser().parseFromString(s, 'image/svg+xml').querySelectorAll('parsererror').length, svg), 0);
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1), true);
        await page.screenshot({ path: path.join(out, `${tag}-activation.png`) });
        checks.push('pause, experiment JSON, standalone SVG and no horizontal overflow');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.open), false);
        assert.equal(await page.locator('[data-action="activation"]').evaluate(b => b === document.activeElement), true);
        assert.deepEqual(await exportCase('unmodified.json'), original);
        await open(); await page.locator('#activation-choice').selectOption('rbbb');
        await page.locator('[data-activation="apply"]').click(); await ready();
        const applied = await exportCase('applied.json');
        assert.equal(applied.conduction, 'rbbb'); assert.equal(applied.qrs, 150); assert.equal(applied.axis, 35);
        assert.equal(applied.rhythm, original.rhythm); assert.equal(applied.seed, original.seed);
        assert.match(await page.locator('#exploration-context').innerText(), /Basada en/);
        checks.push('cancel preserves case; explicit apply uses real worker and preserves exploration origin');
        await open();
        const qrs = page.locator('#activation-qrs'), model = page.locator('#activation-model');
        await model.selectOption('regional-rbbb-v1'); await qrs.fill('190');
        assert.match(await page.locator('[data-activation-model="A"]').innerText(), /Plantilla histórica/);
        assert.match(await page.locator('[data-activation-model="B"]').innerText(), /BRD regional/);
        await page.locator('.activation-timing summary').click();
        assert.match(await page.locator('.activation-timing').innerText(), /VD tardío: 55–190 ms/);
        await slider.focus(); await slider.press('End'); await qrs.fill('230');
        assert.match(await page.locator('#activation-clock').innerText(), /190 \/ 230 ms/);
        await qrs.fill('190');
        const timing = JSON.parse(await download('[data-activation="json"]', 'timing-experiment.json'));
        assert.equal(timing.a.case.qrs, 150); assert.equal(timing.b.case.qrs, 190);
        assert.equal(timing.a.timing.applied, 'template'); assert.equal(timing.b.timing.applied, 'regional-rbbb-v1');
        assert.equal(timing.b.timing.regions.at(-1).endMs, 190);
        assert.equal(timing.b.case.axis, timing.a.case.axis); assert.equal(timing.cursorMs, 190);
        assert.match(await download('[data-activation="svg"]', 'timing-experiment.svg'), /Modelo B: BRD regional/);
        await page.screenshot({ path: path.join(out, `${tag}-activation-timing.png`) });
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1), true);
        checks.push('regional versus template at shared time; fixed supports, preserved cursor, JSON/SVG model provenance');
        for (const invalid of ['', '59', '241']) {
          await qrs.fill(invalid);
          assert.equal(await qrs.getAttribute('aria-invalid'), 'true');
          assert.equal(await page.locator('#activation-error').isVisible(), true);
          assert.equal(await page.locator('[data-activation="apply"]').isVisible(), false);
          assert.equal(await page.locator('[data-activation="json"]').isVisible(), false);
          assert.equal(await page.locator('[data-activation-plane]').count(), 0);
          await qrs.fill('190');
          assert.equal(await qrs.getAttribute('aria-invalid'), 'false');
          assert.equal(await page.locator('#activation-error').isVisible(), false);
        }
        await page.locator('[data-activation="reset"]').click();
        assert.equal(await qrs.inputValue(), '150'); assert.equal(await model.inputValue(), 'template');
        assert.equal(await page.locator('[data-activation="apply"]').isDisabled(), true);
        const reset = JSON.parse(await download('[data-activation="json"]', 'timing-reset.json'));
        assert.deepEqual(reset.a, reset.b);
        await model.selectOption('regional-rbbb-v1'); await qrs.fill('190');
        await page.locator('[data-activation="apply"]').click(); await ready();
        const regionalApplied = await exportCase('timing-applied.json');
        assert.equal(regionalApplied.qrs, 190); assert.equal(regionalApplied.activationModel, 'regional-rbbb-v1');
        assert.equal(regionalApplied.axis, applied.axis); assert.equal(regionalApplied.seed, applied.seed);
        await open();
        assert.match(await page.locator('[data-activation-model="A"]').innerText(), /BRD regional/);
        await page.locator('#activation-choice').selectOption('lbbb');
        assert.equal(await qrs.inputValue(), '160');
        assert.match(await page.locator('[data-activation-model="B"]').innerText(), /Regional no aplicado/);
        const fallback = JSON.parse(await download('[data-activation="json"]', 'timing-fallback.json'));
        assert.equal(fallback.b.timing.applied, 'template'); assert.deepEqual(fallback.b.timing.regions, []);
        await close(); assert.deepEqual(await exportCase('timing-cancelled.json'), regionalApplied);
        checks.push('invalid input removes stale experiment; exact reset; apply through worker; unsupported fallback; cancel preserves case');
        await chooseCatalogPreset(page, 'pvc'); await ready(); await open();
        assert.match(await page.locator('#activation-beat option:checked').innerText(), /EV/);
        await page.locator('#activation-choice').selectOption('representative_vt');
        await page.locator('[data-activation="apply"]').click(); await ready();
        assert.equal((await exportCase('source.json')).ventricularSource, 'representative_vt');
        await chooseCatalogPreset(page, 'aai'); await ready(); await open();
        assert.equal(await page.locator('#activation-choice option[value="representative_vt"]').count(), 0);
        assert.equal(await page.locator('#activation-choice option[value="rbbb"]').count(), 1); await close();
        checks.push('EV uses actual ectopic event; source survives export; AAI is conducted, not ventricular');
        for (const preset of ['vf', 'wpw', 'posterior', 'torsades']) {
          await chooseCatalogPreset(page, preset); await ready(); await open();
          assert.equal(await page.locator('#activation-error').isVisible(), true);
          assert.equal(await page.locator('[data-activation-plane]').count(), 0); await close();
        }
        await page.locator('[data-action="quiz"]').click();
        assert.equal(await page.locator('[data-action="activation"]').isDisabled(), true);
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.open), false);
        checks.push('unsupported models do not fabricate loops; unanswered quiz cannot reveal the model');
        const localPaths = requests.filter(u => new URL(u).origin === new URL(url).origin).map(u => new URL(u).pathname);
        assert.ok(localPaths.some(p => /^\/assets\/.*\.js$/.test(p)));
        assert.ok(!localPaths.some(p => p.startsWith('/src/') || p.includes('@vite/client')));
        assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
        checks.push('compiled assets only, healthy console and no dev overlay');
        results.push({ engine, width, checks, errors, warnings, browser: await browser.version() });
      } catch (error) {
        await page.screenshot({ path: path.join(out, `${tag}-activation-failure.png`), fullPage: true }).catch(() => {});
        await writeFile(path.join(out, `${tag}-activation-failure.json`), JSON.stringify({ error: String(error), checks, errors, warnings })); throw error;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(path.join(out, 'activation-browser-results.json'), JSON.stringify({ identity, results, physicalDeviceTest: false }, null, 2));
console.log(JSON.stringify({ activationRuns: results.length, checks: results.reduce((n, r) => n + r.checks.length, 0) }));
