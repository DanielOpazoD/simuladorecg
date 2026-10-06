import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Exact reviewed integrity revision. The independent frozen sample comparison
// remains mandatory; these hashes do not exempt a trace from numerical checks.
const REVIEWED = {"src/engine/rhythm.ts": "39055289a25b654bd625a4b26e2ed8566825f6b5f8f95942950fc6029f7ef537", "src/engine/event-calendar.ts": "ae66940fa13352936096d68de122fcc49be549560345fb005f8a16858d61a5fb", "src/engine/flutter-conduction.ts": "bc76e35479f8080568a451ed4a2c2e038ae095ede7fe0e4f61904b66b025a22f", "src/engine/vvi-demand.ts": "1aaa335815552762e3cd2258e1ece400a142f83e2d82e52c310c8a4aaa290f26"};
export function assertReviewedEventCalendar(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown event calendar source');
  assert.equal(createHash('sha256').update(source).digest('hex'),REVIEWED[file], 'Unreviewed event calendar change: '+file);
}
