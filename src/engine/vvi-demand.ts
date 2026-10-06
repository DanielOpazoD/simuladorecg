import type { EventSeries, ECGCase } from './types';
export function isVviDemand(c: Pick<ECGCase,'rhythm'|'pacing'|'pacingBehavior'>): boolean {
  return c.rhythm==='paced' && c.pacing==='VVI' && c.pacingBehavior==='demand';
}
export function vviSettings(c: ECGCase): VviDemandSettings {
  return {lowerRate:c.hr,intrinsicRate:c.intrinsicRate??0,capture:true};
}
export interface VviDemandSettings { lowerRate: number; intrinsicRate: number; capture: boolean; }
export function vviReferenceRate(s: VviDemandSettings): number {
  return s.capture ? Math.max(s.lowerRate,s.intrinsicRate) : s.intrinsicRate || s.lowerRate;
}
/** Ideal ventricular sensing; intrinsic source is a resettable ventricular escape. */
export function vviDemandEvents(s: VviDemandSettings, duration: number): EventSeries {
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(s.lowerRate)||s.lowerRate<20||s.lowerRate>250||!Number.isFinite(s.intrinsicRate)||s.intrinsicRate<0||s.intrinsicRate>150||typeof s.capture!=='boolean')
    throw new Error('Parámetros temporales VVI no válidos.');
  const interval=60/s.lowerRate, escape=s.intrinsicRate>0?60/s.intrinsicRate:Infinity;
  const events:EventSeries={atria:[],beats:[],spikes:[]};
  let nextIntrinsic=s.intrinsicRate>0?.4:Infinity, nextPace=.45;
  const beat=(time:number,kind:'ventricular'|'paced')=>{
    if(time>=duration)return;
    const previous=events.beats.at(-1);
    events.beats.push({time,kind,rr:previous?time-previous.time:60/vviReferenceRate(s)});
  };
  while(Math.min(nextIntrinsic,nextPace)<duration){
    if(nextIntrinsic<=nextPace){
      beat(nextIntrinsic,'ventricular');
      nextPace=nextIntrinsic+interval;
      nextIntrinsic+=escape;
    }else{
      const stimulus=nextPace;events.spikes.push(stimulus);
      if(s.capture){
        beat(stimulus+.005,'paced');
        nextIntrinsic=stimulus+.005+escape;
      }
      nextPace=stimulus+interval;
    }
  }
  return events;
}
