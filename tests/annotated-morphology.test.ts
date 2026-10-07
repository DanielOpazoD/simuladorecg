import {it,expect} from 'vitest';
import {annotatedMorphology,type AnnotatedWave} from './support/annotated-morphology';
const waves: AnnotatedWave[]=[{wave:'QRS',onset:200,peak:230,offset:260},{wave:'T',onset:320,peak:370,offset:440}];
const signal=()=>Float64Array.from({length:1000},(_,i)=>i===230?1:i===240?-.5:i>=320&&i<=440?Math.max(0,.3*(1-Math.abs(i-370)/70)):0);
it('measures original physical units without detector or model metadata',()=>{
 const r=annotatedMorphology(signal(),500,waves);expect(r).toHaveLength(1);expect(r[0].reason).toBeNull();
 expect(r[0].qrsPeakToPeakMv).toBe(1.5);expect(r[0].metrics?.tPeakMv).toBeCloseTo(.3,12);
 expect(r[0].j60Context).toBe('before-T');
});
it('is DC invariant and preserves positive voltage scaling without changing timing',()=>{
 const a=annotatedMorphology(signal(),500,waves)[0].metrics!;
 const b=annotatedMorphology(Float64Array.from(signal(),x=>x*2+7),500,waves)[0].metrics!;
 expect(b.qrsPeakToPeakMv).toBeCloseTo(a.qrsPeakToPeakMv*2,10);expect(b.tPeakMv).toBeCloseTo(a.tPeakMv*2,10);
 expect(b.tSignedAreaMvS).toBeCloseTo(a.tSignedAreaMvS*2,10);expect(b.tFwhmMs).toBeCloseTo(a.tFwhmMs!,9);expect(b.tToQrs).toBeCloseTo(a.tToQrs!,10);
});
it('retains QRS amplitude when T annotation is absent or ambiguous',()=>{
 const missing=annotatedMorphology(signal(),500,[waves[0]])[0];expect(missing.qrsPeakToPeakMv).toBe(1.5);expect(missing.reason).toBe('missing-T-association');expect(missing.metrics).toBeNull();
 const ambiguous=annotatedMorphology(signal(),500,[...waves,{...waves[1],peak:400}])[0];expect(ambiguous.reason).toBe('ambiguous-T-association');
});
it('does not silently place the baseline inside an annotated P wave',()=>{
 const r=annotatedMorphology(signal(),500,[{wave:'P',onset:175,peak:185,offset:195},...waves])[0];
 expect(r.reason).toBe('baseline-overlaps-annotated-wave');expect(r.metrics).toBeNull();expect(r.qrsPeakToPeakMv).toBe(1.5);
});
it('does not imply an ST-only value when J+60 enters T',()=>{
 const r=annotatedMorphology(signal(),500,[waves[0],{...waves[1],onset:275}])[0];expect(r.j60Context).toBe('inside-T');
});
it('keeps incomplete QRS explicit and fails on nonfinite data or malformed annotations',()=>{
 expect(annotatedMorphology(signal(),500,[{...waves[0],onset:null},waves[1]])[0].reason).toBe('incomplete-QRS-window');
 const s=signal();s[5]=NaN;expect(()=>annotatedMorphology(s,500,waves)).toThrow('Nonfinite');
 expect(()=>annotatedMorphology(signal(),500,[...waves,waves[0]])).toThrow('Duplicate');
 expect(()=>annotatedMorphology(signal(),500,[{...waves[0],offset:210}])).toThrow('Reversed');
});
it('leaves samples and source annotations intact',()=>{
 const s=signal(),before=Array.from(s),annotations=structuredClone(waves);annotatedMorphology(s,500,waves);
 expect(Array.from(s)).toEqual(before);expect(waves).toEqual(annotations);
});
