/** Drive the real grouped catalogue using a specific example ID.
 * No hidden proxy buttons and no production grouping imports in the test driver.
 * Searching does not synthesize an intermediate case (important for fault injection).
 */
export async function chooseCatalogPreset(page, id) {
  if (await page.locator('#catalog').evaluate(e => e.inert))
    await page.locator('[data-action=catalog]').click();
  await page.locator('#category').selectOption('');
  await page.locator('#case-search').fill(id);
  await page.locator(`#case-list [data-preset="${id}"]`).click();
}
