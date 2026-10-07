import {OPPOSED_CYCLE_REVISION} from './opposed-cycle-revision.mjs';
import {relative} from 'node:path';
import {execFileSync} from 'node:child_process';
/** Exact numerical revision identity. Historical manifests are never rewritten.
 * Evidence is the paired QRS/T matrix, annotated calibration and strict noise gate;
 * a hash only identifies those bytes and is not evidence of clinical accuracy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const QRS_T_REVISION=Object.freeze({
 baselineCommit:'ca2aa852d2fe5c6affdfdc31db2b9160211944f9',
 evaluationBaselineCommit:'63f32b03921158337052e7068abcb6e72ec72f79',
 iteration:'direction-invariant-covariance-v3-terminal-consensus-v1',
 files:Object.freeze({
  'src/engine/analysis/statistics.ts':Object.freeze({before:'c8c20531ca3eb5483529d426357360ac1381ac934a3c3ef3d5d3cd21023e5a4b',after:'bdc0b500a3a3883df095054ca9a8298b4c8ea7df7bb336fea01cf266d875e8a6'}),
  'src/engine/analysis/impulses.ts':Object.freeze({before:'362814239fb6dcae06025cb065c6f6dfef08bb5341cabaef01c58d8227222cb1',after:'4ed73f13c6b8dc7460c34b9dd37ad5c5561511ea0f6585d30c6b1585ea14ebe2'}),
  // Null-axis support is reviewed with the primitive, not a filename exemption.
  'src/engine/measurement-support.ts':Object.freeze({before:'1b6df1bf5c5386a9bdd237109b43a49879fd10c93a4b43eceeb7acdddcf7ba33',after:'dc5947112104ef130d0ade4eb500deb5be3bc1747dd055f14bef5a590e7bf2e4'}),
  'src/engine/analysis/impulse-confidence.ts':Object.freeze({before:'20a40b8da435c503ea4044919022e5015cae53b818ab283feb158bfeb83055ef',after:'c6b5c4a06cf5c65bacf325e8c77517613ee4427af2075b10575898e03dcee62d'}),
  // Sample-preserving projection refactor. Historical analyzers restore these
  // exact predecessors too; see docs/frontal-projection-contract.md for paired evidence.
  'src/engine/leads.ts':Object.freeze({before:'d67c47738647a8aa47f98f01de045ab7381a842007c7d5fa3562f570dc711c16',after:'ab4a73f2345e133cbbe80757d08c1c64f4c54894f1ca521b82eff7041d386706'}),
  'src/engine/lead-registry.ts':Object.freeze({before:'21b9ad7996fc2813156e51d87488f48fae52085ea6935091396e7226589367d3',after:'7f4fe698cd38931a47d41b99e005ca30f642b05553e4137869bda5f99a8990e3'}),
  'src/engine/measure.ts':Object.freeze({before:'ceaeef83b459bbb114dc8a9457af7d43d804c14a8cb8107fc2b250faf391d61e',after:'3d9cc42fb832aa371222b7e5e70df0e83454f252d36678f0eb5131d3f406e5f0'}),
  'src/engine/analysis/ventricular-candidates.ts':Object.freeze({before:'0c7d0abb1834fd9407ca9fdd85c735b7794bcaf933d911f13222039ab4c0bec4',after:'7e1bdccec01a09fcaa4abb73e6c063ca53fbe0128758edae6c6118347c49ed42'}),
 }),
});
export const TERMINAL_SOURCE_REVISION=Object.freeze({'src/engine/terminal-delineation.ts':'5b8f04b5d57a333cdeb4f1b1cd381f8bbc417584a75ba740bfa27543edff8c70'});
export function assertReviewedQrsTFile(file,source){
 if(file==='src/engine/measure.ts')for(const [path,sha]of Object.entries(TERMINAL_SOURCE_REVISION))
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),sha,'Unreviewed terminal estimator: '+path);
 const entry=QRS_T_REVISION.files[file];assert.ok(entry,'Unreviewed analyzer file');
 assert.equal(createHash('sha256').update(source).digest('hex'),entry.after,'Unreviewed QRS/T implementation: '+file);
}

/** Morphology landmarks are retained; only the ventricular train and summaries
 * can change. This structural contract supplements, not replaces, annotated tests. */
export function assertQrsTRefinement(before,after,{terminalReplacement=false}={}){
 assert.ok(after.detectedPeaks.every(p=>before.detectedPeaks.includes(p)),'Refinement introduced/moved a candidate');
 for(const beat of after.beats){
  const original=before.beats.find(b=>b.peak===beat.peak);assert.ok(original,'Refinement invented a delineation');
  const index=after.detectedPeaks.indexOf(beat.peak);assert.ok(index>0);
  assert.ok(Math.abs(beat.rr-(beat.peak-after.detectedPeaks[index-1]))<1e-10,'Beat RR differs from retained ventricular train');
  const next={...beat,rr:original.rr},prior={...original};
  if(terminalReplacement){
   if(beat.qt!==null&&beat.qt!==undefined){assert.ok(Number.isFinite(beat.tEnd)&&beat.tEnd>beat.tPeak);assert.ok(Math.abs(beat.qt-(beat.tEnd-beat.onset)*1000)<1e-8);}
   for(const key of ['qt','tPeak','tEnd','tTangentEnd']){delete next[key];delete prior[key];}
  }
  assert.deepEqual(next,prior,'Refinement moved a nonterminal morphology boundary');
 }
 if(after.hr!==null&&after.detectedPeaks.length>=2){
  const p=after.detectedPeaks,expected=60*(p.length-1)/(p.at(-1)-p[0]);
  assert.ok(Math.abs(after.hr-expected)<1e-8,'Rate does not follow retained sample candidates');
 }
}

/** Before/after errors belong to their respective numerical estimates. */
export const summarizeRateRevision=arr=>({scenarios:arr.length,beforeUsable:arr.filter(r=>r.before==='usable').length,
    afterUsable:arr.filter(r=>r.after==='usable').length,
    usableBeyondBefore:arr.filter(r=>r.before==='usable'&&r.beforeBeyondReview).length,
    usableBeyondAfter:arr.filter(r=>r.after==='usable'&&r.beyondReview).length,
    newlyReviewed:arr.filter(r=>r.before==='usable'&&r.after==='review').length,
    accurateNewReviews:arr.filter(r=>r.before==='usable'&&r.after==='review'&&r.beyondReview===false).length,
    rawBeyond:arr.filter(r=>r.beyondReview).length,unavailable:arr.filter(r=>r.hr===null).length});

/** Restore exact numerical and confidence predecessor bytes for historical assertions.
 * Actual revised quality is evaluated separately on unchanged samples. */
export function preQrsTNumericsPlugin(root){
 return {name:'exact-pre-qrs-t-numerics',setup(builder){
  builder.onLoad({filter:/\/(measure|statistics|impulses|measurement-support|ventricular-candidates|alternating-confidence|impulse-confidence|leads|lead-registry)\.ts$/},args=>{
   const file=relative(root,args.path),entry=file===OPPOSED_CYCLE_REVISION.file?OPPOSED_CYCLE_REVISION:QRS_T_REVISION.files[file];assert.ok(entry);
   const bytes=execFileSync('git',['show',QRS_T_REVISION.baselineCommit+':'+file]);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.before,'Unreviewed numerical predecessor');
   return {contents:bytes.toString(),loader:'ts'};
  });
 }};
}
