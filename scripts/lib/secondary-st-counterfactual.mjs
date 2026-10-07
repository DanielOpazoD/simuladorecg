import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
/** Preserve historical depolarization/amplitude assertions without pretending
 * the new secondary ST is a fixed, unrelated component. Actual ST is checked by
 * the complete source prediction, intervention tests and paired source gates. */
export function withoutSecondarySTPlugin(){return{name:'depolarization-only-reference',setup(build){
 build.onLoad({filter:/\/secondary-repolarization\.ts$/},async args=>{
  const source=await readFile(args.path,'utf8');
  const anchor='const st=c.rhythm === "torsades" ? null : reference.map(v=>-.20*v) as Vec;';
  assert.equal(source.split(anchor).length,2,'Unreviewed secondary-ST counterfactual');
  return{contents:source.replace(anchor,'const st=null;'),loader:'ts'};
 });
}};}
