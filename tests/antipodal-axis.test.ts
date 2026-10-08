import {directionSummary} from '../src/engine/analysis/statistics';
import {it,expect} from 'vitest';
import {fixture} from './fixtures';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {derive} from '../src/engine/leads';
import type {Lead} from '../src/engine/types';
function alternating(reverse=false){
 const s=fixture();
 for(let i=0;i<s.leads.I.length;i++) {
  const phase=i/s.fs%1;if(phase<.35||phase>.46)continue;
  const sign=(Math.floor(i/s.fs)%2===0)!==reverse?1:-1;
  for(const lead of Object.keys(s.leads) as Lead[])s.leads[lead][i]*=sign;
 }
 return s;
}
it.each([false,true])('does not invent a unique global axis from balanced opposing QRS (reverse=%s)',reverse=>{
 const s=alternating(reverse),before=structuredClone(s),m=analyzeSamples(s);
 expect(m.beats).toHaveLength(8);expect(m.beats.every(b=>b.axis!==null)).toBe(true);
 expect(m.axis).toBeNull();expect(m.evidence.axis.status).toBe('unavailable');
 expect(m.evidence.axis.reason).toMatch(/opuestas/);expect(m.evidence.axis.count).toBe(8);
 expect(m.hr).toBe(60);expect(m.qrs).toBe(90);expect(s).toEqual(before);
});
it('keeps a real zero-degree direction and an ordinary unidirectional source',()=>{
 const s=fixture();
 for(let i=0;i<s.leads.I.length;i++) {
  const v=derive({I:s.leads.I[i],II:s.leads.I[i]/2} as Record<Lead,number>);
  for(const lead of ['I','II','III','aVR','aVL','aVF'] as const)s.leads[lead][i]=v[lead];
 }
 expect(analyzeSamples(s).axis).toBeCloseTo(0,10);
 expect(analyzeSamples(fixture()).axis).toBeCloseTo(46.99608805717719,10);
});
it('withholds only the declared balanced antipodal degeneracy',()=>{
 for(const values of [[0,180],[180,0],[170,-10],[0,180,0,180],[-180,0]])expect(directionSummary(values)).toBeNull();
 expect(directionSummary([])).toBeNull();expect(directionSummary([0,0,180])).toBe(0);
 expect(Math.abs(directionSummary([179,-179,178,-178])!)).toBe(180);
 expect(directionSummary([10,20,30])).toBe(20);expect(directionSummary([0,179])).not.toBeNull();
 expect(()=>directionSummary([NaN])).toThrow();
});
it.each(['P','T'] as const)('does not fabricate a global %s direction from opposing waves',wave=>{
 const s=fixture(),[lo,hi]=wave==='P'?[.17,.31]:[.5,.8];
 for(let i=0;i<s.leads.I.length;i++)if(Math.floor(i/s.fs)%2===0&&i/s.fs%1>=lo&&i/s.fs%1<=hi)
  for(const lead of Object.keys(s.leads) as Lead[])s.leads[lead][i]*=-1;
 const m=analyzeSamples(s);
 expect(m.pr).not.toBeNull();expect(m.qt).not.toBeNull();expect(m.axis).not.toBeNull();
 expect(wave==='P'?m.pAxis:m.tAxis).toBeNull();expect(wave==='P'?m.tAxis:m.pAxis).not.toBeNull();
});
