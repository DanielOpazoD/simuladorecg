import type { Measurement, MetricKey } from './types';
export type AcquisitionFilter = 'off' | 'diagnostic' | 'monitor' | 'aggressive';
/** Known acquisition provenance only. No diagnosis, generator events or truth. */
export function applyAcquisitionScope(measurement: Measurement, filter: AcquisitionFilter): Measurement {
  if(filter==='off'||filter==='diagnostic')return measurement;
  if(filter!=='monitor'&&filter!=='aggressive')throw new Error('Filtro de adquisición no reconocido.');
  const reason=filter==='aggressive'
    ? 'Filtro paso alto de 2 Hz para demostración: medidas automáticas fuera de alcance; vuelve a Diagnóstico para medir.'
    : 'Filtro de monitor 0,5–40 Hz: verifica las medidas y la identificación de complejos; puede deformar límites y estímulos breves.';
  const evidence={...measurement.evidence};
  for(const key of Object.keys(evidence) as MetricKey[]){
    const item=evidence[key];
    if(item.status==='unavailable')continue;
    evidence[key]={...item,status:filter==='aggressive'?'unavailable':'review',reason};
  }
  return {...measurement,evidence,quality:reason+' '+measurement.quality};
}
