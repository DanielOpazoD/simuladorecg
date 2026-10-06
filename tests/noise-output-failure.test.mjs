import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
it('preserves the original evaluation failure even when its output directory is new',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'noise-output-test-'));
 try{
  const raw=readFileSync('benchmarks/noise-stress/protocol.json'),p=JSON.parse(raw),input=path.join(temp,'input'),output=path.join(temp,'new-output');mkdirSync(input);
  writeFileSync(path.join(input,'noise-provenance.json'),JSON.stringify({protocolSha256:createHash('sha256').update(raw).digest('hex')}));
  writeFileSync(path.join(input,'noise-segments.json'),JSON.stringify({segments:p.records.flatMap(record=>p.segmentStartsSeconds.map(startSeconds=>({record,startSeconds})))}));
  const result=spawnSync(process.execPath,['scripts/benchmark-noise-stress.mjs',output,'--noise-dir',input,'--source-root',path.join(temp,'missing-source'),'--analyzer','worker'],{encoding:'utf8'});
  expect(result.status).not.toBe(0);
  const failure=JSON.parse(readFileSync(path.join(output,'evaluation-failure.json'),'utf8'));
  expect(failure.error).toMatch(/Could not resolve/);expect(failure.error).not.toMatch(/evaluation-failure.json/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
