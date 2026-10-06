import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertReviewedAcquisitionScope} from '../scripts/lib/acquisition-scope-contract.mjs';
for(const file of ['src/engine/worker.ts','src/engine/acquisition-measurement.ts','src/engine/analysis/model-audit.ts'])it('pins scope without exempting detector changes: '+file,()=>{
 const source=readFileSync(file);expect(()=>assertReviewedAcquisitionScope(file,source)).not.toThrow();
 expect(()=>assertReviewedAcquisitionScope(file,Buffer.concat([source,Buffer.from('\n')]))).toThrow(/Unreviewed/);
});
