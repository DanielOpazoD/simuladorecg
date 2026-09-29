import { chooseCatalogPreset } from './support/catalog-navigation.mjs';
/** Browser plugin absent: use the repository's established Playwright/Chromium production test. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const url = process.env.ECG_TEST_URL || 'http://127.0.0.1:5173/';
const out = path.resolve(process.env.ECG_EVIDENCE_DIR || '.sites-runtime/browser');
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true}), results = [];
try {
  for (const preset of ['posterior', 'wpw', 'rv_acute', 'rv_chronic']) for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}}), errors = [], warnings = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
    await page.goto(url); assert.match(await page.title(), /ECG/);
    assert.equal(new URL(page.url()).origin, new URL(url).origin);
    await page.locator('#signal-loading').waitFor({state: 'hidden'});
    if (width === 390) await page.locator('[data-action="catalog"]').click();
    await chooseCatalogPreset(page, preset);
    await page.locator('#signal-loading').waitFor({state: 'hidden'});
    assert.ok(await page.locator('#ecg').evaluate(c => c.width > 0 && c.height > 0));
    await page.locator('[data-panel="st"]').click();
    const gain = page.locator('[data-key="qrsAmp"]');
    await page.evaluate(() => document.fonts.ready);
    const setGain = async value => {
      await gain.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }, value);
      await page.locator('#signal-loading').waitFor({state: 'hidden'});
      await page.locator('#ecg').scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const recordCanvas = async (label, data) => {
      await writeFile(path.join(out, `${preset}-${label}-canvas-${width}.png`), Buffer.from(data.split(',')[1], 'base64'));
      return createHash('sha256').update(data).digest('hex');
    };
    // Normalize the metadata to a custom case before comparing pixels.
    const referenceGain = preset === 'rv_chronic' ? '1.2' : '1';
    await setGain(referenceGain);
    const initial = await page.locator('#ecg').evaluate(c => c.toDataURL());
    await setGain('0.1');
    await page.locator('#signal-loading').waitFor({state: 'hidden'});
    assert.equal(await gain.inputValue(), '0.1');
    const low = await page.locator('#ecg').evaluate(c => c.toDataURL());
    assert.notEqual(initial, low, 'The real control must change the rendered trace');
    const initialHash = await recordCanvas('initial', initial);
    const lowHash = await recordCanvas('low', low);
    // Capture the viewport, not an overflowing element: element screenshots may resize
    // the mobile viewport and trigger a responsive redraw during this round trip.
    await page.screenshot({path: path.join(out, `${preset}-gain-low-${width}.png`)});
    await setGain(referenceGain);
    await page.locator('#signal-loading').waitFor({state: 'hidden'});
    assert.equal(await gain.inputValue(), referenceGain);
    const restored = await page.locator('#ecg').evaluate(c => c.toDataURL());
    const restoredHash = await recordCanvas('restored', restored);
    const state = await page.evaluate(() => ({width: innerWidth, dpr: devicePixelRatio,
      canvasWidth: document.querySelector('#ecg').width, canvasHeight: document.querySelector('#ecg').height,
      label: document.querySelector('#ecg').getAttribute('aria-label'), fonts: document.fonts.status}));
    await writeFile(path.join(out, `${preset}-render-state-${width}.json`), JSON.stringify({initialHash, lowHash, restoredHash, state}, null, 2));
    assert.equal(restoredHash, initialHash, 'Returning to reference gain must restore the exact complete canvas');
    await page.screenshot({path: path.join(out, `${preset}-gain-default-${width}.png`)});
    let lowVoltageEvidence = {};
    {
      // Exercise the existing JSON import path; no new product control.
      await page.locator('[data-action="export"]').click();
      const exported = page.waitForEvent('download'); await page.locator('[data-action="json"]').click();
      const casePath = path.join(out, `${preset}-case-${width}.json`); await (await exported).saveAs(casePath);
      const originalCase = JSON.parse(await readFile(casePath, 'utf8'));
      const importCase = async electrolyte => {
        await page.locator('#file-input').setInputFiles({name: `${preset}-voltage.json`, mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({...originalCase, electrolyte}))});
      };
      await importCase('lowvoltage');
      await page.waitForFunction(initial => document.querySelector('#ecg').toDataURL() !== initial, restored);
      await page.locator('#signal-loading').waitFor({state: 'hidden'});
      await page.locator('#ecg').scrollIntoViewIfNeeded();
      const lowVoltageCanvas = await page.locator('#ecg').evaluate(c => c.toDataURL());
      const lowVoltageHash = await recordCanvas('low-voltage', lowVoltageCanvas);
      assert.notEqual(lowVoltageHash, restoredHash);
      await page.screenshot({path: path.join(out, `${preset}-low-voltage-${width}.png`)});
      await importCase('none');
      await page.waitForFunction(initial => document.querySelector('#ecg').toDataURL() === initial, restored);
      await page.locator('#signal-loading').waitFor({state: 'hidden'});
      const voltageRestoredHash = await recordCanvas('voltage-restored', await page.locator('#ecg').evaluate(c => c.toDataURL()));
      assert.equal(voltageRestoredHash, restoredHash, 'Removing low voltage must restore the complete canvas');
      lowVoltageEvidence = {lowVoltageHash, voltageRestoredHash};
    }
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
    results.push({preset, width, referenceGain, initialHash, lowHash, restoredHash, ...lowVoltageEvidence, state, errors, warnings, flow: `${preset} -> QRS gain 0.1 -> visible change -> gain ${referenceGain} -> exact canvas restoration` + ' -> JSON low voltage -> visible change -> JSON none -> exact restoration'});
    await page.close();
  }
  await writeFile(path.join(out, 'posterior-amplitude-ui-results.json'), JSON.stringify({url, browser: await browser.version(), results, physicalDeviceTest: false}, null, 2));
  console.log(JSON.stringify({qrsAmplitudeFlows: results.length}));
} finally { await browser.close(); }
