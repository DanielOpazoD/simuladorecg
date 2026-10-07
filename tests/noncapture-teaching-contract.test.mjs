import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertNoncaptureTeachingScope} from '../scripts/lib/noncapture-teaching-contract.mjs';
const current=readFileSync('src/presets/teaching-limits.ts','utf8');
const historical=current.replace('import { isVviNoncapture } from "../engine/vvi-demand";\n','').replace(' || isVviNoncapture(c)','').replace('La T secundaria es aproximada; el ST secundario no está representado. Un ST plano no demuestra repolarización normal. La relación ST/QRS no está calibrada y no permite validar criterios proporcionales de Sgarbossa.','Repolarización secundaria aproximada: al variar el voltaje QRS, la relación ST/QRS no está calibrada. Este modelo no permite validar criterios proporcionales de Sgarbossa.');
it('admits only the explicitly declared no-activation warning guard',()=>{
 expect(()=>assertNoncaptureTeachingScope(current,historical)).not.toThrow();
 for(const mutation of [current.replace(' || isVviNoncapture(c)',''),current.replace('c.rhythm === "vf"','true'),current.replace('no está calibrada','está calibrada')]){
  expect(mutation).not.toBe(current);expect(()=>assertNoncaptureTeachingScope(mutation,historical)).toThrow();
 }
});
