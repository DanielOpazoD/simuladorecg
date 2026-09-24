import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

/** Load the immutable source samples in physical mV; no synthetic case/truth. */
export function loadLudb(root, split, record) {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const entry = manifest.records.find((item) => item.record === String(record) && item.split === split);
  if (!entry) throw new Error(`Record outside frozen LUDB split: ${split}/${record}`);
  const metadataBytes = readFileSync(resolve(root, entry.metadata));
  if (createHash("sha256").update(metadataBytes).digest("hex") !== entry.metadataSha256)
    throw new Error(`LUDB metadata checksum mismatch: ${record}`);
  const meta = JSON.parse(metadataBytes.toString("utf8"));
  const bytes = readFileSync(resolve(root, split, meta.signalFile));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const source = meta.sourceFiles.find((file) => file.path === meta.signalFile);
  if (digest !== source.sha256) throw new Error(`LUDB source checksum mismatch: ${record}`);
  if (bytes.length !== meta.samples * meta.channels.length * 2) throw new Error("Truncated LUDB signal");
  const leads = Object.fromEntries(meta.channels.map(({ lead }) => [lead, new Float32Array(meta.samples)]));
  for (let i = 0; i < meta.samples; i++) {
    for (let channel = 0; channel < meta.channels.length; channel++) {
      const { lead, adcGain, baseline } = meta.channels[channel];
      leads[lead][i] = (bytes.readInt16LE((i * meta.channels.length + channel) * 2) - baseline) / adcGain;
    }
  }
  return { signal: { fs: meta.fs, leads }, metadata: meta };
}

const median = (xs) => {
  const x = [...xs].sort((a, b) => a - b), mid = Math.floor(x.length / 2);
  return x.length % 2 ? x[mid] : (x[mid - 1] + x[mid]) / 2;
};

/**
 * Evaluation-specific aggregation of four separately annotated leads.
 * This is NOT an original global LUDB annotation or clinical adjudication.
 * II provides beat identities; nearest unused QRS peak within 150 ms in each
 * of I / V1 / V5 identifies the same beat. Only complete four-lead matches
 * are returned. Endpoint min/max reflects this detector's four input leads.
 * Missing source boundaries remain null, while QRS event identity is retained.
 */
export function fourLeadQrsReference(meta) {
  const names = ["I", "II", "V1", "V5"];
  const byLead = Object.fromEntries(names.map((lead) => [lead, meta.annotations[lead].filter((x) => x.wave === "QRS")]));
  const used = Object.fromEntries(names.map((lead) => [lead, new Set()]));
  const result = [], excluded = [];
  for (const anchor of byLead.II) {
    const group = { II: anchor }, candidateIndices = {};
    for (const lead of ["I", "V1", "V5"]) {
      const candidates = byLead[lead].map((wave, index) => ({ wave, index }))
        .filter(({ wave, index }) => !used[lead].has(index) && Math.abs(wave.peak - anchor.peak) <= 0.15 * meta.fs)
        .sort((a, b) => Math.abs(a.wave.peak - anchor.peak) - Math.abs(b.wave.peak - anchor.peak));
      if (candidates[0]) {
        group[lead] = candidates[0].wave;
        candidateIndices[lead] = candidates[0].index;
      }
    }
    if (Object.keys(group).length !== 4) {
      excluded.push({ anchorPeak: anchor.peak / meta.fs, reason: "incomplete four-lead QRS annotation match" });
      continue;
    }
    for (const [lead, index] of Object.entries(candidateIndices)) used[lead].add(index);
    const waves = Object.values(group);
    const completeOnsets = waves.every((wave) => wave.onset !== null);
    const completeOffsets = waves.every((wave) => wave.offset !== null);
    result.push({
      peak: median(waves.map((wave) => wave.peak)) / meta.fs,
      qrsOnset: completeOnsets ? Math.min(...waves.map((wave) => wave.onset)) / meta.fs : null,
      qrsOffset: completeOffsets ? Math.max(...waves.map((wave) => wave.offset)) / meta.fs : null,
      boundaryCoverage: { completeOnsets, completeOffsets },
      originalByLead: group,
    });
  }
  return { beats: result, excluded };
}

/** Maximum-cardinality, minimum-error ordered one-to-one time matching. */
export function matchQrsEvents(reference, detected, tolerance = 0.15) {
  const a = [...reference].sort((a, b) => a - b), b = [...detected].sort((a, b) => a - b);
  const dp = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => ({ count: 0, error: 0, pairs: [] })));
  const better = (x, y) => x.count > y.count || (x.count === y.count && x.error <= y.error) ? x : y;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let best = better(dp[i - 1][j], dp[i][j - 1]);
      const error = Math.abs(a[i - 1] - b[j - 1]);
      if (error <= tolerance) {
        const prev = dp[i - 1][j - 1];
        best = better(best, { count: prev.count + 1, error: prev.error + error, pairs: [...prev.pairs, { reference: a[i - 1], detected: b[j - 1], errorMs: (b[j - 1] - a[i - 1]) * 1000 }] });
      }
      dp[i][j] = best;
    }
  }
  const matched = dp[a.length][b.length];
  return {
    tp: matched.count, fn: a.length - matched.count, fp: b.length - matched.count,
    sensitivity: a.length ? matched.count / a.length : null,
    ppv: b.length ? matched.count / b.length : null,
    pairs: matched.pairs,
  };
}
