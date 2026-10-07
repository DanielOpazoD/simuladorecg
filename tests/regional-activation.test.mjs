import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { fromPreset, presetById } from '../src/presets/catalog';
import { normalizeImportedCase, caseContext } from '../src/presets/case-context';
import { normalizeCase, LEADS } from '../src/engine/types';
import { qrsKernels, qrsKernelValue, tVector } from '../src/engine/morphology';
import { synthesize } from '../src/engine/signal';
import { regionalActivationState, regionalWindow, regionalRbbbKernels } from '../src/engine/regional-activation';
import { secondaryRepolarization } from '../src/engine/secondary-repolarization';
import { regionalActivationControls } from '../src/ui/regional-activation';
import { assertRegionalSampleContract } from '../scripts/lib/regional-activation-contract.mjs';
const base = () => ({...fromPreset(presetById('rbbb')), activationModel:'regional-rbbb-v1', hr:60, variability:0, filter:'off'});
const beat = {time:0, rr:1, kind:'normal'};
const kernelAt = (ks, qrs, ms) => ks.reduce((v,k)=>v.map((a,j)=>a+k.v[j]*qrsKernelValue(k,ms/qrs)),[0,0,0]);

describe('Regional BRD activation, opt-in with a separate early clock',()=>{
  it('satisfies independent output-sample acceptance and a discriminating negative control',()=>{
    assertRegionalSampleContract({fromPreset,presetById,synthesize});
  });
  it('keeps all early basis times, vectors and summed activity fixed as RV broadens',()=>{
    const c=base(), first=qrsKernels({...c,qrs:100},beat);
    for(const qrs of [100,115,140,190,240]){
      const ks=qrsKernels({...c,qrs},beat);
      for(let j=0;j<3;j++){
        assert.ok(Math.abs(ks[j].mu*qrs-first[j].mu*100)<1e-10);
        assert.ok(Math.abs(ks[j].sigma*qrs-first[j].sigma*100)<1e-10);
        for(let k=0;k<3;k++)assert.ok(Math.abs(ks[j].v[k]-first[j].v[k])<1e-10);
      }
      for(const ms of [0,10,30,44,54]){
        const a=kernelAt(first,100,ms),b=kernelAt(ks,qrs,ms);
        a.forEach((v,j)=>assert.ok(Math.abs(v-b[j])<1e-10));
      }
    }
  });
  it('weights match numerical integration of the actual tapered functions',()=>{
    for(const qrs of [100,150,240]) for(const k of qrsKernels({...base(),qrs},beat)){
      let integral=0;const n=20000;
      for(let j=0;j<n;j++)integral+=qrsKernelValue(k,(j+.5)/n)/n;
      assert.ok(Math.abs(integral/Math.sqrt(2*Math.PI)-k.regional.weight)<1e-8);
    }
  });
  it('couples T to the tagged delayed RV, never to LV crossing 55% of a short QRS',()=>{
    const c=base(), first=tVector({...c,qrs:100},beat);
    for(const qrs of [100,115,140,190,240]){
      const ks=qrsKernels({...c,qrs},beat),s=secondaryRepolarization({...c,qrs},beat,ks);
      const rv=ks.find(k=>k.regional.region==='rv-delayed');
      rv.v.forEach((v,j)=>assert.ok(Math.abs(s.reference[j]-v*rv.regional.weight)<1e-12));
      first.forEach((v,j)=>assert.ok(Math.abs(v-tVector({...c,qrs},beat)[j])<1e-10));
      s.reference.forEach((v,j)=>assert.ok(Math.abs(s.st[j]+.2*v)<1e-12));
    }
  });
  it('does not change events, QT adaptation, lesion timing or source templates',()=>{
    for(const id of ['rbbb','irbbb']){
      const c={...fromPreset(presetById(id)),qrs:150,activationModel:'regional-rbbb-v1'};
      const a=synthesize(c,10),b=synthesize({...c,activationModel:'template'},10);
      assert.deepEqual(a.events,b.events);
      assert.notDeepEqual(a.leads.V1,b.leads.V1);
    }
    const c=base(),historical={...c,activationModel:'template'};
    for(const kind of ['pvc','ventricular','paced']){
      const b={...beat,kind};assert.deepEqual(qrsKernels(c,b),qrsKernels(historical,b));
      assert.deepEqual(tVector(c,b),tVector(historical,b));
    }
  });
  it('scales the complete QRS without moving or mutating regional supports',()=>{
    const c=base(),ks=qrsKernels(c,beat), saved=structuredClone(ks);
    for(const qrsAmp of [.1,2,3]){
      const scaled=qrsKernels({...c,qrsAmp},beat);
      scaled.forEach((k,i)=>{assert.deepEqual(k.regional,ks[i].regional);
        k.v.forEach((v,j)=>assert.ok(Math.abs(v-ks[i].v[j]*qrsAmp/c.qrsAmp)<1e-10));});
    }
    assert.deepEqual(ks,saved);
  });
  it.each([
    {conduction:'lbbb'},{conduction:'rbbb_lafb'},{overload:'rv_chronic'},
    {ischemia:'posterior'},{rhythm:'vt'},{rhythm:'vf'},{rhythm:'asystole'},
    {rhythm:'paced',pacing:'VVI'},{av:'complete',escape:'ventricular'},{qrs:90},
  ])('retains incompatible requests with an explicit historical fallback: %j', patch=>{
    const c={...base(),...patch};assert.equal(regionalActivationState(c).active,false);
    const a=synthesize(c,10),b=synthesize({...c,activationModel:'template'},10);
    for(const lead of LEADS)assert.deepEqual(a.leads[lead],b.leads[lead]);
    assert.deepEqual(a.events,b.events);
    assert.ok(a.warnings.some(w=>w.includes('solicitada pero no aplicada')));
    assert.match(regionalActivationControls(c),/Regional no aplicado/);
  });
  it('round-trips schema v1 as custom, rejects unknown flags and defaults legacy imports',()=>{
    assert.equal(normalizeCase({version:1}).activationModel,'template');
    assert.throws(()=>normalizeCase({version:1,activationModel:'invented'}));
    const c=normalizeImportedCase(base());assert.equal(c.activationModel,'regional-rbbb-v1');
    assert.equal(caseContext(c).preset,undefined);
    const a=synthesize(c,10),b=synthesize(normalizeImportedCase(JSON.parse(JSON.stringify(c))),10);
    for(const lead of LEADS)assert.deepEqual(a.leads[lead],b.leads[lead]);
  });
  it('rejects malformed supports before kernel construction, with finite smooth endpoints',()=>{
    for(const qrs of [0,99,241,NaN,Infinity])assert.throws(()=>regionalRbbbKernels([],qrs));
    const support={start:.1,end:.9};
    for(const u of [-1,0,.1,.9,1,2])assert.equal(regionalWindow(u,support),0);
    assert.ok(regionalWindow(.10000001,support)<1e-10);
    assert.ok(regionalWindow(.89999999,support)<1e-10);
  });
});
