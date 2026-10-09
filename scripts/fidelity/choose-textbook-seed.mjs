// Elige la semilla del "paciente de libro" para los presets con base aprendida:
// el más cercano a la media poblacional (‖z‖ mínimo) entre los que cumplen los
// criterios clásicos de un ECG normal. Uso: node scripts/fidelity/choose-textbook-seed.mjs [n=4000]
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = await mkdtemp(path.join(tmpdir(), "ecg-seed-"));
const bundle = path.join(tmp, "m.mjs");
await build({
  stdin: { contents: `export * from "./src/engine/realistic/shape-model.ts"; export { DEFAULT_CASE } from "./src/engine/types.ts";`, resolveDir: root, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "error",
});
const M = await import(pathToFileURL(bundle).href);
await rm(tmp, { recursive: true, force: true });

const c = M.DEFAULT_CASE, n = Number(process.argv[2] ?? 4000);
const LEADS = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
const results = [];
for (let seed = 1; seed <= n; seed++) {
  const p = M.samplePatient({ seed, axis: c.axis, pAxis: c.pAxis, tAxis: c.tAxis, pScale: 1, qrsScale: 1, tScale: 1, horizontalDeg: 0 });
  const m = p.model, x = M.transform(m, M.reconstruct(m, p.z), p.ops);
  const wave = (phase, lead) => {
    const ph = m.phases[phase], li = LEADS.indexOf(lead);
    if (li >= 0) return Array.from({ length: ph.points }, (_, i) => x[(ph.offset + i) * 8 + li]);
    const I = wave(phase, "I"), II = wave(phase, "II");
    return I.map((a, i) => (lead === "aVR" ? -(a + II[i]) / 2 : lead === "aVL" ? a - II[i] / 2 : II[i] - a / 2));
  };
  const max = (a) => Math.max(...a), min = (a) => Math.min(...a);
  const rs = (lead) => { const q = wave("qrs", lead); return max(q) / Math.max(1e-6, -min(q)); };
  const t = (lead) => { const w = [...wave("st", lead), ...wave("t", lead)]; return w[w.reduce((k, v, i) => (Math.abs(v) > Math.abs(w[k]) ? i : k), 0)]; };
  const septal = (lead) => min(wave("qrs", lead).slice(0, Math.round(m.phases.qrs.points * 0.3)));
  const v1p = wave("p", "V1"), stV2 = wave("st", "V2")[Math.round(m.phases.st.points * 0.25)];
  const checks = {
    pII: max(wave("p", "II")) > 0.07,
    pAVR: min(wave("p", "aVR")) < -0.04,
    pV1biphasic: max(v1p) > 0.02 && min(v1p) < -0.02,
    rsV1: rs("V1") < 0.5, rsV2: rs("V2") < 0.8,
    progression: rs("V1") < rs("V2") && rs("V2") < rs("V3") && rs("V3") < rs("V4"),
    transition: rs("V3") > 0.5 && rs("V3") < 2,
    lateral: rs("V5") > 3 && rs("V6") > 3,
    septalQ: septal("V6") < -0.03 && septal("I") < -0.01,
    tUpright: ["I", "II", "V2", "V3", "V4", "V5", "V6"].every((l) => t(l) > 0.08),
    tAVR: t("aVR") < -0.05,
    stV2: stV2 > 0 && stV2 < 0.15,
    pDuration: p.pMs > 85 && p.pMs < 115,
  };
  const ok = Object.values(checks).every(Boolean);
  const norm = Math.hypot(...p.z);
  results.push({ seed, ok, norm, failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k) });
}
const passing = results.filter((r) => r.ok).sort((a, b) => a.norm - b.norm);
console.log(`Cumplen ${passing.length}/${n}. Mejores:`, passing.slice(0, 5).map((r) => `${r.seed} (‖z‖ ${r.norm.toFixed(2)})`).join(", "));
const freq = {};
for (const r of results) for (const f of r.failed) freq[f] = (freq[f] ?? 0) + 1;
console.log("Criterio no cumplido (frecuencia):", JSON.stringify(freq));
