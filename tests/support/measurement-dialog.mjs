/** The measurements the page presents. The simulator audits the worker's raw sample analysis
 * against its own events on the main thread (withdrawing or flagging candidates), so the
 * worker reply alone is not what a reader sees. «Medidas, límites y consistencia» is: this
 * reads its table through the visible interface (integer values, quality badge, n/N support)
 * and closes it again (`screenshot`: optional path to keep a picture of the dialog). A withdrawn measure reads as value null, status 'unavailable'.
 */
const KEYS = { 'FC ventricular': 'hr', PR: 'pr', QRS: 'qrs', QT: 'qt', 'Eje QRS': 'axis' };
const STATUS = { Reproducible: 'usable', Revisar: 'review', 'No estimable': 'unavailable' };
export async function readMeasurements(page, { close = true, screenshot = null } = {}) {
  await page.locator('.main-metric').click();
  const dialog = page.getByRole('dialog', { name: 'Medidas, límites y consistencia' });
  await dialog.waitFor();
  const rows = await dialog.locator('.measurement-table-wrap').first().locator('tbody tr').evaluateAll(trs => trs.map(tr => {
    const cells = [...tr.querySelectorAll('td')];
    return { label: cells[0].textContent.trim(), value: cells[1].textContent.trim(), badge: cells[3].querySelector('.evidence-badge').textContent.trim(),
      support: cells[3].querySelector('small').textContent.trim() };
  }));
  const result = {};
  for (const row of rows) {
    const key = KEYS[row.label];
    if (!key) throw new Error('Unknown measurement row: ' + row.label);
    const support = /^(\d+)\/(\d+)/.exec(row.support);
    result[key] = { value: row.value === '—' ? null : Number(row.value.replace(/[^\d.\-]/g, '')), status: STATUS[row.badge],
      count: support ? Number(support[1]) : null, total: support ? Number(support[2]) : null };
  }
  if (screenshot) await dialog.screenshot({ path: screenshot });
  if (close) {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }
  return result;
}
