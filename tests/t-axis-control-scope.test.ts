import {it,expect} from 'vitest';
import {controls} from '../src/ui/controls';
import {fromPreset,presetById} from '../src/presets/catalog';
import {synthesize} from '../src/engine/signal';
const load=(id:string)=>{const p=presetById(id);if(!p)throw Error('Missing preset');return fromPreset(p);};
const input=(html:string)=>{const tag=html.match(/<input[^>]*data-key="tAxis"[^>]*>/)?.[0];if(!tag)throw Error('Missing T-axis slider');return tag;};
it.each(['lbbb','rbbb','irbbb','bifascicular','vvi','ddd','vt','torsades','complete_v','rv_acute','rv_chronic','lvh'])
('%s disables an axis control with no waveform effect',id=>{
 const c=load(id),before=structuredClone(c),html=controls(c);
 expect(input(html)).toMatch(/\bdisabled\b/);
 expect(input(html)).toContain('aria-describedby="t-axis-note"');
 expect(html).toContain('id="t-axis-note"');
 // Moving the slider fixes the axis (on the learned base it is natural until then).
 const a=synthesize({...c,tAxis:-40,naturalTAxis:false},6),b=synthesize({...c,tAxis:80,naturalTAxis:false},6);
 expect(a.leads).toEqual(b.leads);expect(c).toEqual(before);
});
it.each(['sinus','lafb','lpfb','pvc','bigeminy','af','flutter','junctional'])
('%s retains a responsive primary T-axis control',id=>{
 const c=load(id);expect(input(controls(c))).not.toMatch(/\bdisabled\b/);
 // Moving the slider fixes the axis (on the learned base it is natural until then).
 const a=synthesize({...c,tAxis:-40,naturalTAxis:false},6),b=synthesize({...c,tAxis:80,naturalTAxis:false},6);
 expect(a.leads.II).not.toEqual(b.leads.II);
});
it('preserves a stored axis while T is muted and restores it without altering the case',()=>{
 const c={...load('sinus'),tAxis:25,tAmp:0};expect(input(controls(c))).toMatch(/\bdisabled\b/);
 expect(input(controls(c))).toContain('value="25"');
 expect(input(controls({...c,tAmp:.28}))).not.toMatch(/\bdisabled\b/);expect(c.tAxis).toBe(25);
});
it.each(['vf','asystole'])('%s has no organized T-axis control',id=>{
 expect(input(controls(load(id)))).toMatch(/\bdisabled\b/);
});
it('keeps the control inactive for demand pacing and total noncapture',()=>{
 const base=load('vvi');
 for(const pacingBehavior of ['demand','demand-no-capture'] as const){
  const c={...base,pacingBehavior,intrinsicRate:0};expect(input(controls(c))).toMatch(/\bdisabled\b/);
 }
});
it('uses the actual primary-vector cancellation rule and respects a potassium override',()=>{
 const c={...load('lafb'),phase:'evolving' as const,ischemia:'anterior' as const,st:1};
 expect(input(controls(c))).toMatch(/\bdisabled\b/);
 expect(synthesize({...c,tAxis:-40},6).leads).toEqual(synthesize({...c,tAxis:80},6).leads);
 expect(input(controls({...c,electrolyte:'hypokalemia'}))).not.toMatch(/\bdisabled\b/);
});
