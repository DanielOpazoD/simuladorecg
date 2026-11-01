import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE, LEADS, cloneCase, type ECGCase } from '../src/engine/types';
import { synthesize } from '../src/engine/signal';
import { usesRealisticBase } from '../src/engine/realistic/scope';
import { amplitudeControlState, controls, patternControlState } from '../src/ui/controls';

const make=(patch:Partial<ECGCase>):ECGCase=>({...cloneCase(DEFAULT_CASE),...patch});
// Learned normal base and its historical-kernel counterpart (an unsupported electrolyte keeps the kernels).
const learned=make({rhythm:'sinus',av:'normal',conduction:'normal',ectopy:'none',ischemia:'none',overload:'none',electrolyte:'none',phase:'acute',stShape:'plateau'});
const synthetic={...learned,electrolyte:'hyperkalemia' as ECGCase['electrolyte']};
const leads=(c:ECGCase)=>synthesize(c,3).leads;
const expectSame=(c:ECGCase,change:Partial<ECGCase>)=>{const a=leads(c),b=leads({...c,...change});for(const lead of LEADS)expect(b[lead]).toEqual(a[lead]);};
const expectDifferent=(c:ECGCase,change:Partial<ECGCase>)=>{const a=leads(c),b=leads({...c,...change});expect(LEADS.some(lead=>b[lead].some((v,i)=>v!==a[lead][i]))).toBe(true);};
const inputOf=(html:string,key:string)=>html.match(new RegExp(`<(?:input|select)[^>]*data-key="${key}"[^>]*>`))?.[0]??'';

describe('Pattern controls fold away where the model does not read them',()=>{
  it('uses the two bases the tests rely on',()=>{
    expect(usesRealisticBase(learned)).toBe(true);
    expect(usesRealisticBase(synthetic)).toBe(false);
  });
  it('keeps the enabling selectors on organized rhythms',()=>{
    for(const c of [learned,synthetic]){
      expect(patternControlState(c)).toMatchObject({ischemia:false,overload:false,phase:true});
      const html=controls(c);
      expect(inputOf(html,'ischemia')).not.toContain('disabled');
      expect(inputOf(html,'overload')).not.toContain('disabled');
      expect(inputOf(html,'phase')).toContain('disabled');
    }
  });
  it('exposes the pattern state through the amplitude sync contract',()=>{
    expect(amplitudeControlState(learned).patterns).toEqual(patternControlState(learned));
  });
  it.each(['vf','asystole'] as const)('hides every pattern control without organized complexes in %s',rhythm=>{
    const c=make({rhythm});
    expect(patternControlState(c)).toEqual({ischemia:true,phase:true,stShape:true,overload:true,septalQ:true});
    const html=controls(c);
    for(const key of ['ischemia','phase','stShape','overload','septalQ'])expect(inputOf(html,key)).toContain('disabled');
    expectSame(c,{ischemia:'anterior',phase:'acute',st:4});
    expectSame(c,{overload:'lv'});
    expectSame(c,{septalQ:!c.septalQ});
    expectSame(c,{stShape:'convex'});
  });
  it('phase is inert without a lesion pattern on both bases, active with one',()=>{
    for(const c of [learned,synthetic]){
      expectSame(c,{phase:'evolving'});
      expectSame(c,{phase:'hyperacute'});
      expectSame(c,{phase:'chronic'});
    }
    const lesion={...synthetic,ischemia:'anterior' as const,st:2};
    expect(patternControlState(lesion).phase).toBe(false);
    expectDifferent(lesion,{phase:'evolving'});
  });
  it('ST morphology is inert when the pattern has no primary ST component',()=>{
    const wellens=make({...synthetic,ischemia:'wellens_a',st:2});
    expect(patternControlState(wellens).stShape).toBe(true);
    expect(inputOf(controls(wellens),'stShape')).toContain('disabled');
    expectSame(wellens,{stShape:'convex'});
    expectSame(learned,{stShape:'convex'});
    const chronic={...synthetic,ischemia:'lateral' as const,phase:'chronic' as const,st:2};
    expect(patternControlState(chronic).stShape).toBe(true);
    expectSame(chronic,{stShape:'concave'});
    const acute={...synthetic,ischemia:'lateral' as const,phase:'acute' as const,st:2};
    expect(patternControlState(acute).stShape).toBe(false);
  });
  it('septal component acts only on historical normal-conduction conducted beats',()=>{
    expect(patternControlState(learned).septalQ).toBe(true);
    expect(inputOf(controls(learned),'septalQ')).toContain('disabled');
    expectSame(learned,{septalQ:!learned.septalQ});
    const block={...synthetic,conduction:'rbbb' as const};
    expect(patternControlState(block).septalQ).toBe(true);
    expectSame(block,{septalQ:!block.septalQ});
    const vt=make({rhythm:'vt'});
    expect(patternControlState(vt).septalQ).toBe(true);
    expectSame(vt,{septalQ:!vt.septalQ});
    expect(patternControlState(synthetic).septalQ).toBe(false);
    expect(inputOf(controls(synthetic),'septalQ')).not.toContain('disabled');
    expectDifferent(synthetic,{septalQ:!synthetic.septalQ});
  });
  it('visible enabling selectors still change the trace',()=>{
    expectDifferent(learned,{overload:'lv'});
    expectDifferent(learned,{ischemia:'anterior',phase:'chronic'});
    expectDifferent(synthetic,{overload:'rv_chronic'});
  });
  it('keeps hidden controls in the DOM with their values, disabled',()=>{
    const c=make({rhythm:'vf',ischemia:'lateral',stShape:'convex'}),html=controls(c);
    expect(html.match(/data-key="ischemia"/g)).toHaveLength(1);
    expect(inputOf(html,'ischemia')).toContain('disabled');
    expect(html).toContain('value="lateral" selected');
    expect(html).toContain('value="convex" selected');
  });
});
