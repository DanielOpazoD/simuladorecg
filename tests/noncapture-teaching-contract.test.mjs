import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertNoncaptureTeachingScope} from '../scripts/lib/noncapture-teaching-contract.mjs';
const current=readFileSync('src/presets/teaching-limits.ts','utf8');
const historical=current.replace('import { isVviNoncapture } from "../engine/vvi-demand";\n','').replace(' || isVviNoncapture(c)','').replace('ST y T secundarios aproximados, acoplados a la activación QRS. La amplitud y la relación ST/QRS no están calibradas clínicamente; no permiten validar criterios proporcionales de Sgarbossa.','Repolarización secundaria aproximada: al variar el voltaje QRS, la relación ST/QRS no está calibrada. Este modelo no permite validar criterios proporcionales de Sgarbossa.');
it('admits only the explicitly declared no-activation warning guard',()=>{
 expect(()=>assertNoncaptureTeachingScope(current,historical)).not.toThrow();
 for(const mutation of [current.replace(' || isVviNoncapture(c)',''),current.replace('c.rhythm === "vf"','true'),current.replace('no están calibradas clínicamente','están calibradas clínicamente')]){
  expect(mutation).not.toBe(current);expect(()=>assertNoncaptureTeachingScope(mutation,historical)).toThrow();
 }
});
