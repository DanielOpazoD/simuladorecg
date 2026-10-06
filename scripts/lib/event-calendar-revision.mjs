import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Exact reviewed integrity revision. The independent frozen sample comparison
// remains mandatory; these hashes do not exempt a trace from numerical checks.
const REVIEWED = {"src/engine/rhythm.ts": "06742f64382949e296147d0f5a43f14502bdf1e29247e9bd531416fc2428d337", "src/engine/event-calendar.ts": "ae66940fa13352936096d68de122fcc49be549560345fb005f8a16858d61a5fb"};
export function assertReviewedEventCalendar(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown event calendar source');
  assert.equal(createHash('sha256').update(source).digest('hex'),REVIEWED[file], 'Unreviewed event calendar change: '+file);
}
