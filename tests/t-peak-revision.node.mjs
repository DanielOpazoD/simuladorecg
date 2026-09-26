import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPeakOnlyChange,assertPeakOnlyBeats} from '../scripts/lib/t-peak-revision.mjs';
const base=()=>({hr:60,qt:null,evidence:{qt:{status:'unavailable'}},beats:[{peak:1,onset:.95,offset:1.05,tPeak:null,tEnd:null,tTangentEnd:null,qt:null}]});
const good=()=>{const m=base();m.beats[0].tPeak=1.3;return m;};
test('allows only newly visible T evidence without promoting QT',()=>assert.equal(assertPeakOnlyChange(base(),good()),1));
test('accepts exact output and does not mutate either input',()=>{const b=base(),a=good(),copy=structuredClone(a);assertPeakOnlyChange(b,a);assert.deepEqual(a,copy);assert.equal(assertPeakOnlyChange(b,b),0);});
for(const [name,mutate] of Object.entries({
  hr:m=>m.hr=61,qt:m=>m.qt=400,state:m=>m.evidence.qt.status='usable',
  qrs:m=>m.beats[0].onset=.9,end:m=>m.beats[0].tEnd=1.5,
  tangent:m=>m.beats[0].tTangentEnd=1.5,beatQT:m=>m.beats[0].qt=400,
  badPeak:m=>m.beats[0].tPeak=NaN,earlyPeak:m=>m.beats[0].tPeak=1,
  population:m=>m.beats.push({...m.beats[0],peak:2}),
})) test('rejects altered '+name,()=>{const a=good();mutate(a);assert.throws(()=>assertPeakOnlyChange(base(),a));});
test('never replaces a previously reported T peak',()=>{const b=good(),a=good();a.beats[0].tPeak+=.01;assert.throws(()=>assertPeakOnlyBeats(b.beats,a.beats));});
