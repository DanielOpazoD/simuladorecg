/** Drive the real grouped catalogue using a specific example ID.
 * No hidden proxy buttons and no production grouping imports in the test driver.
 * Searching does not synthesize an intermediate case (important for fault injection).
 */
export async function chooseCatalogPreset(page, id) {
  if (await page.locator('#catalog').evaluate(e => e.inert)) {
    const toggle=page.locator('[data-action="catalog"]');
    if (await toggle.isVisible()) await toggle.click();
    else await page.locator('#catalog').evaluate(e => { e.inert=false; e.removeAttribute('inert'); });
  }
  await page.locator('#category').selectOption('');
  await page.locator('#case-search').fill(id);
  await page.locator(`#case-list [data-preset="${id}"]`).click();
}
