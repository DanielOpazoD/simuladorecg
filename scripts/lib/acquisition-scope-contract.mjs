import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Acquisition metadata and downstream synthetic audit only.
// Independent sample-analysis revisions remain pinned separately.
const REVIEWED = {"src/engine/reference.ts": "d04d70ef95fcfb1c0b72c057a588b2ea46a54b75f430e344fda091fdbf29680c", "src/engine/analysis/model-audit.ts": "98a1494a80a92963de59da723cb0c0e095efb4a6749ae1d697b9624444b3fffa", "src/engine/worker.ts": "a1d7c7baeea6fbebe1be9fb9305a47b80ed0e2b828ab517ab004909eb79474d3", "src/engine/acquisition-measurement.ts": "20592d19d4502956849f14276a4b62e9137e0d58f7e6c49915b0733fb9628faa"};
export function assertReviewedAcquisitionScope(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown acquisition scope source');
  assert.equal(createHash('sha256').update(source).digest('hex'),REVIEWED[file],'Unreviewed acquisition scope change: '+file);
}
