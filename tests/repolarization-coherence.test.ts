import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import type {Beat,ECGCase} from '../src/engine/types';
import {LEADS} from '../src/engine/types';
import {fromPreset,presetById} from '../src/presets/catalog';
import {synthesize} from '../src/engine/signal';
import {qrsKernels,tVector} from '../src/engine/morphology';
import {controls} from '../src/ui/controls';
import {secondaryRepolarization} from '../src/engine/secondary-repolarization';
const families=['lbbb','rbbb','irbbb','vvi','pvc','vt'];
function setup(id:string):{c:ECGCase;b:Beat}{
  const c=fromPreset(presetById(id)!);
  Object.assign(c,{hr:60,atrialRate:60,variability:0,filter:'off',qtc:600,ischemia:'none',electrolyte:'none',st:0});
  const s=synthesize(c,10), b=s.events.beats.find(b=>b.time>2&&(id!=='pvc'||b.kind==='pvc'))!;
  assert.ok(b); return {c,b};
}
function close(actual:number,expected:number,label:string){assert.ok(Math.abs(actual-expected)<1e-12,`${label}: ${actual} != ${expected}`);}
describe('A02/A03: independent components, one final T vector',()=>{
  it('shows the represented ST scope in the actual controls',()=>{
    const {c}=setup('lbbb');assert.match(controls(c),/El ST secundario sigue esa misma fuente QRS/);
  });
  for(const id of families){
    it(`${id}: applies each existing potassium factor after direction selection`,()=>{
      const {c,b}=setup(id), v=tVector(c,b);
      for(const [electrolyte,factor] of [['hypokalemia',.4],['hyperkalemia',2.6]] as const){
        const x=tVector({...c,electrolyte},b);
        for(let j=0;j<3;j++)close(x[j],v[j]*factor,id);
      }
    });
    it(`${id}: active phase has an effect, zero intensity restores T`,()=>{
      const {c,b}=setup(id),v=tVector(c,b);
      for(const st of [0,.5,1,2])for(const phase of ['hyperacute','evolving'] as const){
        const x=tVector({...c,ischemia:'anterior',st,phase},b);
        const factor=phase==='hyperacute'?1+1.15*st/2:1-st;
        for(let j=0;j<3;j++)close(x[j],v[j]*factor,id);
      }
    });
    it(`${id}: rejects the unsupported double-primary combination rather than ignoring a control`,()=>{
      const {c,b}=setup(id);
      assert.throws(()=>tVector({...c,electrolyte:'hypokalemia',ischemia:'anterior',phase:'evolving',st:1},b),/fuera de alcance/);
    });
    it(`${id}: rendered hypokalemic T has the same .4 response, not only a helper value`,()=>{
      const {c}=setup(id),a=synthesize(c,10),a0=synthesize({...c,tAmp:0},10),
        h=synthesize({...c,electrolyte:'hypokalemia'},10),h0=synthesize({...c,electrolyte:'hypokalemia',tAmp:0},10);
      assert.deepEqual(a.events,h.events);
      let response=0;
      for(const l of LEADS)for(let i=0;i<a.leads[l].length;i++){
        const t=a.leads[l][i]-a0.leads[l][i]; response=Math.max(response,Math.abs(t));
        close(h.leads[l][i]-h0.leads[l][i],.4*t,`${id}/${l}/${i}`);
      }
      assert.ok(response>.01,'Fixture needs a measurable T');
    });
  }
  for(const id of ['lbbb','vvi','vt','idioventricular','complete_v'])
    it(`${id}: renders the secondary ST component with T amplitude zero`,()=>{
      const {c,b}=setup(id);c.tAmp=0;c.pAmp=0;
      const s=synthesize(c,10),i=Math.round((b.time+b.qrs!+.060)*s.fs);
      assert.notEqual(secondaryRepolarization(c,b,qrsKernels(c,b)).st,null);
      assert.ok(Math.max(...LEADS.map(l=>Math.abs(s.leads[l][i])))>.005,"ST60 must be represented");
    });
  for(const id of ['sinus','wpw'])
    it(`${id}: does not acquire a new secondary ST component`,()=>{
      const {c,b}=setup(id);assert.equal(secondaryRepolarization(c,b,qrsKernels(c,b)).st,null);
    });
  it('overload modifies the coupled direction through the QRS, without a second full T',()=>{
    const {c,b}=setup('lbbb');
    for(const overload of ['none','lv','rv_acute','rv_chronic'] as const){
      const k={...c,overload},secondary=secondaryRepolarization(k,b,qrsKernels(k,b));
      assert.ok(secondary.t);
      for(let j=0;j<3;j++)close(tVector(k,b)[j],secondary.t![j]*c.tAmp/.28,overload);
    }
  });
  it('primary lesion remains distinct from the secondary ST mechanism',()=>{
    const {c,b}=setup('lbbb'),p={...c,ischemia:'anterior' as const,phase:'acute' as const,st:2};
    assert.deepEqual(secondaryRepolarization(c,b,qrsKernels(c,b)).st,secondaryRepolarization(p,b,qrsKernels(p,b)).st);
    const a=synthesize({...c,tAmp:0,pAmp:0},10),z=synthesize({...p,tAmp:0,pAmp:0},10);
    assert.deepEqual(a.events,z.events);
    assert.ok(Math.abs(a.leads.V2[Math.round((b.time+b.qrs!+.06)*a.fs)]-z.leads.V2[Math.round((b.time+b.qrs!+.06)*z.fs)])>.01);
  });
});
