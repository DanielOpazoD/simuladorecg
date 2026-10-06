import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertFrozenAfSampler,predictAfClock} from '../scripts/lib/af-clock-prediction.mjs';
it('pins the pre-evaluation candidate instead of refitting it to exposed records',()=>{
 const source=readFileSync('src/engine/af-rr.ts','utf8');
 expect(()=>assertFrozenAfSampler(source)).not.toThrow();
 expect(()=>assertFrozenAfSampler(source.replace('AF_RR_CV=.22','AF_RR_CV=.23'))).toThrow(/changed after evaluation/);
 expect(()=>predictAfClock('unknown source')).toThrow(/anchor/);
});
