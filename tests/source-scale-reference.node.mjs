import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync('docs/evidence/source-scale-reference.json'));
test('all exposed LUDB channels remain quarantined for absolute amplitude calibration',()=>{
 assert.equal(r.ludbScale.recordsEvidence.length,80);assert.equal(r.ludbScale.channels,960);
 assert.equal(r.ludbScale.gainEqualsRangeChannels,960);assert.ok(r.ludbScale.recordsEvidence.every(x=>x.gainEqualsRangeChannels===12&&x.rawEinthovenRms===0));
 assert.equal(r.absoluteAmplitudeReference.eligible,false);assert.equal(r.rescalingApplied,false);assert.equal(r.generatorTuned,false);assert.equal(r.clinicalValidation,false);
 for(const lead of Object.values(r.recordBalancedScaleInvariantMetrics))assert.deepEqual(Object.keys(lead),['tFwhmMs','tSymmetry','tToQrs']);
});
test('window accounting preserves every rejected annotated QRS and J+60 context',()=>{
 const w=r.windowAccounting;assert.equal(w.annotatedQrs,8746);assert.equal(Object.values(w.reasons).reduce((a,b)=>a+b,0),w.annotatedQrs);
 assert.equal(w.reasons['annotated-windows-admitted'],6961);assert.equal(w.j60Contexts['inside-T'],810);
 assert.equal(Object.values(w.j60Contexts).reduce((a,b)=>a+b,0),w.annotatedQrs);
});
test('original PTB-XL calibration control is separate from vendor median beats',()=>{
 const p=r.ptbxlOriginalScale;assert.equal(p.recordsEvidence.length,64);assert.equal(p.summary.physicalSamplesCrosschecked,3840000);assert.equal(p.summary.gainEqualsRangeChannels,0);
 assert.equal(new Set(p.recordsEvidence.map(x=>x.id)).size,64);assert.ok(p.recordsEvidence.every(x=>/^[a-f0-9]{64}$/.test(x.sourceSha256)));
});
