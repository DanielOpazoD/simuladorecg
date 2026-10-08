import {describe,it,expect} from 'vitest';
import {reviewRepeatedTerminalTransition} from '../scripts/lib/repeated-terminal-transition.mjs';
function fixture(){
 const meta={preset:'example',noise:'em',startSeconds:300,snrDb:12,filter:'diagnostic'};
 const analysis={tp:11,fp:7,fn:0,reported:{qrs:112},errors:[{kind:'normal',qrsMs:2,onsetMs:1,offsetMs:3}],metricStatus:{qrs:'usable'},hr:{error:40}};
 const before={rows:[{...meta,analysis}]},after=structuredClone(before),a=after.rows[0].analysis;
 a.fp=4;a.metricStatus.qrs='review';a.hr.error=20;
 const counts={retainedGood:11,retainedBad:0,comparable:11,unreferenced:0,abstentions:0,reported:1,usableGood:11,usableBad:0};
 const strict={status:'fail',failures:[{domain:'quality',metric:'qrs',id:JSON.stringify(['example','em',12,'diagnostic']),before:counts,after:{...counts,usableGood:0}}]};
 return {before,after,strict};
}
describe('False-terminal removal confidence consequence',()=>{
 it('preserves the strict failure and records only unchanged numerical QRS evidence',()=>{
  const f=fixture(),saved=structuredClone(f),r=reviewRepeatedTerminalTransition(f.before,f.after,f.strict);
  expect(r.reviewed).toHaveLength(1);expect(r.strictStatus).toBe('fail');expect(f).toEqual(saved);
 });
 for(const [label,change] of [
  ['numerical QRS change',f=>f.after.rows[0].analysis.reported.qrs++],
  ['moved onset',f=>f.after.rows[0].analysis.errors[0].onsetMs++],
  ['true QRS loss',f=>f.after.rows[0].analysis.tp--],
  ['missed QRS',f=>f.after.rows[0].analysis.fn++],
  ['no removed false candidates',f=>f.after.rows[0].analysis.fp=7],
  ['worse heart rate',f=>f.after.rows[0].analysis.hr.error=41],
  ['new abstention',f=>f.after.rows[0].analysis.metricStatus.qrs='unavailable'],
  ['QT loss',f=>f.strict.failures[0].metric='qt'],
  ['morphological change',f=>f.strict.failures[0].domain='morphology'],
  ['lost retained good values',f=>f.strict.failures[0].after.retainedGood--],
  ['more false usable QRS',f=>f.strict.failures[0].after.usableBad++],
 ])it(`rejects ${label}`,()=>{const f=fixture();change(f);expect(()=>reviewRepeatedTerminalTransition(f.before,f.after,f.strict)).toThrow();});
});
