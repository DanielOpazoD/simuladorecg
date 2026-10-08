import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
/** Preserve historical depolarization/amplitude assertions without pretending
 * the new secondary ST is a fixed, unrelated component. Actual ST is checked by
 * the complete source prediction, intervention tests and paired source gates.
 * WPW also restores the exact previous primary-T branch for these historical
 * amplitude assertions; its actual new source has a separate mandatory gate. */
export function withoutSecondarySTPlugin(){return{name:'depolarization-only-reference',setup(build){
 build.onLoad({filter:/\/secondary-repolarization\.ts$/},async args=>{
  const source=await readFile(args.path,'utf8');
  const wpw='  if(!source&&c.conduction==="wpw"&&b.kind==="normal"){\n    mode="preexcited-qrs";reference=preexcitedActivationReference(c,ks,c.qrs/1000);\n  }\n';
  assert.equal(source.split(wpw).length,2,'Unreviewed WPW historical counterfactual');
  const anchor='const st=c.rhythm === "torsades" ? null : reference.map(v=>-.20*v) as Vec;';
  assert.equal(source.split(anchor).length,2,'Unreviewed secondary-ST counterfactual');
  return{contents:source.replace(anchor,'const st=null;').replace(wpw,''),loader:'ts'};
 });
}};}
