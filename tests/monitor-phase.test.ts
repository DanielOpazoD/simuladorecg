import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { monitorZeroPhase, applyAcquisitionFilter, highpass, biquad } from '../src/engine/filter';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { LEADS } from '../src/engine/types';
import { tWaveSupport } from '../src/engine/constraints';
import { morphologyMetrics } from './support/morphology-metrics';
import { assertIdentities } from '../scripts/lib/noise-stress';

const sinusoid = (fs: number, hz: number, seconds = 32) =>
  Float64Array.from({length:fs*seconds},(_,i)=>3+Math.sin(2*Math.PI*hz*i/fs));
function gainPhase(a: Float64Array, fs: number, hz: number) {
  let si=0,co=0; const lo=fs*8,hi=a.length-fs*8;
  for(let i=lo;i<hi;i++){si+=a[i]*Math.sin(2*Math.PI*hz*i/fs);co+=a[i]*Math.cos(2*Math.PI*hz*i/fs);}
  return { gain:Math.hypot(si,co)*2/(hi-lo), phase:Math.atan2(co,si) };
}
describe('Replayed monitor phase and preservation, no generator reference in filter',()=>{
  it.each([250,500,1000])('compensates both -3dB edges and preserves phase at %s Hz',fs=>{
    for(const hz of [.5,10,40]) {const x=sinusoid(fs,hz);monitorZeroPhase(x,fs);const r=gainPhase(x,fs,hz);
      expect(r.gain).toBeCloseTo(hz===10?1:Math.SQRT1_2,2);expect(Math.abs(r.phase)).toBeLessThan(.002);}
  });
  it('rejects malformed input before mutation',()=>{
    for(const fs of [0,99,Infinity,NaN])expect(()=>monitorZeroPhase(new Float64Array(8),fs)).toThrow();
    expect(()=>monitorZeroPhase(new Float64Array(2),500)).toThrow();
    const x=new Float64Array([1,2,NaN,4]);expect(()=>monitorZeroPhase(x,500)).toThrow();expect(x[0]).toBe(1);
  });
  it('DC input becomes zero; linearity and reversed polarity hold',()=>{
    const a=sinusoid(500,3,10),b=sinusoid(500,15,10),sum=Float64Array.from(a,(v,i)=>v+b[i]);
    monitorZeroPhase(a,500);monitorZeroPhase(b,500);monitorZeroPhase(sum,500);
    expect(Math.max(...sum.map((v,i)=>Math.abs(v-a[i]-b[i])))).toBeLessThan(1e-9);
    const dc=new Float64Array(5000).fill(7);monitorZeroPhase(dc,500);expect(Math.max(...dc.map(Math.abs))).toBeLessThan(1e-10);
  });
  it.each(['off','diagnostic','aggressive'] as const)('leaves historical %s samples exact',mode=>{
    const a=sinusoid(500,3,10),b=new Float64Array(a);applyAcquisitionFilter(a,500,mode);
    if(mode!=='off')highpass(b,500,mode==='diagnostic'?.05:2);
    if(mode==='aggressive')biquad(b,500,40,'lowpass');expect(a).toEqual(b);
  });
  it('agrees with independent SciPy SOS reference on mixed pulses and nonzero DC',()=>{
    const ref=JSON.parse(readFileSync(new URL('./reference/monitor-phase-oracle.json',import.meta.url),'utf8'));
    const x=Float64Array.from({length:ref.n},(_,i)=>2+Math.sin(.021*i)+.2*Math.cos(.73*i)+(i>750&&i<775?1:0));
    monitorZeroPhase(x,ref.fs);for(const [i,v] of ref.checkpoints)expect(x[i]).toBeCloseTo(v,9);
  });
  it.each(['sinus','inferior','lbbb','hyperk','pvc'])('preserves native %s landmarks and signal relationships',id=>{
    const c=fromPreset(presetById(id)!);Object.assign(c,{filter:'off',notch:0,variability:0});
    const clean=synthesize(c,14),mon=synthesize({...c,filter:'monitor'},14);
    expect(mon.events).toEqual(clean.events);assertIdentities(mon);
    for(const kind of new Set(clean.events.beats.map(b=>b.kind))) {
      const b=clean.events.beats.find(b=>b.kind===kind&&b.time>=5&&b.time+b.qt!<12)!;
      const w={baseline:[b.time-.035,b.time-.020] as const,qrs:[b.time,b.time+b.qrs!] as const,t:[b.time+tWaveSupport(c,b.qrs!,b.qt!).start,b.time+b.qt!] as const};
      for(const l of LEADS){const r=morphologyMetrics(clean.leads[l],500,w),m=morphologyMetrics(mon.leads[l],500,w);
        expect(Math.abs(m.j60Mv-r.j60Mv)).toBeLessThan(.025);
        expect(Math.abs(m.qrsPeakToPeakMv-r.qrsPeakToPeakMv)).toBeLessThan(.05);
        expect(Math.abs(m.tAbsoluteAreaMvS-r.tAbsoluteAreaMvS)).toBeLessThan(.004);
        // A nearly biphasic wave can exchange its largest signed peak. Compare
        // BOTH extrema instead of treating that argmax switch as a 0.4mV error.
        const extrema=(a:Float64Array,base:number)=>{const t=a.slice(Math.ceil(w.t[0]*500),Math.floor(w.t[1]*500)+1);return [Math.min(...t)-base,Math.max(...t)-base];};
        const rb=extrema(clean.leads[l],r.baselineMv),mb=extrema(mon.leads[l],m.baselineMv);
        expect(Math.max(...mb.map((v,i)=>Math.abs(v-rb[i])))).toBeLessThan(.04);
      }
    }
  });
  it('provides real future guards without re-timing the visible samples',()=>{
    const c=fromPreset(presetById('sinus')!);c.filter='monitor';
    const short=synthesize(c,10),long=synthesize(c,20);
    for(const l of LEADS)expect(Math.max(...short.leads[l].map((v,i)=>Math.abs(v-long.leads[l][i])))).toBeLessThan(.0005);
  });
});
