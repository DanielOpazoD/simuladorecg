// Optional browser smoke checks. Run locally after `npm run dev`.
// Install the locked tooling: npm ci
// Then: npx playwright install chromium && node tests/browser-smoke.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chooseCatalogPreset } from "./support/catalog-navigation.mjs";
import { openControlPanel } from "./support/adjust-panel.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("docs/browser-captures", { recursive: true });

const ready = () =>
  page.locator("#signal-loading").waitFor({ state: "hidden" });
const field = (key) => page.locator(`[data-key="${key}"]`);
// View tabs (12 derivaciones / Monitor / Tira de ritmo) by their visible name.
const panel = (name) => page.getByRole("tab", { name, exact: true }).click();
// Parameter tabs live in the folded «Ajustar el caso»: Ritmo, Intervalos, ST y ondas, Señal.
const adjust = (name) => openControlPanel(page, name);
// Cases are chosen through the library by example id (searching opens its family).
async function selectCase(id) {
  await chooseCatalogPreset(page, id);
  await ready();
}
// By attribute: on the monitor the button is hidden, which role queries (rightly) exclude.
const calipers = () => page.locator('[data-action="caliper"]');
async function rangeEnd(key, end) {
  // Exercise the browser's range input and the application's real input handler.
  await field(key).focus();
  await field(key).press(end === "min" ? "Home" : "End");
}
async function assertCalipers(active) {
  const button = calipers();
  assert.equal(await button.getAttribute("aria-pressed"), String(active));
  assert.equal(
    await button.evaluate((el) => el.classList.contains("active")),
    active,
  );
  assert.equal(
    await page
      .locator("#ecg")
      .evaluate((el) => el.classList.contains("measuring")),
    active,
  );
}
async function importJSON(value) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.locator("#file-input").setInputFiles({
    name: "regression-case.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  // File.text() is asynchronous: wait for the import handler, not an old ready state.
  await page.waitForFunction(
    () =>
      document.querySelector("#file-input").value === "" &&
      !document.querySelector("#dialog").open,
  );
  await ready();
}

try {
  await page.goto(process.env.ECG_TEST_URL || "http://localhost:5173/");
  await page.locator("#signal-loading").waitFor({ state: "hidden" });
  assert.match(await page.locator("#case-title").innerText(), /Ritmo sinusal/);
  assert.ok(
    await page.locator("#ecg").evaluate((c) => c.width > 0 && c.height > 0),
  );
  await page.screenshot({ path: "docs/browser-captures/papel.png" });
  await field("view.format").selectOption("6x2");
  await field("view.speed").selectOption("50");
  await field("view.gain").selectOption("5");
  await selectCase("rbbb");
  assert.match(await page.locator("#case-title").innerText(), /rama derecha/);
  assert.equal(
    await page.getByRole("button", { name: "Congelar", exact: true }).isHidden(),
    true,
    "Freeze exists only on the monitor",
  );
  await page.getByRole("tab", { name: "Monitor", exact: true }).click();
  await page.getByRole("button", { name: "Congelar", exact: true }).click();
  assert.match(await page.locator("#monitor-state").innerText(), /CONGELADO/);
  await page.screenshot({ path: "docs/browser-captures/monitor.png" });

  // Regression: loading another case must reset both pause label and monitor state.
  await selectCase("brady");
  assert.equal(
    await page.locator("#monitor-state").innerText(),
    "REPRODUCCIÓN",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Congelar", exact: true })
      .isEnabled(),
    true,
  );

  // Regression: pressed/active/measuring must agree across view and case changes.
  await panel("12 derivaciones");
  await calipers().click();
  await assertCalipers(true);
  await panel("Monitor");
  await assertCalipers(false);
  assert.equal(await calipers().isHidden(), true, "Calipers are hidden on the monitor");
  await panel("12 derivaciones");
  await assertCalipers(false);
  await calipers().click();
  await selectCase("sinus");
  await assertCalipers(false);

  // The selector must configure the substrate promised by the existing example.
  await adjust("st");
  await field("ischemia").selectOption("sgarbossa");
  await ready();
  assert.equal(await field("conduction").inputValue(), "lbbb");
  assert.equal(await field("qrs").inputValue(), "160");
  assert.equal(await field("axis").inputValue(), "-15");
  assert.equal(await field("st").inputValue(), "3");
  assert.equal(await field("septalQ").isChecked(), false);
  await adjust("conduction");
  await field("conduction").selectOption("normal");
  await ready();
  assert.equal(await field("qrs").inputValue(), "90");
  assert.match(
    await page.locator("#warnings").innerText(),
    /requiere conducción BRI/,
  );

  // Rendered changes are wiring checks, not independent clinical morphology validation.
  for (const name of ["wellens_a", "de_winter"]) {
    await selectCase(name);
    await adjust("st");
    assert.equal(await field("st").isEnabled(), true);
    await rangeEnd("st", "min");
    await ready();
    assert.match(
      await page
        .getByRole("status", { name: "Intensidad de lesión", exact: true })
        .innerText(),
      /^0\s/,
    );
    const withoutInjury = await page
      .locator("#ecg")
      .evaluate((c) => c.toDataURL());
    await rangeEnd("st", "max");
    await ready();
    assert.match(
      await page
        .getByRole("status", { name: "Intensidad de lesión", exact: true })
        .innerText(),
      /^8\s/,
    );
    const withInjury = await page
      .locator("#ecg")
      .evaluate((c) => c.toDataURL());
    assert.notEqual(
      withInjury,
      withoutInjury,
      `${name}: ST–T intensity must affect the paper`,
    );
  }
  await field("phase").selectOption("chronic");
  await ready();
  assert.equal(await field("st").isEnabled(), false);
  assert.match(
    await page.locator("#amplitude-note").innerText(),
    /ST resuelto/,
  );

  await selectCase("wellens_a");
  await adjust("st");
  await rangeEnd("tAmp", "min");
  await ready();
  assert.equal(await field("st").isEnabled(), false);
  assert.match(
    await page.locator("#amplitude-note").innerText(),
    /Reactiva Amplitud de T/,
  );
  await rangeEnd("tAmp", "max");
  await ready();
  assert.equal(await field("st").isEnabled(), true);

  // A learned bundle-branch pattern has a secondary ST-T that follows the QRS: T amplitude does not apply.
  await selectCase("rbbb");
  await adjust("st");
  assert.equal(await field("tAmp").isDisabled(), true);
  assert.match(await page.locator("#amplitude-note").innerText(), /ST–T secundaria del paciente/);
  // Where T amplitude applies (normal rhythm), it must reach the paper.
  await selectCase("sinus");
  await adjust("st");
  await rangeEnd("tAmp", "min");
  await ready();
  const withoutT = await page.locator("#ecg").evaluate((c) => c.toDataURL());
  await rangeEnd("tAmp", "max");
  await ready();
  assert.notEqual(
    await page.locator("#ecg").evaluate((c) => c.toDataURL()),
    withoutT,
  );

  // An unsupported combination must remove the old trace and remain recoverable.
  await selectCase("sinus");
  await adjust("conduction");
  // The coupling control only acts with ectopy: set it while an isolated ectopic beat is chosen, then
  // clear the ectopy (the value is kept) and push the rate beyond the model.
  await field("ectopy").selectOption("pvc");
  await ready();
  await rangeEnd("coupling", "min");
  await ready();
  await field("ectopy").selectOption("none");
  await ready();
  await adjust("base");
  await rangeEnd("hr", "max");
  await ready();
  await adjust("conduction");
  await field("ectopy").selectOption("couplet");
  await page.waitForFunction(() =>
    document
      .querySelector("#signal-loading")
      .textContent.startsWith("Fuera del alcance del modelo:"),
  );
  assert.equal(await field("hr").inputValue(), "250");
  assert.equal(await field("coupling").inputValue(), "0.3");
  assert.match(
    await page.locator("#metrics").innerText(),
    /Medidas no disponibles/,
  );
  assert.equal(
    await page.locator("#ecg").getAttribute("aria-label"),
    "Señal no disponible",
  );
  assert.equal(
    await page.locator("#ecg").evaluate((c) =>
      c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height)
        .data.some((v) => v !== 0),
    ),
    false,
    "Out-of-scope state must not retain pixels from the previous ECG",
  );
  await assertCalipers(false);
  assert.equal(await calipers().isEnabled(), false);
  await page.screenshot({ path: "docs/browser-captures/fuera-de-alcance.png" });
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: /PNG de impresión/ }).isEnabled(),
    false,
  );
  assert.equal(
    await page.getByRole("button", { name: /Exportar caso JSON/ }).isEnabled(),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: /Importar caso JSON/ }).isEnabled(),
    true,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await page.getByRole("button", { name: "Restablecer", exact: true }).click();
  await ready();
  assert.equal(await page.locator("#case-title").innerText(), "Ritmo sinusal");
  assert.equal(await calipers().isEnabled(), true);

  // A legacy JSON with false preset metadata must retain VF, not sinus findings.
  await importJSON({
    version: 1,
    presetId: "sinus",
    name: "Ritmo sinusal",
    rhythm: "vf",
  });
  assert.equal(
    await page.locator("#case-title").innerText(),
    "Caso personalizado",
  );
  assert.equal(await field("rhythm").inputValue(), "vf");
  assert.doesNotMatch(
    await page.locator("#findings").innerText(),
    /PR constante|P positiva/,
  );
  await adjust("st");
  assert.equal(await field("st").isEnabled(), false);
  assert.equal(await field("tAmp").isEnabled(), false);
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const jsonPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar caso JSON/ }).click();
  const jsonDownload = await jsonPromise;
  const chunks = [];
  for await (const chunk of await jsonDownload.createReadStream())
    chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(exported.presetId, "custom");
  assert.equal(exported.name, "Caso personalizado");
  assert.equal(exported.rhythm, "vf");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await selectCase("sinus");

  await page.getByRole("tab", { name: "Tira de ritmo", exact: true }).click();
  await field("view.duration").selectOption("60");
  await page.screenshot({ path: "docs/browser-captures/tira.png" });
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PNG de impresión/ }).click();
  const png = await pngPromise;
  assert.match(png.suggestedFilename(), /\.png$/);
  await png.saveAs("docs/browser-captures/exportado.png");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await page.getByRole("button", { name: "Practicar", exact: true }).click();
  assert.match(
    await page.locator("#case-title").innerText(),
    /Interpreta este ECG/,
  );
  assert.equal(await page.locator("#adjust").isVisible(), false);
  assert.equal(await page.locator("[data-action=parameters]").isDisabled(), true);
  assert.equal(
    await page
      .getByRole("button", { name: "Exportar", exact: true })
      .isEnabled(),
    false,
  );
  await page.locator("[data-answer]").first().click();
  assert.equal(await page.locator(".quiz-choices .correct").count(), 1);
  await page.getByRole("button", { name: "Salir de práctica" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "docs/browser-captures/movil.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Smoke UI completado: vistas/escalas, herramientas según la vista, pausa/calibres, Sgarbossa, controles ST/T, rechazo y recuperación, importación/exportación, PNG, quiz y viewport móvil. No valida fidelidad clínica ni hardware móvil.",
  );
} finally {
  await browser.close();
}
