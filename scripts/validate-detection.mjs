/** Matched comparison against v1.1; synthetic events are evaluation targets only. */
import { build } from "esbuild";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as baseline from "../tests/reference/baseline-v1.1.mjs";
const root = process.cwd();
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
let output = path.join(
  root,
  "docs",
  `detection-regression-v${version.split(".").slice(0, 2).join(".")}.json`,
);
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  let value;
  if (args[i] === "--output") value = args[++i];
  else if (args[i].startsWith("--output=")) value = args[i].slice(9);
  else throw new Error(`Unknown argument: ${args[i]}`);
  if (!value || value.startsWith("--"))
    throw new Error("--output requires a file path.");
  output = path.resolve(root, value);
}
await mkdir(path.join(root, ".sites-runtime"), { recursive: true });
const bundle = path.join(root, ".sites-runtime", "detection-validation.mjs");
await build({
  stdin: {
    contents: `export {measure} from './src/engine/measure';export {synthesize} from './src/engine/signal';export {ModelScopeError} from './src/engine/constraints';export {PRESETS,fromPreset} from './src/presets/catalog';`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
});
const current = await import(pathToFileURL(bundle).href + "?t=" + Date.now());
function score(signal, peaks) {
  const expected = signal.events.beats.filter(
    (b) => b.time > 0.3 && b.time + (b.qrs ?? 0.09) < 9.7,
  );
  const matched = new Set();
  let fp = 0;
  for (const p of peaks) {
    if (p < 0.3 || p > 9.7) continue;
    const k = signal.events.beats.findIndex(
      (b) => p >= b.time - 0.03 && p <= b.time + (b.qrs ?? 0.09) + 0.03,
    );
    if (k < 0 || matched.has(k)) fp++;
    else matched.add(k);
  }
  const fn = expected.filter(
    (b) => !matched.has(signal.events.beats.indexOf(b)),
  ).length;
  return { tp: expected.length - fn, fn, fp };
}
const cases = [];
function run(c, group) {
  const scenario = {
    group,
    id: c.presetId,
    hr: c.hr,
    coupling: c.coupling,
    seed: c.seed,
  };
  let signal;
  try {
    signal = current.synthesize(c, 10);
  } catch (error) {
    // Unsupported additive waveforms are a separate outcome, not detector FN/FP.
    // Unexpected failures still abort the benchmark instead of disappearing.
    if (!(error instanceof current.ModelScopeError)) throw error;
    cases.push({
      ...scenario,
      status: "out-of-scope",
      configuration: structuredClone(c),
      reason: {
        code: error.code,
        message: error.message,
        previousBeat: error.previousBeat,
        beat: error.beat,
        intervalMs: error.intervalMs,
      },
    });
    return;
  }
  cases.push({
    ...scenario,
    status: "compared",
    before: score(signal, baseline.measure(signal).detectedPeaks),
    after: score(signal, current.measure(signal).detectedPeaks),
  });
}
for (const preset of current.PRESETS.filter((p) => p.strategy !== "pending"))
  run(current.fromPreset(preset), "defaults");
for (const id of [
  "pvc",
  "bigeminy",
  "couplet",
  "vt",
  "hyperk",
  "complete_v",
  "aai",
  "vvi",
  "ddd",
])
  for (const hr of [40, 60, 90, 130])
    for (const coupling of ["pvc", "bigeminy", "couplet"].includes(id)
      ? [0.2, 0.3, 0.4, 0.58, 0.75]
      : [0.58])
      for (const seed of [11, 23, 71]) {
        const c = current.fromPreset(current.PRESETS.find((p) => p.id === id));
        Object.assign(c, { hr, coupling, seed });
        run(c, "variation");
      }
const expectedTotal = 313;
if (cases.length !== expectedTotal)
  throw new Error(
    `Expected ${expectedTotal} scenarios, received ${cases.length}.`,
  );
const compared = cases.filter((r) => r.status === "compared");
const outOfScope = cases.filter((r) => r.status === "out-of-scope");
const regressions = compared.filter(
  (r) => r.after.fp > r.before.fp || r.after.fn > r.before.fn,
);
const groups = [...new Set(cases.map((r) => r.group + "/" + r.id))].map(
  (key) => {
    const rows = cases.filter((r) => r.group + "/" + r.id === key);
    const admitted = rows.filter((r) => r.status === "compared");
    return {
      key,
      cases: rows.length,
      compared: admitted.length,
      outOfScope: rows.length - admitted.length,
      ...Object.fromEntries(
        ["before", "after"].map((version) => [
          version,
          Object.fromEntries(
            ["tp", "fp", "fn"].map((metric) => [
              metric,
              admitted.reduce((s, r) => s + r[version][metric], 0),
            ]),
          ),
        ]),
      ),
    };
  },
);
const result = {
  version,
  baselineCommit: "ad5a53261a7ac170297b32e7709ec158c2ed45c4",
  method:
    "All 313 scenarios retained. ModelScopeError is reported separately with configuration and reason; it is not a detection failure. Both analyzers receive the same admitted current-version samples. Interior 0.3–9.7 s; unique QRS support match with 30 ms margin; engineering regression, not clinical validation.",
  expectedTotal,
  total: cases.length,
  compared: compared.length,
  outOfScope: outOfScope.length,
  outOfScopeByCode: Object.fromEntries(
    [...new Set(outOfScope.map((r) => r.reason.code))].map((code) => [
      code,
      outOfScope.filter((r) => r.reason.code === code).length,
    ]),
  ),
  regressions,
  groups,
  cases,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      total: cases.length,
      compared: compared.length,
      outOfScope: outOfScope.length,
      outOfScopeByCode: result.outOfScopeByCode,
      regressions,
      output,
      variation: groups.filter((g) => g.key.startsWith("variation")),
    },
    null,
    2,
  ),
);
if (regressions.length) process.exitCode = 1;
