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
      // Hold a REAL worker response only to exercise cancellation/commit ordering.
      // No fabricated signal, no production source import, no shortened watchdog.
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        const probe = window.__activationApplyProbe = { posts: 0, holdNext: false, failPosts: 0, held: [],
          release() { this.held.splice(0).forEach(deliver => deliver()); } };
        window.Worker = class extends NativeWorker {
          hold = false;
          constructor(...args) {
            super(...args);
            this.addEventListener('message', event => {
              if (!this.hold) return;
              this.hold = false; event.stopImmediatePropagation();
              probe.held.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
            });
          }
          postMessage(...args) {
            probe.posts++;
            if (probe.failPosts > 0) { probe.failPosts--; throw new DOMException('Injected send failure', 'DataCloneError'); }
            if (probe.holdNext) { this.hold = true; probe.holdNext = false; }
            return super.postMessage(...args);
          }
        };
      });
      const errors = [], warnings = [], requests = [], checks = [], tag = `${engine}-${width}`;
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
      page.on('request', r => requests.push(r.url()));
      const ready = () => page.locator('#signal-loading').waitFor({ state: 'hidden' });
      const open = () => page.locator('[data-action="activation"]').click();
      const close = () => page.locator('#activation-dialog [data-activation="close"]').click();
      const applicationReady = async () => { await page.locator('#activation-dialog').waitFor({ state: 'hidden' }); await ready(); };
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
        const originalCanvas = await page.locator('#ecg').evaluate(c => c.toDataURL());
        const originalMetrics = await page.locator('#metrics').innerText();
        await open(); await page.locator('#activation-choice').selectOption('rbbb');
        const postCount = await page.evaluate(() => { window.__activationApplyProbe.holdNext = true; return window.__activationApplyProbe.posts; });
        await page.locator('[data-activation="apply"]').click();
        await page.waitForFunction(() => window.__activationApplyProbe.held.length === 1);
        assert.equal(await page.locator('.activation-workbench').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('#activation-qrs').isDisabled(), true);
        assert.equal(await page.locator('[data-activation="json"]').isDisabled(), true);
        assert.equal(await page.locator('[data-activation="close"]').isEnabled(), true);
        assert.match(await page.locator('#activation-apply-status').innerText(), /Validando B/);
        assert.doesNotMatch(await page.locator('#toast').innerText(), /Alternativa.*aplicada/);
        assert.equal(await page.locator('#ecg').evaluate(c => c.toDataURL()), originalCanvas);
        assert.equal(await page.locator('#metrics').innerText(), originalMetrics);
        await page.screenshot({ path: path.join(out, `${tag}-activation-validation-pending.png`) });
        await page.evaluate(() => window.__activationApplyProbe.release()); await applicationReady();
        assert.equal(await page.evaluate(() => window.__activationApplyProbe.posts), postCount + 1);
        const applied = await exportCase('applied.json');
        assert.equal(applied.conduction, 'rbbb'); assert.equal(applied.qrs, 150); assert.equal(applied.axis, 35);
        assert.equal(applied.rhythm, original.rhythm); assert.equal(applied.seed, original.seed);
        assert.match(await page.locator('#exploration-context').innerText(), /Basada en/);
        checks.push('A remains available while the real worker validates B; success commits once, without a second synthesis, preserving origin');
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
        await page.locator('[data-activation="apply"]').click(); await applicationReady();
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
        await chooseCatalogPreset(page, 'sinus'); await ready();
        const domainCase = { ...await exportCase('validation-base.json'), presetId: 'custom', name: 'Validación completa de alternativa',
          hr: 60, variability: 0, filter: 'off', ischemia: 'anterior', phase: 'hyperacute', electrolyte: 'hyperkalemia', st: 1 };
        await page.locator('#file-input').setInputFiles({ name: 'validation-case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(domainCase)) });
        await page.waitForFunction(() => document.querySelector('#case-title').textContent === 'Validación completa de alternativa'); await ready();
        const preserved = await exportCase('validation-original.json');
        const preservedCanvas = await page.locator('#ecg').evaluate(c => c.toDataURL());
        const preservedMetrics = await page.locator('#metrics').innerText();
        await open(); await page.locator('#activation-choice').selectOption('rbbb');
        assert.equal(await page.locator('[data-activation-lead]').count(), 12);
        await page.locator('[data-activation="apply"]').click();
        await page.waitForFunction(() => document.querySelector('#activation-error').textContent.startsWith('B no se aplicó.'));
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.open), true);
        assert.equal(await page.locator('#activation-qrs').isEnabled(), true);
        assert.match(await page.locator('#activation-error').innerText(), /fuera de alcance/);
        assert.equal(await page.locator('#signal-loading').isVisible(), false);
        assert.equal(await page.locator('#ecg').evaluate(c => c.toDataURL()), preservedCanvas);
        assert.equal(await page.locator('#metrics').innerText(), preservedMetrics);
        await page.screenshot({ path: path.join(out, `${tag}-activation-validation-rejected.png`) });
        await close(); assert.deepEqual(await exportCase('validation-rejected.json'), preserved);
        // Retry exhaustion is also local to B and must not invalidate A.
        await open(); await page.locator('#activation-qrs').fill('100');
        await page.evaluate(() => { window.__activationApplyProbe.failPosts = 2; });
        await page.locator('[data-activation="apply"]').click();
        await page.waitForFunction(() => document.querySelector('#activation-error').textContent.includes('único reintento'));
        assert.equal(await page.locator('#ecg').evaluate(c => c.toDataURL()), preservedCanvas);
        assert.equal(await page.locator('#metrics').innerText(), preservedMetrics);
        await page.locator('[data-activation="apply"]').click(); await applicationReady();
        const corrected = await exportCase('validation-corrected.json');
        assert.equal(corrected.qrs, 100); assert.equal(corrected.conduction, 'normal'); assert.equal(corrected.seed, preserved.seed);
        checks.push('real whole-ECG domain rejection and bounded transport failure preserve A, canvas, metrics and export; corrected B applies');

        await chooseCatalogPreset(page, 'sinus'); await ready(); await open();
        await page.locator('#activation-choice').selectOption('rbbb');
        await page.evaluate(() => { window.__activationApplyProbe.holdNext = true; });
        await page.locator('[data-activation="apply"]').click();
        await page.waitForFunction(() => window.__activationApplyProbe.held.length === 1);
        await page.keyboard.press('Escape');
        await chooseCatalogPreset(page, 'brady'); await ready();
        const newer = await exportCase('validation-newer.json');
        await page.evaluate(() => window.__activationApplyProbe.release());
        assert.deepEqual(await exportCase('validation-after-cancel.json'), newer);
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.open), false);
        assert.doesNotMatch(await page.locator('#toast').innerText(), /Alternativa.*aplicada/);
        checks.push('Escape aborts the pending application; delayed real reply cannot replace a newer selected case');
        await chooseCatalogPreset(page, 'pvc'); await ready(); await open();
        assert.match(await page.locator('#activation-beat option:checked').innerText(), /EV/);
        await page.locator('#activation-choice').selectOption('representative_vt');
        await page.locator('[data-activation="apply"]').click(); await applicationReady();
        assert.equal((await exportCase('source.json')).ventricularSource, 'representative_vt');
        await chooseCatalogPreset(page, 'aai'); await ready(); await open();
        assert.equal(await page.locator('#activation-choice option[value="representative_vt"]').count(), 0);
        assert.equal(await page.locator('#activation-choice option[value="rbbb"]').count(), 1); await close();
        checks.push('EV uses actual ectopic event; source survives export; AAI is conducted, not ventricular');
        await chooseCatalogPreset(page, 'wpw'); await ready();
        const nativeWpw = await exportCase('wpw-before.json'); await open();
        assert.equal(await page.locator('#activation-error').isVisible(), false);
        assert.equal(await page.locator('[data-activation-plane]').count(), 4);
        assert.equal(await page.locator('[data-activation-lead]').count(), 12);
        assert.match(await page.locator('[data-activation-model="A"]').innerText(), /Delta sintética adicional: 0–45 ms/);
        assert.match(await page.locator('[data-activation-model="A"]').innerText(), /no modifica el ST-T/);
        await page.locator('#activation-choice').selectOption('normal'); await qrs.fill('135');
        await slider.focus(); await slider.press('Home');
        for (let n = 0; n < 20; n++) await slider.press('ArrowRight');
        const wpw = JSON.parse(await download('[data-activation="json"]', 'wpw-experiment.json'));
        assert.equal(wpw.cursorMs, 20); assert.equal(wpw.a.timing.deltaDurationMs, 45);
        assert.equal(wpw.b.timing.deltaDurationMs, null); assert.match(wpw.timeReference, /original captured event/);
        // Equal base kernels, duration, gain and axis: the observed difference
        // must be precisely the historical delta, not an arbitrary prettier curve.
        const expectedDeltaII = .25 * Math.cos((55 - 60) * Math.PI / 180) * Math.sin(Math.PI * 20 / 45);
        assert.ok(Math.abs(wpw.a.leads.II[20] - wpw.b.leads.II[20] - expectedDeltaII) < 1e-10);
        assert.ok(Math.abs(wpw.a.leads.II[80] - wpw.b.leads.II[80]) < 1e-10);
        assert.match(await download('[data-activation="svg"]', 'wpw-experiment.svg'), /Delta incluida · A: 45 ms · B: 0 ms/);
        assert.equal(await page.locator('#activation-dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1), true);
        await page.locator('#activation-charts').screenshot({ path: path.join(out, `${tag}-activation-wpw.png`) });
        checks.push('WPW includes the actual delta; independent lead-II difference and shared scales; JSON/SVG identify the component');
        await page.locator('[data-activation="reset"]').click(); await qrs.fill('133.7');
        const fractional = JSON.parse(await download('[data-activation="json"]', 'wpw-fractional.json'));
        assert.ok(fractional.b.timesMs.includes(45)); assert.equal(fractional.b.timesMs.at(-1), 133.7);
        assert.equal(fractional.b.timing.deltaDurationMs, 45);
        await page.locator('[data-activation="reset"]').click();
        const wpwReset = JSON.parse(await download('[data-activation="json"]', 'wpw-reset.json'));
        assert.deepEqual(wpwReset.a, wpwReset.b); await close();
        assert.deepEqual(await exportCase('wpw-cancelled.json'), nativeWpw);
        checks.push('fractional WPW keeps the exact delta endpoint; reset and cancellation preserve captured case');
        await chooseCatalogPreset(page, 'sinus'); await ready(); await open();
        await page.locator('#activation-choice').selectOption('wpw');
        assert.match(await page.locator('#activation-changes').innerText(), /PR programado \(ms\): 160 → 100/);
        assert.match(await page.locator('#activation-changes').innerText(), /se recalculan los tiempos/);
        const proposedWpw = JSON.parse(await download('[data-activation="json"]', 'wpw-proposed.json'));
        assert.equal(Object.hasOwn(proposedWpw.b.beat, 'qt'), false);
        assert.equal(proposedWpw.b.beat.time, proposedWpw.a.beat.time);
        await page.locator('[data-activation="apply"]').click(); await applicationReady();
        const appliedWpw = await exportCase('wpw-applied.json');
        assert.equal(appliedWpw.conduction, 'wpw'); assert.equal(appliedWpw.pr, 100); assert.equal(appliedWpw.qrs, 135);
        await open();
        const regeneratedWpw = JSON.parse(await download('[data-activation="json"]', 'wpw-regenerated.json'));
        assert.equal(regeneratedWpw.a.timing.deltaDurationMs, 45);
        assert.ok(Math.abs(regeneratedWpw.a.beat.time - proposedWpw.a.beat.time + .06) < 1e-9);
        await close();
        checks.push('PR change is visible; apply regenerates WPW and event onset through the real worker; no reused QT truth');
        for (const preset of ['vf', 'posterior', 'torsades']) {
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
