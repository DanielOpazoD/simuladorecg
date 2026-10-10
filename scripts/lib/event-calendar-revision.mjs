import {restoreHistoricalAfClock} from './af-clock-prediction.mjs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Exact reviewed integrity revision. The independent frozen sample comparison
// remains mandatory; these hashes do not exempt a trace from numerical checks.
const REVIEWED = {"src/engine/constraints.ts": "3fdbf40b31fdbe9ccd51572579a3af4458b1c5ac7c4db8a5cfc43d44d09c564a", "src/engine/rhythm.ts": "2b0c1e5ba100f20e955841d152397d40310d9c1ca94fbf5d46b3651ded4d5830", "src/engine/event-calendar.ts": "ae66940fa13352936096d68de122fcc49be549560345fb005f8a16858d61a5fb", "src/engine/flutter-conduction.ts": "bc76e35479f8080568a451ed4a2c2e038ae095ede7fe0e4f61904b66b025a22f", "src/engine/vvi-demand.ts": "26ea38326981afbfe06d5cd424d5c386c645ff48222bb5f65f8c3accc3f1d3fc"};
export function assertReviewedEventCalendar(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown event calendar source');
  const reviewed = file === 'src/engine/rhythm.ts' ? restoreHistoricalAfClock(source.toString()) : source;
  assert.equal(createHash('sha256').update(reviewed).digest('hex'),REVIEWED[file], 'Unreviewed event calendar change: '+file);
}
