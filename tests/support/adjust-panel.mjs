/** «Ajustar el caso» is a native disclosure folded at the end of the page. These helpers
 * drive it the way a reader does: open the disclosure, then pick one of its tabs
 * (Ritmo = conduction, Intervalos = base, ST y ondas = st, Señal = signal).
 * Controls inside a closed disclosure are not visible, so every script that touches
 * [data-key] parameters opens it first.
 */
export async function openAdjust(page) {
  if (await page.locator('#adjust').evaluate(e => e.open)) return;
  await page.locator('#adjust > summary').click();
  await page.waitForFunction(() => document.querySelector('#adjust').open);
}
export async function openControlPanel(page, name) {
  await openAdjust(page);
  await page.locator(`#inspector [data-panel="${name}"]`).click();
  await page.locator(`[data-control-panel="${name}"]`).waitFor({ state: 'visible' });
}
