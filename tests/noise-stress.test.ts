import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {injectNoise,deriveLimbs,assertIdentities,filterSamples,cropSamples,compareMorphology,assessPreservation,retainedEstimate,waveformRmse,ALL_NOISE_LEADS,INDEPENDENT_NOISE_LEADS} from '../scripts/lib/noise-stress';
import {morphologyMetrics} from './support/morphology-metrics';
import {synthesize} from '../src/engine/signal';
import {measure} from '../src/engine/measure';
import {fromPreset,presetById} from '../src/presets/catalog';
const p=JSON.parse(readFileSync('benchmarks/noise-stress/protocol.json','utf8'));
const n=7000,fs=500,w={baseline:[5,5.1] as const,qrs:[5.2,5.3] as const,t:[5.4,5.8] as const};
const clean=()=>deriveLimbs({fs,leads:Object.fromEntries(INDEPENDENT_NOISE_LEADS.map((l,j)=>[l,Float64Array.from({length:n},(_,i)=>Math.sin(i*.08)*(1+j*.1))]))});
const channels=()=>[Float64Array.from({length:n},(_,i)=>Math.sin(i*.001)+Math.sin(i*2)),Float64Array.from({length:n},(_,i)=>Math.cos(i*.04))];
describe('Calibrated noise independent contracts',()=>{
  it.each(p.snrDb as number[])('achieves aggregate centered SNR %s dB without changing source',snr=>{
    const s=clean(),before=s.leads.I.slice(),a=injectNoise(s,channels(),p.mapping,snr,p.cropSeconds);
    expect(a.achievedDb).toBeCloseTo(snr,6);expect(s.leads.I).toEqual(before);assertIdentities(a.signal);
  });
  it('no noise means exactly the same twelve signals',()=>{
    const s=clean(),a=injectNoise(s,channels(),p.mapping,null,p.cropSeconds);
    for(const l of ALL_NOISE_LEADS)expect(a.signal.leads[l]).toEqual(s.leads[l]);expect(a.scaleMvPerCount).toBe(0);
  });
  it('calibration is deterministic and a common gain, not leadwise normalization',()=>{
    const a=injectNoise(clean(),channels(),p.mapping,6,p.cropSeconds),b=injectNoise(clean(),channels(),p.mapping,6,p.cropSeconds);
    expect(a).toEqual(b);expect(a.perLeadDb.I).not.toBeCloseTo(a.perLeadDb.II!,2);
  });
  it('rejects undefined SNR, bad samples, missing mapping and invalid crop',()=>{
    expect(()=>injectNoise(clean(),channels().map(x=>x.fill(0)),p.mapping,6,p.cropSeconds)).toThrow();
    const a=channels();a[0][1]=NaN;expect(()=>injectNoise(clean(),a,p.mapping,6,p.cropSeconds)).toThrow();
    expect(()=>injectNoise(clean(),channels(),{},6,p.cropSeconds)).toThrow();
    expect(()=>injectNoise(clean(),channels(),p.mapping,Infinity,p.cropSeconds)).toThrow();
    expect(()=>cropSamples(clean(),[-1,5])).toThrow();
  });
  it('filters copy input and preserve electrical identities; off is exact',()=>{
    const s=clean(),before=s.leads.I.slice();
    for(const mode of ['off','diagnostic','monitor','aggressive'] as const)assertIdentities(filterSamples(s,mode));
    expect(s.leads.I).toEqual(before);expect(filterSamples(s,'off').leads).toEqual(s.leads);
  });
  it('rejects corruption in either sign of a limb identity',()=>{
    for(const sign of [-1,1]){const s=clean();s.leads.III[100]+=sign*.1;expect(()=>assertIdentities(s)).toThrow();}
  });
  it('reports zero difference for identical samples',()=>{
    const s=clean(),r=compareMorphology(s,s,w,p.reviewThresholds);
    expect(Object.values(r).every(x=>!x.requiresReview)).toBe(true);expect(waveformRmse(s,s,[4,14])).toBe(0);
  });
  it('catches erased T, altered J and attenuated QRS independently',()=>{
    const a=Float64Array.from({length:n},(_,i)=>{const t=i/fs;return t>=5.2&&t<=5.3?Math.sin((t-5.2)/.1*Math.PI):t>=5.4&&t<=5.8?.3*Math.sin((t-5.4)/.4*Math.PI):0;});
    const ref=morphologyMetrics(a,fs,w);
    for(const region of ['t','qrs','j']){const changed=a.slice();
      if(region==='t')changed.fill(0,2700,2901);
      if(region==='qrs')for(let i=2600;i<=2650;i++)changed[i]*=.2;
      if(region==='j')changed[2650]+=.1;
      const result=assessPreservation(ref,morphologyMetrics(changed,fs,w),p.reviewThresholds);
      expect(result.requiresReview).toBe(true);
      if(region==='t')expect(result.exceeded.tArea).toBe(true);
      if(region==='qrs')expect(result.exceeded.qrs).toBe(true);
      if(region==='j')expect(result.exceeded.j).toBe(true);
    }
  });
  it('missing estimate is abstention, not zero error; usable can still be wrong',()=>{
    expect(retainedEstimate(null,'unavailable',90,20)).toMatchObject({retained:false,error:null});
    expect(retainedEstimate(180,'usable',90,20)).toMatchObject({retained:true,error:90,exceedsReviewLimit:true});
    expect(()=>retainedEstimate(NaN,'usable',90,20)).toThrow();
  });
  it('requires valid windows instead of replacing nonfinite morphology',()=>{
    const s=clean();s.leads.I[2600]=NaN;expect(()=>compareMorphology(s,s,w,p.reviewThresholds)).toThrow();
  });
  it('raw analyzer operates without reading truth or events, and abstains on flat input',()=>{
    const s=clean();for(const l of ALL_NOISE_LEADS)s.leads[l].fill(0);
    const guarded={...s,get truth(){throw Error('leak')},get events(){throw Error('leak')}};
    const m=measure(guarded);expect(m.hr).toBeNull();expect(m.qrs).toBeNull();expect(m.qt).toBeNull();
  });
  it('native diagnostic preserves inferior ST within the existing 0.02mV review contract',()=>{
    const c=fromPreset(presetById('inferior')!);c.variability=0;c.filter='off';
    const a=synthesize(c,14),b=synthesize({...c,filter:'diagnostic'},14),beat=a.events.beats.find(b=>b.time>6)!;
    const on=beat.time,off=on+beat.qrs!,end=on+beat.qt!;
    const windows={baseline:[on-.035,on-.020] as const,qrs:[on,off] as const,t:[end-.16,end] as const};
    const r=compareMorphology(a,b,windows,p.reviewThresholds);
    for(const l of ['II','III','aVF','I','aVL']){expect(Math.abs(r[l].errors.jMv)).toBeLessThan(.02);expect(Math.abs(r[l].errors.j60Mv)).toBeLessThan(.02);}
    expect(a.events).toEqual(b.events);
  });
});
