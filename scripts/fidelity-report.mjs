// Reproducible engineering report. No patient records or clinical validation claim.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = process.cwd(),
  temp = path.join(root, ".sites-runtime");
await mkdir(temp, { recursive: true });
const entry = `export {synthesize} from './src/engine/signal';export {measure} from './src/engine/measure';export {DEFAULT_CASE,cloneCase} from './src/engine/types';export {PRESETS,fromPreset} from './src/presets/catalog';export {auditMeasurement} from './src/engine/analysis/model-audit';export {referenceInWindow,referenceForMeasurement} from './src/engine/reference';export {fixture,BIPHASIC_T,U} from './tests/fixtures';`;
await build({
  stdin: { contents: entry, resolveDir: root },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(temp, "report-engine.mjs"),
});
const E = await import(
  pathToFileURL(path.join(temp, "report-engine.mjs")).href + "?v=" + Date.now()
);
const compact = (m) => ({
  hr: m.hr,
  pr: m.pr,
  qrs: m.qrs,
  qt: m.qt,
  qtcF: m.qtc.fridericia,
  axis: m.axis,
});
const cases = [];
for (const preset of E.PRESETS.filter((p) => p.strategy !== "pending")) {
  const c = E.fromPreset(preset),
    s = E.synthesize(c, 10),
    raw = E.measure(s),
    audited = E.auditMeasurement(s, raw);
  cases.push({
    id: preset.id,
    reference: E.referenceForMeasurement(s, raw).reference,
    windowReference: E.referenceInWindow(s),
    raw: compact(raw),
    presented: compact(audited),
    rejected: audited.rejected,
    evidence: audited.evidence,
  });
}
const qtCases = [];
for (const [hr, qtc] of [
  [40, 410],
  [60, 410],
  [72, 410],
  [100, 410],
  [40, 650],
]) {
  const c = E.cloneCase(E.DEFAULT_CASE);
  Object.assign(c, { hr, qtc, variability: 0 });
  const s = E.synthesize(c, 10),
    m = E.measure(s);
  qtCases.push({
    hr,
    qtc,
    referenceQT: s.truth.qt,
    measured: compact(m),
    errorQT: m.qt === null ? null : m.qt - s.truth.qt,
  });
}
const analyticCases = [
  ["linear", E.fixture()],
  ["biphasicT", E.fixture({ t: E.BIPHASIC_T })],
  ["separateU", E.fixture({ u: E.U })],
  ["noiseOnly", E.fixture({ noiseOnly: true })],
].map(([name, signal]) => ({ name, measured: compact(E.measure(signal)) }));
const result = {
  version: "1.2.0",
  date: "2026-09-24",
  method:
    "10 seconds; deterministic seed; synthetic references are engineering supports, not patient annotations.",
  qtCases,
  analyticCases,
  cases,
};
await writeFile(
  path.join(root, "docs", "fidelity-report.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      qtCases,
      analyticCases,
      presets: cases.length,
      available: Object.fromEntries(
        ["hr", "pr", "qrs", "qt"].map((key) => [
          key,
          cases.filter((c) => c.presented[key] !== null).length,
        ]),
      ),
    },
    null,
    2,
  ),
);
