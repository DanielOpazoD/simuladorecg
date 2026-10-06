import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
it('the AF exception does not permit changing or adding any historical reference',()=>{
 const yaml=readFileSync('.github/workflows/t-peak-evidence.yml','utf8');
 expect(yaml).toContain("HEAD -- src/presets public benchmarks tests/reference ':(exclude)benchmarks/af-rhythm/**'");
 const root=mkdtempSync(path.join(tmpdir(),'ecg-reference-freeze-'));
 const git=(...args)=>spawnSync('git',args,{cwd:root,encoding:'utf8'});
 const put=(name,text)=>{const p=path.join(root,name);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,text);};
 try{
  expect(git('init','-q').status).toBe(0);
  put('benchmarks/hr-quality/protocol.json','original');
  expect(git('add','.').status).toBe(0);
  expect(git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline').status).toBe(0);
  const base=git('rev-parse','HEAD').stdout.trim();
  const check=()=>git('diff','--exit-code',base,'--','src/presets','public','benchmarks','tests/reference',':(exclude)benchmarks/af-rhythm/**').status;
  put('benchmarks/af-rhythm/protocol.json','new independent protocol');git('add','.');expect(check()).toBe(0);
  put('benchmarks/hr-quality/protocol.json','changed');expect(check()).toBe(1);
  put('benchmarks/hr-quality/protocol.json','original');
  put('benchmarks/unknown/protocol.json','unknown');git('add','.');expect(check()).toBe(1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
