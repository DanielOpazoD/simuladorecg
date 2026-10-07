/** Offline reference extraction only. Annotation windows never enter the product. */
import { morphologyMetrics, type WaveMetrics } from './morphology-metrics';

export interface AnnotatedWave {
  wave: 'P' | 'QRS' | 'T'; onset: number | null; peak: number; offset: number | null;
}
export interface AnnotatedMorphologyRow {
  qrsPeakSample: number;
  qrsPeakToPeakMv: number | null;
  metrics: WaveMetrics | null;
  reason: string | null;
  j60Context: 'before-T' | 'inside-T' | 'after-T' | null;
  windows: {baseline: readonly [number, number]; qrs: readonly [number, number]; t: readonly [number, number]} | null;
}

/** Preserve every annotated QRS. Missing or ambiguous windows never become zero. */
export function annotatedMorphology(samples: ArrayLike<number>, fs: number, waves: readonly AnnotatedWave[]): AnnotatedMorphologyRow[] {
  if (!Number.isFinite(fs) || fs <= 0 || samples.length < 3) throw new Error('Invalid sampled reference');
  for (let i = 0; i < samples.length; i++) if (!Number.isFinite(samples[i])) throw new Error('Nonfinite reference sample');
  for (const w of waves) {
    if (!['P','QRS','T'].includes(w.wave) || !Number.isInteger(w.peak) || w.peak < 0 || w.peak >= samples.length)
      throw new Error('Invalid reference peak');
    for (const value of [w.onset,w.offset]) if (value !== null && (!Number.isInteger(value) || value < 0 || value >= samples.length))
      throw new Error('Invalid reference boundary');
    if ((w.onset !== null && w.onset > w.peak) || (w.offset !== null && w.offset < w.peak)) throw new Error('Reversed reference boundary');
  }
  const complexes = waves.filter(w => w.wave === 'QRS').sort((a,b) => a.peak-b.peak);
  if (new Set(complexes.map(w => w.peak)).size !== complexes.length) throw new Error('Duplicate reference QRS');
  return complexes.map((q,index) => {
    const row: AnnotatedMorphologyRow = {qrsPeakSample:q.peak,qrsPeakToPeakMv:null,metrics:null,reason:null,j60Context:null,windows:null};
    const reject = (reason: string) => ({...row,reason});
    if (q.onset === null || q.offset === null || q.offset-q.onset < 2) return reject('incomplete-QRS-window');
    let low = Infinity, high = -Infinity;
    for (let i = q.onset; i <= q.offset; i++) { low = Math.min(low,samples[i]); high = Math.max(high,samples[i]); }
    row.qrsPeakToPeakMv = high-low;
    const next = complexes[index+1], limit = next?.onset ?? next?.peak ?? samples.length;
    const ts = waves.filter(w => w.wave === 'T' && w.peak >= q.peak+.04*fs && w.peak <= q.peak+.8*fs && w.peak < limit);
    if (ts.length !== 1) return reject(ts.length ? 'ambiguous-T-association' : 'missing-T-association');
    const t = ts[0];
    if (t.onset === null || t.offset === null || t.offset-t.onset < 2) return reject('incomplete-T-window');
    if (t.onset < q.offset || t.offset >= limit) return reject('overlapping-wave-windows');
    const baseline = [q.onset/fs-.035,q.onset/fs-.020] as const;
    if (baseline[0] < 0 || q.offset/fs+.06 > (samples.length-1)/fs) return reject('window-outside-record');
    // This tests annotated overlap, not physiological isoelectricity or noise quality.
    const overlaps = waves.some(w => w.onset !== null && w.offset !== null && w.onset/fs < baseline[1] && w.offset/fs > baseline[0]);
    if (overlaps) return reject('baseline-overlaps-annotated-wave');
    const incompleteNearby = waves.some(w => (w.onset === null || w.offset === null) && w.peak/fs >= baseline[0]-.05 && w.peak/fs <= baseline[1]+.05);
    if (incompleteNearby) return reject('baseline-near-incomplete-annotation');
    const windows = {baseline,qrs:[q.onset/fs,q.offset/fs] as const,t:[t.onset/fs,t.offset/fs] as const};
    const metrics = morphologyMetrics(samples,fs,windows),j60=q.offset/fs+.06;
    return {...row,metrics,windows,j60Context:j60<t.onset/fs?'before-T':j60<=t.offset/fs?'inside-T':'after-T'};
  });
}
