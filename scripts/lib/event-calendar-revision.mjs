import {restoreHistoricalAfClock} from './af-clock-prediction.mjs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Reviewed source-family override for the synthetic previous ECG. The default
// calendar and gamma sampler are unchanged; paired AF tests protect the override.
// Exact reviewed integrity revision. The independent frozen sample comparison
// remains mandatory; these hashes do not exempt a trace from numerical checks.
const REVIEWED = {"src/engine/constraints.ts": "df5b208a70190b21916e5e0fa06e32e7a8daa90b073b0fb2629b39df84714040", "src/engine/rhythm.ts": "b8cd08e99526ec5a032bfbc3e0ea8c1d04297abfe0b951b8e67fc56b24ec00b5", "src/engine/event-calendar.ts": "ae66940fa13352936096d68de122fcc49be549560345fb005f8a16858d61a5fb", "src/engine/flutter-conduction.ts": "bc76e35479f8080568a451ed4a2c2e038ae095ede7fe0e4f61904b66b025a22f", "src/engine/vvi-demand.ts": "26ea38326981afbfe06d5cd424d5c386c645ff48222bb5f65f8c3accc3f1d3fc"};
export function assertReviewedEventCalendar(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown event calendar source');
  const reviewed = file === 'src/engine/rhythm.ts' ? restoreHistoricalAfClock(source.toString()) : source;
  assert.equal(createHash('sha256').update(reviewed).digest('hex'),REVIEWED[file], 'Unreviewed event calendar change: '+file);
}
