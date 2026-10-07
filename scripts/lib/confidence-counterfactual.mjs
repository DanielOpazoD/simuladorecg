import assert from 'node:assert/strict';
import {cp, mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {OPPOSED_CYCLE_REVISION as revision, assertReviewedOpposedCycle} from './opposed-cycle-revision.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function files(root, prefix='src') {
 const result=[];
 for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})) {
  const file=path.join(prefix,entry.name);
  if(entry.isDirectory())result.push(...await files(root,file));
  else {assert.ok(entry.isFile(),'Source must contain ordinary files: '+file);result.push(file);}
 }
 return result.sort();
}
export async function assertConfidenceCounterfactual(current, previous) {
 const names=await files(current);assert.deepEqual(await files(previous),names,'Counterfactual source inventory differs');
 const hashes={};
 for(const file of names) {
  const a=await readFile(path.join(current,file)),b=await readFile(path.join(previous,file));
  if(file===revision.file) {
   assertReviewedOpposedCycle(a);assert.equal(hash(b),revision.before,'Unreviewed historical confidence policy');
  } else assert.deepEqual(b,a,'Counterfactual changed another source file: '+file);
  hashes[file]={current:hash(a),previous:hash(b)};
 }
 assert.ok(names.includes(revision.file),'Missing confidence policy');
 return {comparison:'single-policy-substitution',historicalPolicyCommit:revision.baselineCommit,sourceHashes:hashes};
}
export async function prepareConfidenceCounterfactual(current, destination) {
 await mkdir(destination);
 await cp(path.join(current,'src'),path.join(destination,'src'),{recursive:true});
 const original=execFileSync('git',['-C',current,'show',revision.baselineCommit+':'+revision.file]);
 assert.equal(hash(original),revision.before,'Historical confidence bytes changed');
 await writeFile(path.join(destination,revision.file),original);
 return assertConfidenceCounterfactual(current,destination);
}
