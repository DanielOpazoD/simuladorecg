import type { ECGCase, Signal } from '../engine/types';

/** Explain the generator's numerical support, never reinterpret a measured QT.
 * The events are explicitly model metadata, not an independent delineation.
 */
export function qtModelLimits(c: Pick<ECGCase, 'qtc'>, signal: Pick<Signal, 'events'>): string[] {
  let lower=0,upper=0;
  for(const b of signal.events.beats) {
    if(b.qt === undefined || b.adaptedRR === undefined || b.qrs === undefined)continue;
    const requested=c.qtc/1000*Math.cbrt(b.adaptedRR);
    // Nanosecond tolerance identifies algebraic clipping, not clinical precision.
    if(b.qt-requested>1e-9)lower++;
    else if(requested-b.qt>1e-9)upper++;
  }
  const limits:string[]=[];
  if(lower)limits.push(`Límite del generador en ${lower} latidos: el QT aplicado fue mayor que el derivado del QTc configurado para conservar al menos 120 ms después del QRS. Es un mínimo numérico del modelo, no un período refractario ni una regla clínica.`);
  if(upper)limits.push(`Límite del generador en ${upper} latidos: el QT aplicado se limitó a 900 ms. El QTc configurado no se realizó íntegramente; ese techo es numérico, no un máximo fisiológico.`);
  return limits;
}
