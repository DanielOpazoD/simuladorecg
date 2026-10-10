// Exporta ECG sintéticos del motor actual para el banco de realismo.
// Uso: node scripts/fidelity/export-synthetic.mjs <dir-salida> [n=300] [preset=sinus|catalog] [ideal|realistic] [desplazamiento=0]
// "catalog" exporta cada preset activo una vez con su caso por defecto.
// "ideal" desactiva el ruido de adquisición para aislar la morfología.
// Escribe <dir>/index.json y un .f32 por ECG (5000 × 12, mV, orden de LEADS).
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outDir, nArg = "300", presetId = "sinus", mode = "", offsetArg = "0"] = process.argv.slice(2);
// Desplazamiento de semillas: lotes de entrenamiento y de prueba sin pacientes en común.
const offset = Number(offsetArg);
if (!outDir) throw new Error("Falta el directorio de salida");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const tmp = await mkdtemp(path.join(tmpdir(), "ecg-fidelity-"));
const bundle = path.join(tmp, "engine.mjs");
await build({
  stdin: {
    contents: `export { synthesize } from "./src/engine/signal.ts";
export { PRESETS, fromPreset } from "./src/presets/catalog.ts";
export { LEADS } from "./src/engine/lead-registry.ts";
export { registerShapeModel } from "./src/engine/realistic/shape-model.ts";
export { withNaturalControls } from "./src/engine/realistic/natural.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundle,
  logLevel: "error",
});
const { synthesize, PRESETS, fromPreset, LEADS, registerShapeModel, withNaturalControls } = await import(pathToFileURL(bundle).href);
await rm(tmp, { recursive: true, force: true });
// Modelos por clase: en la app los carga el worker bajo demanda (import.meta.glob);
// aquí se registran desde el disco.
const modelsDir = path.join(root, "src/engine/realistic/models");
for (const f of await readdir(modelsDir))
  if (f.endsWith(".json")) registerShapeModel(f.slice(0, -5), JSON.parse(await readFile(path.join(modelsDir, f), "utf8")));

// Población "normal": desde F2.3 cada semilla trae su eje, amplitudes, PR, QRS y QT
// (paciente natural); el lote solo varía lo que no es del paciente: frecuencia,
// respiración y variabilidad RR. Determinista por índice.
function rng(seed) {
  // mulberry32 sobre una semilla mezclada: semillas consecutivas no correlacionan.
  let a = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
await mkdir(outDir, { recursive: true });
const index = [];
const write = async (c, file, extra = {}) => {
  const s = synthesize(c, 10), len = s.leads.I.length, data = new Float32Array(len * LEADS.length);
  for (let k = 0; k < len; k++)
    for (let j = 0; j < LEADS.length; j++) data[k * LEADS.length + j] = Math.round(s.leads[LEADS[j]][k] * 1000) / 1000; // 1 µV, como PTB-XL
  await writeFile(path.join(outDir, file), Buffer.from(data.buffer));
  index.push({ file, fs: s.fs, samples: len, leads: LEADS, ...extra });
};
// "catalog": cada preset activo una vez, con su caso por defecto (clasificador diagnóstico).
if (presetId === "catalog") {
  for (const p of PRESETS.filter((x) => x.strategy !== "pending")) {
    const c = fromPreset(p);
    if (mode === "ideal") c.acquisition = "ideal";
    await write(c, `${p.id}.f32`, { preset: p.id });
  }
  await writeFile(path.join(outDir, "index.json"), JSON.stringify(index));
  console.log(`${index.length} presets en ${outDir}`);
  process.exit(0);
}
const preset = PRESETS.find((p) => p.id === presetId);
if (!preset) throw new Error(`Preset desconocido: ${presetId}`);
const n = Number(nArg);
for (let i = 0; i < n; i++) {
  const r = rng(9001 + offset + i);
  const u = (a, b) => a + (b - a) * r();
  const c = withNaturalControls({ ...fromPreset(preset), seed: 1 + offset + i });
  if (mode === "ideal") c.acquisition = "ideal";
  if (presetId === "sinus") {
    Object.assign(c, {
      hr: u(52, 98), respiratoryRate: u(10, 18),
      // Variabilidad RR individual: lognormal alrededor de la mediana de reposo.
      variability: 0.035 * Math.exp(0.6 * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())),
    });
  }
  await write(c, `syn_${String(i).padStart(4, "0")}.f32`, { preset: presetId, params: { hr: c.hr, axis: c.axis, qrs: c.qrs } });
}
await writeFile(path.join(outDir, "index.json"), JSON.stringify(index));
console.log(`${n} ECG sintéticos en ${outDir}`);
