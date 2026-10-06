import type { EventSeries } from './types';

const EPSILON = 1e-9;
/** Internal event integrity, not an ECG interpretation or a refractory-period model. */
export function assertEventCalendar(events: EventSeries, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duración de calendario inválida.');
  for (const times of [events.atria.map(a => a.time), events.beats.map(b => b.time), events.spikes]) {
    for (let i = 0; i < times.length; i++) {
      if (!Number.isFinite(times[i]) || times[i] < 0 || times[i] >= duration || (i > 0 && times[i] <= times[i - 1]))
        throw new Error('Calendario inválido: eventos fuera de intervalo o de orden.');
    }
  }
  for (let i = 0; i < events.beats.length; i++) {
    const b = events.beats[i];
    if (!Number.isFinite(b.rr) || b.rr <= 0 || (i > 0 && Math.abs(b.rr - (b.time - events.beats[i - 1].time)) > EPSILON))
      throw new Error('Calendario inválido: RR no corresponde al evento precedente.');
  }
  for (const a of events.atria) {
    if (!a.conducted) continue;
    if (a.pr === undefined || !Number.isFinite(a.pr) || a.pr <= 0)
      throw new Error('Calendario inválido: P conducida sin PR válido.');
    const expected = a.time + a.pr;
    // Binary search avoids a full ventricular scan for every conducted P.
    let lo = 0, hi = events.beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events.beats[mid].time < expected - EPSILON) lo = mid + 1; else hi = mid;
    }
    if (expected < duration && (lo === events.beats.length || Math.abs(events.beats[lo].time - expected) > EPSILON))
      throw new Error('Calendario inválido: P conducida sin respuesta ventricular prevista.');
  }
}
