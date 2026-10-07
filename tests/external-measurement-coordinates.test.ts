import {describe,it,expect} from 'vitest';
import {fixture} from './fixtures';
import {LEADS,type Measurement} from '../src/engine/types';
import {analyzeSamples} from '../src/engine/sample-analysis';
import {assessExternalWindow} from '../src/io/external-assessment';
import type {ExternalECG} from '../src/io/external-ecg';
import {validateExternalReply} from '../src/ui/external-protocol';
const s=fixture();
const record:ExternalECG={...s,samples:5000,duration:10,provenance:{format:'csv',origin:'unverified',checksumVerified:false,channels:LEADS.map(lead=>({lead,gain:1,baseline:0,unit:'mV'}))}};
const assessment=assessExternalWindow(record);
if(!assessment.analysisAllowed)throw Error('Independent fixture must pass the input gate');
const original=analyzeSamples(record);
const validate=(measurement:Measurement)=>validateExternalReply({id:9,kind:'analyze',startSample:0,assessment,measurement},9,'analyze',record,0);

describe('external measurement coordinates are internally coherent',()=>{
 it('accepts the actual analyzer result without changing it',()=>{const m=structuredClone(original),before=structuredClone(m);expect(validate(m).measurement).toBe(m);expect(m).toEqual(before);});
 const mutations: [string,(m:Measurement)=>void][]=[
  ['unordered detections',m=>{[m.detectedPeaks[0],m.detectedPeaks[1]]=[m.detectedPeaks[1],m.detectedPeaks[0]];}],
  ['duplicate detections',m=>{m.detectedPeaks[1]=m.detectedPeaks[0];}],
  ['reversed QRS',m=>{m.beats[0].offset=m.beats[0].onset-.01;}],
  ['negative onset',m=>{m.beats[0].onset=-.1;}],
  ['out-of-window T',m=>{m.beats[0].tEnd=10.1;}],
  ['unlinked beat',m=>{m.beats[0].peak+=.0001;}],
  ['repeated beat',m=>{m.beats[1]=structuredClone(m.beats[0]);}],
  ['RR milliseconds instead of seconds',m=>{m.beats[0].rr*=1000;}],
  ['QRS seconds instead of milliseconds',m=>{m.beats[0].qrs/=1000;}],
  ['PR inconsistent with landmarks',m=>{m.beats[0].pr!+=1;}],
  ['QT inconsistent with landmarks',m=>{m.beats[0].qt!+=1;}],
  ['PR without onset',m=>{m.beats[0].pOnset=null;}],
  ['QT without end',m=>{m.beats[0].tEnd=null;}],
  ['negative noise magnitude',m=>{m.beats[0].noise=-.001;}],
 ];
 it.each(mutations)('rejects %s instead of silently normalizing it',(_,mutate)=>{const m=structuredClone(original);mutate(m);expect(()=>validate(m)).toThrow();});
 it('preserves a visible T peak without inventing a terminal landmark or QT',()=>{
  const m=structuredClone(original);for(const b of m.beats){b.qt=null;b.tEnd=null;b.tTangentEnd=null;}
  delete m.support;m.evidence.qt={...m.evidence.qt,status:'unavailable',count:0};
  m.qt=null;m.tAxis=null;m.qtc={bazett:null,fridericia:null,framingham:null,hodges:null};
  expect(validate(m).measurement?.beats[0].tPeak).not.toBeNull();
 });
});

it('validates the preserved terminal audit instead of trusting worker metadata',()=>{
 const m=structuredClone(original),b=m.beats[0];
 if(b.tEnd===null||b.qt===null)throw Error('Fixture needs a measured T');
 b.terminalRevision={method:'area-return-reconciliation-v1',previousEnd:b.tEnd+.1,previousQt:b.qt+100,previousTangentEnd:null,areaEnd:b.tEnd,leadCount:3,spreadMs:4};
 b.tTangentEnd=null;expect(validate(m).measurement).toBe(m);
 for(const change of [{areaEnd:NaN},{previousQt:12},{leadCount:2},{spreadMs:40},{previousEnd:11}]){
  const broken=structuredClone(m);Object.assign(broken.beats[0].terminalRevision!,change);
  expect(()=>validate(broken)).toThrow();
 }
});
