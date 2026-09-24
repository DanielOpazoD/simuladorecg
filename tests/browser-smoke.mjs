// Optional browser smoke checks. Run locally after `npm run dev`.
// Install the optional runner: npm install --no-save playwright
// Then: npx playwright install chromium && node tests/browser-smoke.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("docs/browser-captures", { recursive: true });

const ready = () =>
  page.locator("#signal-loading").waitFor({ state: "hidden" });
const field = (key) => page.locator(`[data-key="${key}"]`);
const panel = (name) => page.getByRole("tab", { name, exact: true }).click();
async function selectCase(name) {
  await page.getByRole("button", { name, exact: true }).click();
  await ready();
}
async function rangeEnd(key, end) {
  // Exercise the browser's range input and the application's real input handler.
  await field(key).focus();
  await field(key).press(end === "min" ? "Home" : "End");
}
async function assertCalipers(active) {
  const button = page.getByRole("button", { name: "Calibres", exact: true });
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
  await page.getByRole("button", { name: "Ampliar", exact: true }).click();
  await page
    .getByLabel("Derivación ampliada", { exact: true })
    .selectOption("V1");
  assert.match(
    await page.locator(".beat-plot").getAttribute("aria-label"),
    /V1/,
  );
  await page
    .getByLabel("Registro", { exact: true })
    .selectOption("simultaneous");
  await page.getByLabel("Formato", { exact: true }).selectOption("6x2");
  await page.getByLabel("Velocidad", { exact: true }).selectOption("50");
  await page.getByLabel("Ganancia", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "BRD", exact: true }).click();
  await page.locator("#signal-loading").waitFor({ state: "hidden" });
  assert.match(await page.locator("#case-title").innerText(), /rama derecha/);
  await page.getByRole("tab", { name: "Monitor", exact: true }).click();
  await page.getByRole("button", { name: "Congelar", exact: true }).click();
  assert.match(await page.locator("#monitor-state").innerText(), /CONGELADO/);
  await page.screenshot({ path: "docs/browser-captures/monitor.png" });

  // Regression: loading another case must reset both pause label and monitor state.
  await selectCase("Bradicardia");
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
  await page.getByRole("button", { name: "Calibres", exact: true }).click();
  await assertCalipers(true);
  await panel("Monitor");
  await assertCalipers(false);
  assert.equal(
    await page
      .getByRole("button", { name: "Calibres", exact: true })
      .isEnabled(),
    false,
  );
  await panel("12 derivaciones");
  await assertCalipers(false);
  await page.getByRole("button", { name: "Calibres", exact: true }).click();
  await selectCase("Sinusal");
  await assertCalipers(false);

  // The selector must configure the substrate promised by the existing example.
  await panel("ST y morfología");
  await field("ischemia").selectOption("sgarbossa");
  await ready();
  assert.equal(await field("conduction").inputValue(), "lbbb");
  assert.equal(await field("qrs").inputValue(), "160");
  assert.equal(await field("axis").inputValue(), "-15");
  assert.equal(await field("st").inputValue(), "3");
  assert.equal(await field("septalQ").isChecked(), false);
  await panel("Conducción");
  await field("conduction").selectOption("normal");
  await ready();
  assert.equal(await field("qrs").inputValue(), "90");
  assert.match(
    await page.locator("#warnings").innerText(),
    /requiere conducción BRI/,
  );

  // Rendered changes are wiring checks, not independent clinical morphology validation.
  for (const name of ["Wellens A", "De Winter"]) {
    await selectCase(name);
    await panel("ST y morfología");
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

  await selectCase("Wellens A");
  await panel("ST y morfología");
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

  await selectCase("BRD");
  await panel("ST y morfología");
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
  await selectCase("Sinusal");
  await panel("Conducción");
  await rangeEnd("coupling", "min");
  await ready();
  await panel("Fisiología");
  await rangeEnd("hr", "max");
  await ready();
  await panel("Conducción");
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
  assert.equal(
    await page
      .getByRole("button", { name: "Calibres", exact: true })
      .isEnabled(),
    false,
  );
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
  assert.equal(
    await page
      .getByRole("button", { name: "Calibres", exact: true })
      .isEnabled(),
    true,
  );

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
  await panel("ST y morfología");
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
  await selectCase("Sinusal");

  await page.getByRole("tab", { name: "Tira de ritmo", exact: true }).click();
  await page.getByLabel("Duración", { exact: true }).selectOption("60");
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
  assert.equal(await page.locator("#beat-detail").isVisible(), false);
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
    "Smoke UI completado: vistas/escalas, pausa/calibres, Sgarbossa, controles ST/T, rechazo y recuperación, importación/exportación, PNG, quiz y viewport móvil. No valida fidelidad clínica ni hardware móvil.",
  );
} finally {
  await browser.close();
}
