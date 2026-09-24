// Optional: npm install --no-save @napi-rs/canvas
// Generates traces using the same renderer, without a browser or patient data.
import { build } from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = process.cwd(),
  temp = path.join(root, ".sites-runtime"),
  out = path.join(root, "docs", "trazados");
await mkdir(temp, { recursive: true });
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `export {synthesize} from './src/engine/signal';export {PRESETS,fromPreset,presetById} from './src/presets/catalog';export {renderPaper,renderRhythm,Monitor,drawCaliper} from './src/render/ecg';export {measure} from './src/engine/measure';export {auditMeasurement} from './src/engine/analysis/model-audit';export {referenceForMeasurement} from './src/engine/reference';export {pngWithDpi} from './src/ui/persistence';`,
    resolveDir: root,
    sourcefile: "evidence-entry.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(temp, "evidence-engine.mjs"),
});
const E = await import(
  pathToFileURL(path.join(temp, "evidence-engine.mjs")).href +
    "?t=" +
    Date.now()
);
const { createCanvas } = await import(
  process.env.ECG_CANVAS_MODULE || "@napi-rs/canvas"
);
globalThis.window = { devicePixelRatio: 1 };
const canvas = () => {
  const c = createCanvas(1, 1);
  c.style = {};
  return c;
};
globalThis.document = { createElement: canvas };
let records = [];
for (const id of [
  "sinus",
  "rbbb",
  "lbbb",
  "inferior",
  "wenckebach",
  "complete",
  "af",
  "vt",
]) {
  const c = E.fromPreset(E.presetById(id)),
    s = E.synthesize(c, 65),
    cv = canvas();
  E.renderPaper(cv, s, c, 1280, { pxPerMm: 4.5, ratio: 1 });
  await writeFile(path.join(out, id + ".png"), cv.toBuffer("image/png"));
  const raw = E.measure(s);
  records.push({
    id,
    version: "1.2.0",
    reference: E.referenceForMeasurement(s, raw).reference,
    measured: E.auditMeasurement(s, raw),
  });
}
const c = E.fromPreset(E.presetById("sinus")),
  s = E.synthesize(c, 65);
for (const format of ["3x4", "3x4+1", "3x4+3", "6x2", "12x1"]) {
  c.view.format = format;
  const cv = canvas();
  E.renderPaper(cv, s, c, 1280, { pxPerMm: 3.78, ratio: 1 });
  await writeFile(
    path.join(out, "formato-" + format.replaceAll("+", "-") + ".png"),
    cv.toBuffer("image/png"),
  );
}
c.view.format = "3x4+1";
c.view.timing = "simultaneous";
let cv = canvas();
E.renderPaper(cv, s, c, 1280, { pxPerMm: 3.78, ratio: 1 });
await writeFile(
  path.join(out, "papel-simultaneo.png"),
  cv.toBuffer("image/png"),
);
c.view.timing = "sequential";
cv = canvas();
E.renderPaper(cv, s, c, 1280, { pxPerMm: 300 / 25.4, ratio: 1 });
const png = await E.pngWithDpi(new Blob([cv.toBuffer("image/png")]), 300);
await writeFile(
  path.join(out, "ecg-sinusal-300dpi.png"),
  Buffer.from(await png.arrayBuffer()),
);
cv = canvas();
E.renderRhythm(cv, s, c, 1280);
await writeFile(path.join(out, "tira-30s.png"), cv.toBuffer("image/png"));
c.view.duration = 60;
cv = canvas();
E.renderRhythm(cv, s, c, 1280);
await writeFile(path.join(out, "tira-60s.png"), cv.toBuffer("image/png"));
cv = canvas();
const mon = new E.Monitor(cv, s, c, 1280);
for (let i = 0; i < 12 * 60; i++) mon.frame(i / 60);
await writeFile(path.join(out, "monitor.png"), cv.toBuffer("image/png"));
await writeFile(
  path.join(out, "mediciones.json"),
  JSON.stringify(records, null, 2),
);
const all = E.PRESETS.map((p) => ({
  id: p.id,
  nombre: p.name,
  categoria: p.group,
  estado: p.strategy === "pending" ? "pendiente" : "aproximado",
  estrategia: p.strategy,
  limitacion: p.limitation,
}));
await writeFile(
  path.join(root, "docs", "estado-presets.json"),
  JSON.stringify(all, null, 2),
);
await writeFile(
  path.join(root, "docs", "estado-presets.md"),
  "# Estado de los patrones\n\nNingún patrón se presenta como validado clínicamente.\n\n| Patrón | Estado | Estrategia | Límite |\n|---|---|---|---|\n" +
    all
      .map(
        (p) =>
          `| ${p.nombre} | ${p.estado} | ${p.estrategia} | ${p.limitacion} |`,
      )
      .join("\n") +
    "\n",
);
for (const id of ["sinus", "af", "complete", "inferior"])
  await writeFile(
    path.join(root, "docs", "casos", id + ".json"),
    JSON.stringify(E.fromPreset(E.presetById(id)), null, 2),
  );
console.log(
  JSON.stringify(
    {
      patterns: all.length,
      implemented: all.filter((p) => p.estado !== "pendiente").length,
      measurements: records.map((r) => ({
        id: r.id,
        hr: r.measured.hr,
        pr: r.measured.pr,
        qrs: r.measured.qrs,
        qt: r.measured.qt,
        axis: r.measured.axis,
      })),
      output: out,
    },
    null,
    2,
  ),
);
