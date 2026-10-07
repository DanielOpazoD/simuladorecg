import {test} from 'node:test';import assert from 'node:assert/strict';
import {sourceScaleEvidence} from '../scripts/lib/source-scale.mjs';
const d={I:[1,4,2],II:[3,7,5],III:[2,3,3]};
const c=gains=>Object.fromEntries(Object.keys(d).map((l,i)=>[l,{gain:gains[i],baseline:0}]));
test('identical WFDB arithmetic can still encode per-lead normalization',()=>{
 const r=sourceScaleEvidence(d,c([3,4,1]));assert.equal(r.rawEinthovenRms,0);
 assert.equal(r.allChannelsGainEqualsRange,true);assert.equal(r.gainEqualsRangeChannels,3);
 assert.ok(r.declaredMvEinthovenRms>0);assert.equal(r.screenAloneEstablishesCalibration,false);
 assert.equal(r.rescalingApplied,false);assert.ok(Object.values(r.leads).every(l=>l.declaredMvRange===1));
});
test('common documented gain preserves identity but does not self-certify calibration',()=>{
 const r=sourceScaleEvidence(d,c([1000,1000,1000]));assert.equal(r.allChannelsGainEqualsRange,false);
 assert.ok(r.declaredMvEinthovenRms<1e-15);assert.equal(r.screenAloneEstablishesCalibration,false);
});
test('data and calibration remain unchanged',()=>{
 const values=structuredClone(d),calibration=c([3,4,1]),before=structuredClone(calibration);
 sourceScaleEvidence(values,calibration);assert.deepEqual(values,d);assert.deepEqual(calibration,before);
});
test('malformed calibration and nonfinite samples cannot become valid evidence',()=>{
 assert.throws(()=>sourceScaleEvidence(d,c([0,4,1])));assert.throws(()=>sourceScaleEvidence({...d,I:[NaN,4,2]},c([3,4,1])));
 assert.throws(()=>sourceScaleEvidence({...d,III:[2,3]},c([3,4,1])));
});
