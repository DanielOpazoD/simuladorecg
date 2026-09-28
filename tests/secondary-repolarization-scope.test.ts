import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {synthesize} from '../src/engine/signal';
import {fromPreset,presetById} from '../src/presets/catalog';
import {beatWindows,assertSampleRegion} from './support/repolarization-contract.mjs';

// Controlled isolated beats: no tachycardic overlap, artifacts, or IIR tails.
// Production always has a centred antialias FIR (40 ms each side).
describe('T amplitude does not change the twelve-lead QRS outside FIR influence',()=>{
  for(const id of ['sinus','rbbb','irbbb','lbbb','wpw','vvi','ddd','vt','idioventricular'])
    it(`${id}: compares the complete QRS, with seconds-valued event boundaries`,()=>{
      const c={...fromPreset(presetById(id)!),filter:'off' as const,hr:60,atrialRate:60,variability:0};
      const a=synthesize({...c,tAmp:0},10),b=synthesize(c,10);
      assert.deepEqual(a.events,b.events);
      let samples=0;
      for(const beat of a.events.beats.filter(x=>x.time>1 && x.time<8)) {
        const w=beatWindows(beat);
        const tLength=c.electrolyte==='hyperkalemia'?.13:Math.min(.22,(beat.qt!-beat.qrs!)*.68);
        const tOnset=beat.time+beat.qt!-tLength;
        assert.ok(w.qrs[1]+.04<tOnset,'Fixture must separate the QRS from T antialias support');
        const r=assertSampleRegion(a,b,w.pre[0],w.qrs[1],{label:id,epsilon:1e-12});
        samples+=r.checked;
      }
      assert.ok(samples>5000,'Must exercise several complete QRS across twelve leads');
    });
});
