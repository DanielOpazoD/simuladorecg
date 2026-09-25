import { it, expect } from 'vitest';
import { synthesize } from '../src/engine/signal';
import { fromPreset, presetById } from '../src/presets/catalog';
import * as baseline from './reference/baseline-v1.1.mjs';
it('hyperkalemia waveform agrees exactly with preserved pre-v1.3 generator on this runtime', () => {
 const c = fromPreset(presetById('hyperk')), a = synthesize(c, 10), b = baseline.synthesize(c, 10);
 for (const l of Object.keys(a.leads)) expect(a.leads[l]).toEqual(b.leads[l]);
});
