// Exporta ECG sintéticos del motor actual para el banco de realismo.
// Uso: node scripts/fidelity/export-synthetic.mjs <dir-salida> [n=300] [preset=sinus]
// Escribe <dir>/index.json y un .f32 por ECG (5000 × 12, mV, orden de LEADS).
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outDir, nArg = "300", presetId = "sinus"] = process.argv.slice(2);
if (!outDir) throw new Error("Falta el directorio de salida");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const tmp = await mkdtemp(path.join(tmpdir(), "ecg-fidelity-"));
const bundle = path.join(tmp, "engine.mjs");
await build({
  stdin: {
    contents: `export { synthesize } from "./src/engine/signal.ts";
export { PRESETS, fromPreset } from "./src/presets/catalog.ts";
export { LEADS } from "./src/engine/lead-registry.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundle,
  logLevel: "error",
});
const { synthesize, PRESETS, fromPreset, LEADS } = await import(pathToFileURL(bundle).href);
await rm(tmp, { recursive: true, force: true });

// Población "normal" para dar al motor su mejor oportunidad: los intervalos, el eje
// y las amplitudes recorren rangos de adultos sanos. Determinista por índice.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const preset = PRESETS.find((p) => p.id === presetId);
if (!preset) throw new Error(`Preset desconocido: ${presetId}`);
const n = Number(nArg);
await mkdir(outDir, { recursive: true });
const index = [];
for (let i = 0; i < n; i++) {
  const r = rng(9001 + i);
  const u = (a, b) => a + (b - a) * r();
  const c = { ...fromPreset(preset), seed: 1 + i };
  if (presetId === "sinus") {
    Object.assign(c, {
      hr: u(52, 98), pr: u(130, 195), qrs: u(80, 104), qtc: u(390, 440),
      axis: u(-15, 85), pAxis: u(35, 70), qrsAmp: u(0.8, 1.25), tAmp: u(0.18, 0.38),
      pAmp: u(0.09, 0.18), transition: u(-0.6, 0.6), respiratoryRate: u(10, 18),
    });
  }
  const s = synthesize(c, 10);
  const len = s.leads.I.length;
  const data = new Float32Array(len * LEADS.length);
  for (let k = 0; k < len; k++)
    for (let j = 0; j < LEADS.length; j++) data[k * LEADS.length + j] = s.leads[LEADS[j]][k];
  const file = `syn_${String(i).padStart(4, "0")}.f32`;
  await writeFile(path.join(outDir, file), Buffer.from(data.buffer));
  index.push({ file, fs: s.fs, samples: len, leads: LEADS, preset: presetId, params: { hr: c.hr, axis: c.axis, qrs: c.qrs } });
}
await writeFile(path.join(outDir, "index.json"), JSON.stringify(index));
console.log(`${n} ECG sintéticos en ${outDir}`);
