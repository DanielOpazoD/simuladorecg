// Descriptive, post-evaluation check of the changing delineation population.
// Does not rerun or tune the frozen detector or replace the primary benchmark.
import { readFile, writeFile } from "node:fs/promises";

const source = "docs/analysis-validation-all.json";
const report = JSON.parse(await readFile(source, "utf8"));
const meanAbs = (a) => a.length
  ? a.reduce((sum, value) => sum + Math.abs(value), 0) / a.length
  : null;
const splits = {};
for (const split of ["development", "control"]) {
  splits[split] = {};
  for (const metric of ["onsetMs", "offsetMs", "widthMs"]) {
    const before = [], after = [], added = [], lost = [];
    for (const record of report.external.filter((r) => r.split === split)) {
      const oldErrors = new Map(record.before.errors.map((r) => [r.peak, r[metric]]));
      const newErrors = new Map(record.after.errors.map((r) => [r.peak, r[metric]]));
      for (const peak of new Set([...oldErrors.keys(), ...newErrors.keys()])) {
        const a = oldErrors.get(peak), b = newErrors.get(peak);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          before.push(a);
          after.push(b);
        } else if (Number.isFinite(b)) added.push(b);
        else if (Number.isFinite(a)) lost.push(a);
      }
    }
    splits[split][metric] = {
      common: { n: before.length, beforeMaeMs: meanAbs(before), afterMaeMs: meanAbs(after) },
      added: { n: added.length, maeMs: meanAbs(added) },
      lost: { n: lost.length, maeMs: meanAbs(lost) },
    };
  }
}
const result = {
  version: report.version,
  source,
  method: "Post-evaluation descriptive analysis, matched by record and annotated QRS peak. Primary protocol and detector remain unchanged; no inferential or clinical accuracy claim.",
  splits,
};
await writeFile("docs/analysis-paired-comparison.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
