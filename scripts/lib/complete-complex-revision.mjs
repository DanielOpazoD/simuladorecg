/** Historical contracts keep their exact numerical predecessor. New source-only
 * interval evidence is compared separately; no frozen protocol is rewritten. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {relative} from 'node:path';
import {createHash} from 'node:crypto';
import {matchQrsEvents} from '../../tests/reference/ludb/load-ludb.mjs';
export const COMPLETE_COMPLEX_REVISION=Object.freeze({
 baselineCommit:'17c2a59d4663a4d06470119813cc0b7a6bfa9315',
 files:Object.freeze({
  'src/engine/measure.ts':'3d9cc42fb832aa371222b7e5e70df0e83454f252d36678f0eb5131d3f406e5f0',
  'src/engine/analysis/ventricular-candidates.ts':'1580091742ec094cfe196a6a137ff508053f5ae1daaa09373dd0607b77a5c32e',
 }),
});
export function preCompleteComplexPlugin(root){return{name:'exact-pre-complete-complex',setup(builder){
 builder.onLoad({filter:/\/(measure|ventricular-candidates)\.ts$/},args=>{
  const file=relative(root,args.path),expected=COMPLETE_COMPLEX_REVISION.files[file];assert.ok(expected,'Unexpected historical dependency');
  const bytes=execFileSync('git',['show',COMPLETE_COMPLEX_REVISION.baselineCommit+':'+file]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'Historical source changed');
  return{contents:bytes.toString(),loader:'ts'};
 });
}};}
/** Evaluator only. The analyzer never receives these event references. Existing
 * 5 bpm / 20 ms / 30 ms screens are engineering flags, not clinical tolerances. */
export function assertCompleteComplexMeasurements(before,after,events){
 const reference=events.filter(b=>b.time+b.qrs/2>=.2&&b.time+b.qrs/2<9.8);
 const hr=reference.length>=2?60*(reference.length-1)/(reference.at(-1).time-reference[0].time):null;
 const evaluate=m=>{
  const matched=matchQrsEvents(reference.map(b=>b.time+b.qrs/2),m.detectedPeaks.filter(t=>t>=.2&&t<9.8),.15);
  const errors=matched.pairs.flatMap(p=>{const e=reference.find(b=>b.time+b.qrs/2===p.reference),b=m.beats.find(b=>b.peak===p.detected);return b?[{qrs:b.qrs-e.qrs*1000,qt:b.qt===null?null:b.qt-e.qt*1000}]:[];});
  for(const b of m.beats){assert.ok(Number.isFinite(b.onset)&&Number.isFinite(b.offset)&&b.offset>b.onset);assert.ok(Math.abs(b.qrs-(b.offset-b.onset)*1000)<1e-7);}
  return{fn:matched.fn,fp:matched.fp,badHr:m.evidence.hr.status==='usable'&&hr!==null&&(m.hr===null||Math.abs(m.hr-hr)>5),
   badQrs:m.evidence.qrs.status==='usable'?errors.filter(e=>Math.abs(e.qrs)>20).length:0,
   badQt:m.evidence.qt.status==='usable'?errors.filter(e=>e.qt!==null&&Math.abs(e.qt)>30).length:0};
 };
 const prior=evaluate(before),next=evaluate(after);
 assert.ok(next.fn<=prior.fn,'New missed QRS in matched repolarization samples');
 assert.ok(!next.badHr||prior.badHr,'New falsely usable HR in matched samples');
 assert.ok(next.badQrs<=prior.badQrs,'New usable QRS error in matched samples');
 assert.ok(next.badQt<=prior.badQt,'New usable QT error in matched samples');
 return{before:prior,after:next};
}
