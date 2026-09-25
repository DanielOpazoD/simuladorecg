import {describe,it,expect} from 'vitest';
import {morphologyMetrics,sampleAt} from './support/morphology-metrics';
import {vendorWindows,sampledMorphology,linearSummary,assertSampleOnlyImports,MORPHOLOGY_LEADS} from '../scripts/lib/ptbxl-morphology.mjs';
function signal(){const leads=Object.fromEntries(MORPHOLOGY_LEADS.map(l=>[l,new Float64Array(600)]));
 for(const a of Object.values(leads)){for(let i=100;i<=140;i++)a[i]=i<=120?(i-100)/20:(140-i)/20;for(let i=180;i<=260;i++)a[i]=.4*(1-Math.abs(i-220)/40);}
 return {fs:500,leads};}
const f={QRS_On_Global:200,QRS_Off_Global:280,T_On_Global:360,T_Off_Global:520};
describe('PTB-XL+ descriptive windows and sample metrics',()=>{
 it('rejects analyzer imports but allows shared arithmetic',()=>{
  expect(()=>assertSampleOnlyImports(['src/engine/analysis/statistics.ts'])).not.toThrow();
  for(const file of ['src/engine/measure.ts','src/engine/analysis/model-audit.ts','src/engine/analysis/ventricular-candidates.ts']) expect(()=>assertSampleOnlyImports([file])).toThrow();
 });
 it('uses ms once, not doubled vendor indices',()=>expect(vendorWindows(f).qrs).toEqual([.2,.28]));
 it('never infers absent T onset',()=>expect(()=>vendorWindows({...f,T_On_Global:null})).toThrow());
 it('rejects unordered windows',()=>expect(()=>vendorWindows({...f,T_On_Global:240})).toThrow());
 it('measures known triangular signals and preserves arrays',()=>{
  const s=signal(),copy=s.leads.II.slice(),r=sampledMorphology(s,vendorWindows(f),morphologyMetrics,sampleAt);
  expect(r.leads.II.qrsPositivePeakMv).toBeCloseTo(1,12);expect(r.leads.II.tPeakMv).toBeCloseTo(.4,12);
  expect(r.leads.V5.tFwhmMs).toBeCloseTo(80,10);expect(r.qrsDurationMs).toBeCloseTo(80,10);
  expect(s.leads.II).toEqual(copy);
 });
 it('abstains per lead for invalid samples',()=>{const s=signal();s.leads.II[200]=NaN;
  const r=sampledMorphology(s,vendorWindows(f),morphologyMetrics,sampleAt);expect(r.leads.II).toBeNull();expect(r.leads.V5).not.toBeNull();expect(r.qrsAreaAxisDeg).toBeNull();});
 it('reports missing values in denominator',()=>expect(linearSummary([1,3,null,NaN])).toEqual({total:4,n:2,missing:2,p05:1.1,median:2,p95:2.9}));
 it('detects an inverted waveform, not just its checksum',()=>{const s=signal();for(let i=0;i<600;i++)s.leads.V5[i]*=-1;
  const r=sampledMorphology(s,vendorWindows(f),morphologyMetrics,sampleAt);expect(r.leads.V5.tPeakMv).toBeCloseTo(-.4,12);});
 it('has no truth access',()=>{const s=signal();Object.defineProperty(s,'truth',{get(){throw Error('oracle leak')}});Object.defineProperty(s,'events',{get(){throw Error('oracle leak')}});
 expect(()=>sampledMorphology(s,vendorWindows(f),morphologyMetrics,sampleAt)).not.toThrow();});
});
