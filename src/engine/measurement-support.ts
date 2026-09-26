import type { Measurement, MetricKey, DelineatedBeat, SampleSupport } from './types';

export const MEASUREMENT_SUPPORT_POLICY = Object.freeze({
  matchSeconds: 0.04, reviewUnsupportedFraction: 0.35,
  minimumUnsupported: 2, minimumStableForSummary: 2,
});
type Challenge = { requiresReview: boolean; challengedPeaksSeconds: readonly number[] };

/** Traceable support is not a per-lead diagnosis or a calibrated probability.
 * Stability is the SAME detector at a second threshold, not independent truth.
 * Different intervals use only the beats that actually supplied that interval.
 */
export function attachMeasurementSupport(m: Measurement, challenge: Challenge | null): Measurement {
  const matched = new Set<number>();
  const nominal=m.detectedPeaks, other=challenge?.challengedPeaksSeconds ?? nominal;
  let i=0,j=0;
  while(i<nominal.length&&j<other.length) {
    const delta=nominal[i]-other[j];
    if(Math.abs(delta)<=MEASUREMENT_SUPPORT_POLICY.matchSeconds){matched.add(nominal[i]);i++;j++;}
    else if(delta<0)i++;else j++;
  }
  const select=(key:MetricKey):DelineatedBeat[]=>m.beats.filter(b=>key==='pr'?b.pr!==null&&b.pOnset!==null:key==='qt'?b.qt!==null&&b.tEnd!==null:true);
  const support={} as Record<MetricKey, SampleSupport>;
  for(const key of ['hr','pr','qrs','qt','axis'] as const) {
    const candidates=key==='hr'?nominal.slice(1).map((peak,k)=>({peak,start:nominal[k],end:peak,stableDetection:matched.has(peak)&&matched.has(nominal[k])})):
      select(key).map(b=>({peak:b.peak,start:key==='pr'?b.pOnset!:b.onset,end:key==='pr'?b.onset:key==='qt'?b.tEnd!:b.offset,stableDetection:matched.has(b.peak)}));
    support[key]={leads:key==='axis'?['I','II']:['I','II','V1','V5'],domain:'sample-only-candidates-before-model-audit',candidates,stable:candidates.filter(c=>c.stableDetection).length,total:candidates.length};
  }
  let result:Measurement={...m,support};
  // HR has its own upstream screen. Interval quality is NOT inferred from RR regularity.
  if(!challenge?.requiresReview)return result;
  for(const key of ['pr','qrs','qt','axis'] as const) {
    if(result[key]===null||m.evidence[key].status==='unavailable')continue;
    const s=support[key],unstable=s.total-s.stable;
    if(unstable<MEASUREMENT_SUPPORT_POLICY.minimumUnsupported||unstable/s.total<MEASUREMENT_SUPPORT_POLICY.reviewUnsupportedFraction)continue;
    const remove=s.total>=3&&s.stable<MEASUREMENT_SUPPORT_POLICY.minimumStableForSummary;
    result={...result,evidence:{...result.evidence,[key]:{...result.evidence[key],
      status:remove?'unavailable':'review',count:remove?0:result.evidence[key].count,reason:remove?
        'No quedan suficientes latidos con detección estable para sostener este resumen; se retira la cifra. Los límites candidatos se conservan para revisión.':
        'Parte de los latidos que aportan esta medida cambia con el umbral de detección y el fondo es elevado; revisa los candidatos indicados.'}}};
    if(remove){result={...result,[key]:null,rejected:{...result.rejected,[key]:m[key]!}};
      if(key==='pr')result.pAxis=null;
      if(key==='qt'){result.tAxis=null;result.qtc={bazett:null,fridericia:null,framingham:null,hodges:null};}}
  }
  return result;
}
