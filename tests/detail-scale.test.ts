import { expect, it } from 'vitest';
import { detailScale } from '../src/ui/detail-scale';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import { beatDetail } from '../src/ui/beat-detail';
import { measure } from '../src/engine/measure';
it('shares a labelled voltage scale across all beats/leads without mutating samples',()=>{
 const c=fromPreset(presetById('sinus')!),s=synthesize(c,10),m=measure(s),original=s.leads.II.slice(),scale=detailScale(s);
 expect(scale.minMv).toBe(-scale.maxMv); expect(detailScale(s)).toBe(scale);
 const domains=[];
 for(const lead of ['I','II','V1','V5'] as const) for(const index of [0,1,3]) {
   c.view.lead=lead; const html=beatDetail(s,m,c,index);
   expect(html).toContain('Escala común');
   domains.push(html.match(/data-scale-min="([^"]+)" data-scale-max="([^"]+)"/)?.[0]);
 }
 expect(new Set(domains).size).toBe(1); expect(domains[0]).toBeTruthy();expect(s.leads.II).toEqual(original);
});
it('includes extrema in other leads and marks a new scale when the signal changes',()=>{
 const c=fromPreset(presetById('sinus')!),a=synthesize(c,10),b=synthesize(c,10);
 b.leads.V6[10]=4;
 expect(detailScale(b).maxMv).toBeGreaterThanOrEqual(4);
 expect(detailScale(b)).not.toEqual(detailScale(a));
});
it('rejects non-finite values before displaying misleading geometry',()=>{
 const s=synthesize(fromPreset(presetById('sinus')!),10);s.leads.V1[2]=NaN; expect(()=>detailScale(s)).toThrow();
});
