import type { EventSeries, ECGCase } from './types';
export function isVviDemand(c: Pick<ECGCase,'rhythm'|'pacing'|'pacingBehavior'>): boolean {
  return c.rhythm==='paced' && c.pacing==='VVI' && (c.pacingBehavior==='demand'||c.pacingBehavior==='demand-no-capture');
}
export function vviSettings(c: ECGCase): VviDemandSettings {
  const intrinsicRate=c.intrinsicRate??0,capture=c.pacingBehavior!=='demand-no-capture';
  if(!capture&&intrinsicRate!==0)throw new Error('Pérdida de captura con escape intrínseco fuera de alcance; no se elimina el escape solicitado.');
  return {lowerRate:c.hr,intrinsicRate,capture};
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

export function isVviNoncapture(c: Pick<ECGCase,'rhythm'|'pacing'|'pacingBehavior'>): boolean {
  return isVviDemand(c) && c.pacingBehavior === 'demand-no-capture';
}
export function vviScopeDescription(c: ECGCase): string {
  return isVviNoncapture(c)
    ? 'VVI experimental sin captura total y sin escape: persisten los estímulos, sin activación ventricular. Requiere actividad intrínseca 0. No representa fallo intermitente, umbrales del dispositivo, fusión ni captura mecánica.'
    : 'VVI a demanda idealizado: sensado perfecto, captura garantizada y escape ventricular reiniciable; sin fallos de captura, blanking, histéresis, fusión ni calibración de dispositivo.';
}
