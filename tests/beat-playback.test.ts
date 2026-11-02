import { describe, it, expect } from 'vitest';
import type { Measurement, DelineatedBeat } from '../src/engine/types';
import { beatPlayback, beatPhase } from '../src/ui/beat-playback';

const beat = (): DelineatedBeat => ({ peak:.95,onset:.9,offset:1,pOnset:.75,pPeak:.8,tPeak:1.16,tEnd:1.3,tTangentEnd:1.28,rr:.83,pr:150,qrs:100,qt:400,axis:45,noise:0 });
function measurement(): Measurement {
  const evidence = { status:'usable' as const,reason:'fixture',count:1,total:1,spread:0 };
  return { hr:72,instantHr:72,pr:150,qrs:100,qt:400,axis:45,pAxis:45,tAxis:45,rr:.83,qtc:{bazett:439,fridericia:425,framingham:426,hodges:421},quality:'fixture',beats:[beat()],evidence:{hr:{...evidence},pr:{...evidence},qrs:{...evidence},qt:{...evidence},axis:{...evidence}},window:{start:0,end:2},detectedPeaks:[.95] };
}
describe('recorrido sobre los mismos límites de las marcas', () => {
  it('conserva extremos, valores y origen de las estimaciones sin mutar el objeto', () => {
    const m = measurement(), before = structuredClone(m), b = beatPlayback(m, .5, 1.5)!;
    expect(b).toEqual({start:.75,onset:.9,offset:1,end:1.3,hasPr:true,review:false});
    expect(beatPhase(b,.8)).toMatch(/^PR/); expect(beatPhase(b,.9)).toMatch(/^QRS/);
    expect(beatPhase(b,1)).toMatch(/^ST–T/); expect(m).toEqual(before);
  });
  it('no inventa la P si no hay PR aceptado ni elimina la incertidumbre', () => {
    const m = measurement(); m.pr = null; m.evidence.qt.status = 'review';
    const b = beatPlayback(m, .5, 1.5)!;
    expect(b.start).toBe(.9); expect(b.hasPr).toBe(false); expect(b.review).toBe(true);
    expect(beatPhase(b,.9)).toMatch(/^QRS/);
  });
  it.each(['qrs','qt'] as const)('sin %s aceptado no inventa un ciclo completo', key => {
    const m = measurement(); m.evidence[key].status = 'unavailable';
    expect(beatPlayback(m,.5,1.5)).toBeNull();
  });
  it('rechaza finales ausentes, fuera de ventana o que atraviesan el siguiente QRS', () => {
    const m = measurement(); expect(beatPlayback(m,1,1.5)).toBeNull(); expect(beatPlayback(m,.5,1.2)).toBeNull();
    m.beats[0].tEnd=null; expect(beatPlayback(m,.5,1.5)).toBeNull();
    m.beats[0].tEnd=1.3; m.beats.push({...beat(),onset:1.1,offset:1.2,tEnd:null});
    expect(beatPlayback(m,.5,1.5)).toBeNull(); expect(beatPlayback(null,.5,1.5)).toBeNull();
  });
});
