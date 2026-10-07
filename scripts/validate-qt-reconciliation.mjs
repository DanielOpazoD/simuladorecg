/** Paired numerical revision on exposed references; no annotation enters the analyzer. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadLudb, fourLeadWaveReference } from '../tests/reference/ludb/load-ludb.mjs';
import { assessRecord, poolRecords, errors } from './lib/ludb-frozen-baseline.mjs';
const arg = key => { const i = process.argv.indexOf(key); assert.ok(i >= 0 && process.argv[i + 1], key); return resolve(process.argv[i + 1]); };
const out = arg('--output'), baseline = arg('--baseline'); mkdirSync(out, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = {};
const load = async (root, name) => {
  const file = resolve(out, name + '.mjs');
  const result = await build({entryPoints:[resolve(root, 'src/engine/sample-analysis.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile:file});
  assert.ok(!Object.keys(result.metafile.inputs).some(f=>/\/(signal|rhythm|model-audit)\.ts$/.test(f)), 'Model reference leaked into analyzer');
  sourceHashes[name] = Object.fromEntries(Object.keys(result.metafile.inputs).map(f=>[f,hash(readFileSync(f))]));
  return (await import(pathToFileURL(file))).analyzeSamples;
};
const before = await load(baseline,'before'), after = await load(process.cwd(),'after');
const protocol = JSON.parse(readFileSync('tests/reference/ludb-delineation/protocol.json'));
const records = [];
const prospective = process.argv.includes('--prospective');
const prospectiveBytes = prospective ? readFileSync('docs/qt-reconciliation-prospective-protocol.json') : null;
const prospectiveProtocol = prospective ? JSON.parse(prospectiveBytes) : null;
if (prospective) {
 for (const [file,sha] of Object.entries({...prospectiveProtocol.algorithmFiles,...prospectiveProtocol.evaluatorFiles}))
  assert.equal(hash(readFileSync(file)),sha,'Frozen prospective source drift: '+file);
}
const cohorts = prospective ? [['prospective40','qt-reconciliation-v1',arg('--prospective')]] : [
 ['original40','expansion',arg('--original')],['calibration40','delineation-calibration',arg('--calibration')],
];
for (const [cohort, split, root] of cohorts) {
  const manifest = JSON.parse(readFileSync(resolve(root,'manifest.json')));
  if (prospective) {
   assert.equal(manifest.protocolSha256,hash(prospectiveBytes));
   assert.deepEqual(manifest.records.map(r=>+r.record).sort((a,b)=>a-b),prospectiveProtocol.cohort.records);
   assert.ok(manifest.records.every(r=>r.split===split));
  }
  for (const entry of manifest.records) {
    const {signal, metadata} = loadLudb(root, split, +entry.record);
    const physical = () => hash(Buffer.concat(Object.values(signal.leads).map(x => Buffer.from(x.buffer,x.byteOffset,x.byteLength))));
    const digest = physical(), a = before(signal), b = after(signal);
    assert.equal(physical(), digest, 'Samples changed');
    assert.deepEqual(a.detectedPeaks, b.detectedPeaks, 'Ventricular detection changed');
    assert.equal(a.beats.length, b.beats.length, 'Beat population changed');
    for (let i=0;i<b.beats.length;i++) {
      const current = structuredClone(b.beats[i]), revision = current.terminalRevision;
      if (revision) {
        assert.equal(revision.previousEnd, a.beats[i].tEnd);
        assert.equal(revision.previousQt, a.beats[i].qt);
        assert.equal(revision.previousTangentEnd, a.beats[i].tTangentEnd);
        assert.equal(current.tEnd, revision.areaEnd);
        assert.ok(Math.abs(current.qt - (current.tEnd-current.onset)*1000)<1e-8);
        current.tEnd=revision.previousEnd; current.qt=revision.previousQt;
        current.tTangentEnd=revision.previousTangentEnd; delete current.terminalRevision;
      }
      assert.deepEqual(current,a.beats[i], 'Nonterminal landmark changed');
    }
    for (const metric of ['hr','pr','qrs','axis','pAxis','tAxis','rr']) assert.equal(b[metric],a[metric], metric+' changed');
    for (const metric of ['hr','pr','qrs','axis']) assert.deepEqual(b.evidence[metric],a.evidence[metric], metric+' confidence changed');
    const revised = b.beats.filter(x=>x.terminalRevision).length;
    if (revised && b.qt!==null && b.evidence.qt.status==='usable') {
      assert.equal(a.evidence.qt.status,'usable','Numerical repair must not promote clinical confidence');
      assert.ok(a.qt!==null && Math.abs(a.qt-b.qt)<=1000/signal.fs+1e-8,'Usable summary changed beyond one sample');
    }
    const refs = Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
    records.push({id:+entry.record,cohort,physicalSamplesSha256:digest,revised,
      measurements:{before:a,after:b},
      before:assessRecord(signal,refs,()=>a,protocol),after:assessRecord(signal,refs,()=>b,protocol)});
  }
}
const summary = Object.fromEntries(['before','after'].map(side=>[side,poolRecords(records.map(r=>r[side]))]));
const paired = records.filter(r=>r.before.intervals.qt.errorMs!==null && r.after.intervals.qt.errorMs!==null);
const newValues = records.filter(r=>r.before.intervals.qt.errorMs===null && r.after.intervals.qt.errorMs!==null);
const comparison = {
  samePopulation: { before: errors(paired.map(r=>r.before.intervals.qt.errorMs)), after: errors(paired.map(r=>r.after.intervals.qt.errorMs)) },
  newlyAvailable: errors(newValues.map(r=>r.after.intervals.qt.errorMs)),
  worseRecords: paired.filter(r=>Math.abs(r.after.intervals.qt.errorMs)>Math.abs(r.before.intervals.qt.errorMs)+1e-8).map(r=>({id:r.id,cohort:r.cohort,before:r.before.intervals.qt.errorMs,after:r.after.intervals.qt.errorMs})),
};
const prospectiveOutcome = !prospective ? null : {
 pairedImproved: comparison.samePopulation.after.n>=prospectiveProtocol.engineeringTargets.minimumPaired && comparison.samePopulation.after.maeMs<=comparison.samePopulation.before.maeMs,
 newCoverage: summary.after.intervals.qt.numericWithReference>=summary.before.intervals.qt.numericWithReference,
 qtErrorTarget: summary.after.intervals.qt.errors.maeMs<=prospectiveProtocol.engineeringTargets.maximumMaeMs && summary.after.intervals.qt.errors.p95AbsMs<=prospectiveProtocol.engineeringTargets.maximumP95Ms && summary.after.intervals.qt.errors.maxAbsMs<=prospectiveProtocol.engineeringTargets.maximumErrorMs,
};
const report={schemaVersion:1,comparison,sourceHashes,prospectiveOutcome,baselineCommit:execFileSync('git',['-C',baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
 role:prospective ? 'First evaluation of the prospectively frozen remaining LUDB cohort; exposed after execution, not independent clinical validation' : 'Paired, already exposed development regression; not clinical validation or an untouched holdout',clinicalValidation:false,records,summary};
writeFileSync(resolve(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({records:records.length,qtBefore:summary.before.intervals.qt,qtAfter:summary.after.intervals.qt,comparison}));

if (prospective) assert.ok(Object.values(prospectiveOutcome).every(Boolean), "Prospective engineering target failed; retain report and do not retune on these records");
