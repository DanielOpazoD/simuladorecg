import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Acquisition metadata and downstream synthetic audit only.
// Independent sample-analysis revisions remain pinned separately.
const REVIEWED = {"src/engine/reference.ts": "d04d70ef95fcfb1c0b72c057a588b2ea46a54b75f430e344fda091fdbf29680c", "src/engine/analysis/model-audit.ts": "98a1494a80a92963de59da723cb0c0e095efb4a6749ae1d697b9624444b3fffa", "src/engine/worker.ts": "8222b88684c96394e0a828826d06fb8b66110754c4d5c8477ee5601c6916a016", "src/engine/acquisition-measurement.ts": "20592d19d4502956849f14276a4b62e9137e0d58f7e6c49915b0733fb9628faa"};
export function assertReviewedAcquisitionScope(file, source) {
  assert.ok(Object.hasOwn(REVIEWED,file),'Unknown acquisition scope source');
  assert.equal(createHash('sha256').update(source).digest('hex'),REVIEWED[file],'Unreviewed acquisition scope change: '+file);
}
