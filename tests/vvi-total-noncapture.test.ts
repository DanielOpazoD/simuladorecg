import {it,expect} from 'vitest';
import {synthesize} from '../src/engine/signal';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {applyAcquisitionScope} from '../src/engine/acquisition-measurement';
import {DEFAULT_CASE,cloneCase,normalizeCase} from '../src/engine/types';
import {vviSettings,isVviNoncapture} from '../src/engine/vvi-demand';
import {rhythmControlState} from '../src/ui/rhythm-controls';
import {amplitudeControlState,controls} from '../src/ui/controls';
const loss=()=>({...cloneCase(DEFAULT_CASE),rhythm:'paced' as const,pacing:'VVI' as const,pacingBehavior:'demand-no-capture' as const,intrinsicRate:0,hr:60});
it.each([20,40,60,90,120,180,250])('retains stimuli but no confirmed ventricular activity at %s bpm',hr=>{
 for(const filter of ['off','diagnostic','monitor','aggressive'] as const){
  const c={...loss(),hr,filter},s=synthesize(c,10),m=applyAcquisitionScope(analyzeSamples(s),filter);
  expect(s.events.beats).toHaveLength(0);expect(s.events.spikes.length).toBeGreaterThanOrEqual(3);
  expect(m.evidence.hr.status).toBe('unavailable');expect(m.evidence.qrs.status).toBe('unavailable');
 }
});
it('rejects mixed escape rather than erasing it',()=>{
 const c={...loss(),intrinsicRate:30};expect(()=>vviSettings(c)).toThrow(/no se elimina/);
 expect(()=>synthesize(c,10)).toThrow(/fuera de alcance/);expect(c.intrinsicRate).toBe(30);
});
it('preserves explicit behavior in case serialization',()=>expect(isVviNoncapture(normalizeCase(loss()))).toBe(true));
it('labels stimulus rate and disables nonexistent ventricular-wave controls',()=>{
 const c=loss();expect(rhythmControlState(c)).toMatchObject({noOrganizedBeats:true,baseRateDisabled:false,baseRateLabel:'Frecuencia de estímulos VVI'});
 expect(amplitudeControlState(c)).toMatchObject({tDisabled:true,stDisabled:true});
 const html=controls(c);expect(html).toContain('sin activación ventricular');
 expect(html.match(/<input[^>]*data-key="qrs"[^>]*>/)?.[0]).toContain('disabled');
 expect(html.match(/<input[^>]*data-key="hr"[^>]*>/)?.[0]).not.toContain('disabled');
});
it('restoring capture regenerates the exact same trace',()=>{
 const c={...loss(),pacingBehavior:'demand' as const},a=synthesize(c,10);
 synthesize(loss(),10);const b=synthesize(c,10);
 expect(b).toEqual(a);expect(b.events.beats.length).toBeGreaterThan(5);
});
