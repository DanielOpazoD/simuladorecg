/** Offline regression comparison. Clinical records are never passed to model audit. */
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as baseline from "../tests/reference/baseline-v1.1.mjs";
import {
  loadLudb,
  fourLeadQrsReference,
  matchQrsEvents,
} from "../tests/reference/ludb/load-ludb.mjs";

const root = process.cwd();
const split =
  process.argv.find((x) => x.startsWith("--split="))?.slice(8) ?? "development";
if (!["development", "control", "all"].includes(split))
  throw new Error("Unknown split");
await mkdir(path.join(root, ".sites-runtime"), { recursive: true });
const bundle = path.join(root, ".sites-runtime", "analysis-validation.mjs");
await build({
  stdin: {
    contents: `export {measure} from './src/engine/measure';export {synthesize} from './src/engine/signal';export {PRESETS,fromPreset} from './src/presets/catalog';export {auditMeasurement} from './src/engine/analysis/model-audit';export {referenceForMeasurement} from './src/engine/reference';`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
});
const current = await import(pathToFileURL(bundle).href + "?t=" + Date.now());
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const quant = (p) =>
    sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return {
    n: values.length,
    biasMs: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    maeMs: values.length
      ? values.reduce((a, b) => a + Math.abs(b), 0) / values.length
      : null,
    medianMs: quant(0.5),
    p10Ms: quant(0.1),
    p90Ms: quant(0.9),
    maxAbsMs: values.length ? Math.max(...values.map(Math.abs)) : null,
  };
};
const compact = (m) =>
  Object.fromEntries(
    ["hr", "pr", "qrs", "qt", "axis"].map((key) => [key, m[key]]),
  );
function assessExternal(signal, reference, analyze) {
  const m = analyze(signal),
    first = reference.beats[0]?.peak ?? 0,
    last = reference.beats.at(-1)?.peak ?? 10;
  const window = {
    start: Math.max(0, first - 0.15),
    end: Math.min(10, last + 0.15),
  };
  const peaks = m.detectedPeaks.filter(
    (t) => t >= window.start && t <= window.end,
  );
  const matching = matchQrsEvents(
    reference.beats.map((b) => b.peak),
    peaks,
    0.15,
  );
  const errors = [];
  for (const pair of matching.pairs) {
    const expected = reference.beats.find((b) => b.peak === pair.reference);
    const measured = m.beats.find((b) => b.peak === pair.detected);
    if (!measured) continue;
    errors.push({
      peak: pair.reference,
      onsetMs:
        expected.qrsOnset === null
          ? null
          : (measured.onset - expected.qrsOnset) * 1000,
      offsetMs:
        expected.qrsOffset === null
          ? null
          : (measured.offset - expected.qrsOffset) * 1000,
      widthMs:
        expected.qrsOnset === null || expected.qrsOffset === null
          ? null
          : measured.qrs - (expected.qrsOffset - expected.qrsOnset) * 1000,
    });
  }
  return {
    window,
    outsideAnnotationWindow: m.detectedPeaks.length - peaks.length,
    detection: matching,
    measured: compact(m),
    annotated: reference.beats.length,
    delineatedMatches: errors.length,
    fullyComparableBounds: errors.filter(
      (e) => e.onsetMs !== null && e.offsetMs !== null,
    ).length,
    errors,
    onset: summary(
      errors.flatMap((e) => (e.onsetMs === null ? [] : [e.onsetMs])),
    ),
    offset: summary(
      errors.flatMap((e) => (e.offsetMs === null ? [] : [e.offsetMs])),
    ),
    width: summary(
      errors.flatMap((e) => (e.widthMs === null ? [] : [e.widthMs])),
    ),
  };
}
const external = [];
for (const [name, ids] of Object.entries({
  development: [1, 2, 3, 4],
  control: [101, 102, 103, 104],
})) {
  if (split !== "all" && split !== name) continue;
  for (const id of ids) {
    const { signal, metadata } = loadLudb(
      path.join(root, "tests/reference/ludb/fixtures"),
      name,
      id,
    );
    const reference = fourLeadQrsReference(metadata);
    external.push({
      split: name,
      id,
      excludedReferenceGroups: reference.excluded,
      before: assessExternal(signal, reference, baseline.measure),
      after: assessExternal(signal, reference, current.measure),
    });
  }
}
const synthetic = [];
for (const p of current.PRESETS.filter((p) => p.strategy !== "pending")) {
  const c = current.fromPreset(p),
    s = current.synthesize(c, 10),
    old = baseline.measure(s),
    raw = current.measure(s);
  synthetic.push({
    id: p.id,
    before: compact(old),
    after: compact(raw),
    presented: compact(current.auditMeasurement(s, raw)),
    peaksBefore: old.detectedPeaks.length,
    peaksAfter: raw.detectedPeaks.length,
    auditReference: current.referenceForMeasurement(s, raw).reference,
  });
}
const pooled = {};
for (const name of ["development", "control"]) {
  const group = external.filter((r) => r.split === name);
  if (!group.length) continue;
  pooled[name] = {};
  for (const version of ["before", "after"]) {
    const tp = group.reduce((s, r) => s + r[version].detection.tp, 0),
      fp = group.reduce((s, r) => s + r[version].detection.fp, 0),
      fn = group.reduce((s, r) => s + r[version].detection.fn, 0);
    pooled[name][version] = {
      tp,
      fp,
      fn,
      sensitivity: tp / (tp + fn),
      ppv: tp / (tp + fp),
      annotated: group.reduce((s, r) => s + r[version].annotated, 0),
      delineatedMatches: group.reduce(
        (s, r) => s + r[version].delineatedMatches,
        0,
      ),
      fullyComparableBounds: group.reduce(
        (s, r) => s + r[version].fullyComparableBounds,
        0,
      ),
      ...Object.fromEntries(
        ["onset", "offset", "width"].map((key) => [
          key,
          summary(
            group.flatMap((r) =>
              r[version].errors.flatMap((e) =>
                e[key + "Ms"] === null ? [] : [e[key + "Ms"]],
              ),
            ),
          ),
        ]),
      ),
    };
  }
}
const result = {
  version: "1.2.0",
  baselineCommit: "ad5a53261a7ac170297b32e7709ec158c2ed45c4",
  baselineBundleSha256: createHash("sha256")
    .update(
      await readFile(path.join(root, "tests/reference/baseline-v1.1.mjs")),
    )
    .digest("hex"),
  evaluatedSplit: split,
  method:
    "LUDB 1.0.1; fixed convenience subset; 4-lead annotation aggregation; 150 ms event matching within annotated coverage; no model audit on external records. Not clinical validation.",
  pooled,
  external,
  synthetic,
};
await writeFile(
  path.join(root, "docs", `analysis-validation-${split}.json`),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      split,
      pooled,
      difficult: synthetic.filter((r) =>
        [
          "hyperk",
          "complete_v",
          "aai",
          "vvi",
          "ddd",
          "wpw",
          "bigeminy",
        ].includes(r.id),
      ),
    },
    null,
    2,
  ),
);
