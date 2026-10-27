/** Open the same named measurement entry the learner sees. Practice keeps a
 * direct manual action because the model values must remain concealed. */
export async function startManualMeasurement(page) {
  const direct = page.locator('.trace-tools [data-action=caliper]');
  if (await direct.isVisible()) { await direct.click(); return; }
  await page.locator('.trace-tools [data-action=measurements]').click();
  await page.locator('[data-action=start-caliper]').click();
  await page.waitForFunction(() => !document.querySelector('#dialog').open && !document.querySelector('#caliper-editor').hidden);
}
