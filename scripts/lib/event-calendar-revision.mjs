import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Exact reviewed integrity revision. The independent frozen sample comparison
// remains mandatory; these hashes do not exempt a trace from numerical checks.
const REVIEWED = {"src/engine/rhythm.ts": "9f4df067a84a00ea647ed77d620fbdeba81a60cb9f06f1774c8b2866304c9714", "src/engine/event-calendar.ts": "ae66940fa13352936096d68de122fcc49be549560345fb005f8a16858d61a5fb", "src/engine/flutter-conduction.ts": "bc76e35479f8080568a451ed4a2c2e038ae095ede7fe0e4f61904b66b025a22f"};
export function assertReviewedEventCalendar(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown event calendar source');
  assert.equal(createHash('sha256').update(source).digest('hex'),REVIEWED[file], 'Unreviewed event calendar change: '+file);
}
