// Recorre todos los presets disponibles en un build servido y falla ante
// errores de página o trazados vacíos. Uso: node tests/smoke-browser.mjs <url>
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector(".case-button");

const inked = () => page.locator("canvas").first().evaluate((cv) => {
  const { data } = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90) dark++;
  return dark;
});

// Cada cambio de caso borra el lienzo y muestra #signal-loading; solo una señal
// generada sin error lo oculta. Esperarlo evita medir el trazado anterior.
const ready = async (label) => {
  try {
    await page.waitForSelector("#signal-loading", { state: "hidden", timeout: 8000 });
  } catch {
    const text = (await page.locator("#signal-loading").innerText().catch(() => "")).trim();
    errors.push(`${label}: la señal no se generó (${text || "sin respuesta"})`);
    return false;
  }
  return true;
};

const diagnoses = await page.locator(".case-button:not([disabled])").evaluateAll((es) => es.map((e) => e.dataset.diagnosis));
let checked = 0, expected = 0;
for (const diagnosis of diagnoses) {
  await page.locator(`.case-button[data-diagnosis="${diagnosis}"]`).first().click();
  await ready(diagnosis);
  const variants = await page.locator(".variant-tabs [data-variant]").evaluateAll((es) => es.map((e) => e.dataset.variant));
  expected += variants.length || 1;
  for (const variant of variants.length ? variants : [null]) {
    if (variant) await page.locator(`.variant-tabs [data-variant="${variant}"]`).click();
    if (!(await ready(variant ?? diagnosis))) continue;
    const pixels = await inked();
    if (pixels < 2000) errors.push(`${variant ?? diagnosis}: trazado vacío (${pixels} píxeles)`);
    checked++;
  }
}
await browser.close();
console.log(`Presets recorridos: ${checked}`);
if (checked !== expected || expected < 60) errors.push(`Se recorrieron ${checked} de ${expected} presets`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
