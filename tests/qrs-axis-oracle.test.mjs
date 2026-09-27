import {describe, it} from 'vitest';
import assert from 'node:assert/strict';
import {assertFinalQrsAxisChange, assertExactSignal} from '../scripts/lib/fidelity-contracts.mjs';
const c = {rhythm:'sinus',conduction:'normal',ectopy:'none',ischemia:'none',overload:'rv_acute',
  electrolyte:'none',qrsAmp:1,axis:60,pAmp:1,tAmp:1,st:0,artifacts:{reversed:false}};
const DOWER = {I:[1,0,0],II:[.5,Math.sqrt(3)/2,0],V1:[.3,.1,.8],V2:[.4,.2,.6],
  V3:[.5,.3,.4],V4:[.6,.4,.2],V5:[.7,.5,-.1],V6:[.8,.6,-.3]};
function sample(config, rotated=false) {
  const a=(rotated?config.axis:20)*Math.PI/180, scale=config.qrsAmp*(config.electrolyte==='lowvoltage'?.38:1);
  const leads=Object.fromEntries(Object.keys(DOWER).map(l=>[l,new Float64Array(64)]));
  for(let i=0;i<64;i++) {
    const q=i<24?Math.sin(Math.PI*i/24)*scale:0;
    const repol=i>40?Math.sin(Math.PI*(i-40)/24)*(config.tAmp||0)*.1:0;
    const v=[q*Math.cos(a)+repol,q*Math.sin(a),q*.2];
    for(const [lead,row] of Object.entries(DOWER)) leads[lead][i]=row.reduce((s,x,j)=>s+x*v[j],0);
  }
  for(const l of ['III','aVR','aVL','aVF'])leads[l]=new Float64Array(64);
  for(let i=0;i<64;i++){const a=leads.I[i],b=leads.II[i];leads.III[i]=b-a;leads.aVR[i]=-(a+b)/2;leads.aVL[i]=a-b/2;leads.aVF[i]=b-a/2;}
  return{fs:64,duration:1,leads,events:{beats:[{time:.1,qrs:.2}]},truth:{axis:config.axis},warnings:[]};
}
const reference={DOWER,synthesize:config=>sample(config),qrsKernels:()=>[{sigma:1,v:[Math.cos(Math.PI/9),Math.sin(Math.PI/9),.2]}]};
const run=(signal,config=c)=>assertFinalQrsAxisChange(reference,sample(config),signal,config);
describe('Final-axis change is independently constrained, not waived',()=>{
 it('accepts only the expected rotation and leaves non-QRS signal intact',()=>{
  const result=run(sample(c,true));assert.ok(result.axisOracleErrorMv<1e-10);assert.ok(result.expectedAxisChangeMv>.01);
 });
 it('rejects preserving the old unaligned trace',()=>assert.throws(()=>run(sample(c)),/Unexpected final-axis sample/));
 it('rejects an extra amplitude change even with a correct axis',()=>{
  assert.throws(()=>run(sample({...c,qrsAmp:1.1},true)),/Unexpected final-axis sample/);
 });
 it('rejects unrelated T or individual-lead changes',()=>{
  const s=sample(c,true);s.leads.V5[48]+=.01;assert.throws(()=>run(s),/Unexpected final-axis sample/);
 });
 it('rejects changed timing, metadata and nonfinite samples',()=>{
  let s=sample(c,true);s.events.beats[0].time=.2;assert.throws(()=>run(s),/calendar changed/);
  s=sample(c,true);s.truth.axis=59;assert.throws(()=>run(s),/metadata changed/);
  s=sample(c,true);s.leads.V1[3]=NaN;assert.throws(()=>run(s),/nonfinite sample/);
 });
 it('rejects cases outside the declared oracle scope',()=>{
  for(const extra of [{rhythm:'vt'},{ischemia:'anterior'},{artifacts:{reversed:true}}])
    assert.throws(()=>run(sample(c,true),{...c,...extra}),/unsupported case/);
 });
 it('is not an empty oracle when the target already equals the old axis',()=>{
  const config={...c,axis:20};assert.throws(()=>run(sample(config,true),config),/must not be vacuous/);
 });
});
describe('Bounded exact-signal failure diagnostics',()=>{
 it('accepts exact copies but reports the first differing sample without a waveform dump',()=>{
  const a=sample(c),b=structuredClone(a);assertExactSignal(a,b);
  b.leads.V1[17]+=.001;
  assert.throws(()=>assertExactSignal(a,b),e=>e.message.includes('sample 17')&&e.message.length<250);
 });
 it('still rejects metadata, missing leads and length changes',()=>{
  let b=sample(c);b.warnings=['unexpected'];assert.throws(()=>assertExactSignal(sample(c),b),/metadata/);
  b=sample(c);delete b.leads.V5;assert.throws(()=>assertExactSignal(sample(c),b),/lead set/);
  b=sample(c);b.leads.V1=new Float64Array(63);assert.throws(()=>assertExactSignal(sample(c),b),/length changed/);
 });
});
