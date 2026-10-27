/** «Ajustar el caso» is a native disclosure folded at the end of the page. These helpers
 * drive it the way a reader does: open the disclosure, then pick one of its tabs
 * (Ritmo = conduction, Intervalos = base, ST y ondas = st, Artefactos = signal).
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

/** View settings and reading aids are folded inside «Vista».
 * A click elsewhere closes the outer menu; open the requested section before use. */
export async function openPaper(page, section = 'settings') {
  if (!await page.locator('.paper-menu').evaluate(e => e.open)) await page.locator('.paper-menu > summary').click();
  const details = page.locator(section === 'aids' ? '.view-aids' : '.view-settings');
  if (!await details.evaluate(e => e.open)) await details.locator('summary').click();
}
