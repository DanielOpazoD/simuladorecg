import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertConfidenceCounterfactual} from '../scripts/lib/confidence-counterfactual.mjs';
import {OPPOSED_CYCLE_REVISION,assertQualityOnlyRevision} from '../scripts/lib/opposed-cycle-revision.mjs';

it('substitutes exactly the verified historical policy and detects other changes',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'confidence-counterfactual-test-'));
 try {
  const before=path.join(temp,'before');
  // Unit tests must also work in a shallow checkout or source ZIP. This
  // frozen predecessor is checked against the same required historical hash;
  // the full-history regression jobs exercise prepareConfidenceCounterfactual.
  await mkdir(before);
  await cp('src',path.join(before,'src'),{recursive:true});
  await writeFile(path.join(before,OPPOSED_CYCLE_REVISION.file),
    await readFile('tests/reference/alternating-confidence-v1.txt'));
  const evidence=await assertConfidenceCounterfactual(process.cwd(),before);
  expect(evidence.comparison).toBe('single-policy-substitution');
  const changed=Object.entries(evidence.sourceHashes).filter(([,h])=>h.current!==h.previous).map(([f])=>f);
  expect(changed).toEqual([OPPOSED_CYCLE_REVISION.file]);
  const file=path.join(before,'src/engine/measure.ts'),original=await readFile(file);
  await writeFile(file,Buffer.concat([original,Buffer.from('\n')]));
  await expect(assertConfidenceCounterfactual(process.cwd(),before)).rejects.toThrow(/another source/);
  await writeFile(file,original);
  const policy=path.join(before,OPPOSED_CYCLE_REVISION.file);
  await writeFile(policy,(await readFile(policy,'utf8'))+'\n');
  await expect(assertConfidenceCounterfactual(process.cwd(),before)).rejects.toThrow(/historical confidence/);
 } finally {await rm(temp,{recursive:true,force:true});}
});

it('keeps every numerical field and evidence support in the strict equality contract',()=>{
 const before={hr:60,tAxis:35,qtc:{fridericia:420},beats:[{onset:1}],
  evidence:{hr:{status:'usable',reason:'before',count:8,total:8,spread:0}}};
 const after={...before,evidence:{hr:{...before.evidence.hr,status:'review',reason:'after'}}};
 expect(()=>assertQualityOnlyRevision(before,after)).not.toThrow();
 for(const mutation of [{hr:61},{tAxis:36},{qtc:{fridericia:421}},{beats:[{onset:1.001}]}])
  expect(()=>assertQualityOnlyRevision(before,{...after,...mutation})).toThrow(/numerical/);
 expect(()=>assertQualityOnlyRevision(after,before)).toThrow(/promotion/);
 expect(()=>assertQualityOnlyRevision(before,{...after,evidence:{hr:{...after.evidence.hr,count:7}}})).toThrow(/support/);
 expect(()=>assertQualityOnlyRevision(before,{...after,evidence:{hr:{...after.evidence.hr,status:'unavailable'}}})).toThrow(/abstention/);
});
