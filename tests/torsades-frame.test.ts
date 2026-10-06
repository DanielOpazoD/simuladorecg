import {describe,it,expect} from 'vitest';
import {torsadesFrame} from '../src/engine/torsades-frame';
import type {Vec} from '../src/engine/leads';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {LEADS} from '../src/engine/types';
describe('Illustrative torsades source frame',()=>{
  it('is linear: coupled opposite contributions remain opposite after projection',()=>{
    const q:Vec=[.7,-.2,.4],t=q.map(x=>-.3*x) as Vec;
    for(const time of [0,.031,.8,1.3,2.17,3.1]){
      const a=torsadesFrame(q,time,180),b=torsadesFrame(t,time,180);
      a.forEach((x,i)=>expect(b[i]).toBeCloseTo(-.3*x,13));
      expect(torsadesFrame([0,0,0],time,180).every(x=>x===0)).toBe(true);
    }
  });
  it('does not claim a norm-preserving rigid anatomical rotation',()=>{
    const v:Vec=[0,1,0];expect(Math.hypot(...torsadesFrame(v,1,180))).toBeLessThan(1e-12);
  });
  it.each(['off','diagnostic','monitor','aggressive'] as const)('retains lead identities and deterministic event times with %s',filter=>{
    const c={...fromPreset(presetById('torsades')!),filter},a=synthesize(c,10),b=synthesize({...c,tAmp:0},10);
    expect(a.events).toEqual(b.events);expect(a.truth.axis).toBeNull();
    let changed=0;
    for(let i=0;i<a.leads.I.length;i++){
      const x=a.leads.I[i],y=a.leads.II[i];
      expect(a.leads.III[i]).toBeCloseTo(y-x,10);
      expect(a.leads.aVR[i]).toBeCloseTo(-(x+y)/2,10);
      if(Math.abs(a.leads.V5[i]-b.leads.V5[i])>1e-8)changed++;
    }
    expect(changed).toBeGreaterThan(100);
    const repeat=synthesize(c,10);for(const l of LEADS)expect(repeat.leads[l]).toEqual(a.leads[l]);
  });
});

import {analyzeSamples} from '../src/engine/sample-analysis';
it.each([120,180,240])('does not newly present an inaccurate usable rate at %s bpm in the exposed clean sweep',hr=>{
  for(const filter of ['off','diagnostic','monitor','aggressive'] as const){
    const c={...fromPreset(presetById('torsades')!),hr,filter};
    const m=analyzeSamples(synthesize(c,10));
    expect(m.evidence.qt.status).toBe('unavailable');
    if(m.evidence.hr.status==='usable'){
      expect(m.hr).not.toBeNull();expect(Math.abs(m.hr!-hr)).toBeLessThanOrEqual(5);
    }
  }
});
