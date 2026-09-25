/** Verify the served build, not a development server or an assertion in README. */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base=process.env.ECG_TEST_URL || 'http://127.0.0.1:5173/';
const expected=process.env.ECG_EXPECT_COMMIT || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const files=async dir=>{const all=[];for(const entry of await readdir(dir,{withFileTypes:true})) {
 const name=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await files(name));else all.push(name);
}return all;};
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
assert.match(expected,/^[a-f0-9]{40}$/);assert.equal(info.commit,expected,'built commit differs from tested commit');
assert.equal(info.dirty,false,'production build has uncommitted product changes');
assert.equal(info.clinicalValidation,false);
assert.equal(info.packageVersion,JSON.parse(await readFile('package.json','utf8')).version);
const inputs=[...await files('src'),...await files('public'),'index.html','package.json','package-lock.json','vite.config.ts'].sort();
const hash=createHash('sha256');for(const file of inputs)hash.update(file+'\0').update(await readFile(file)).update('\0');
assert.equal(info.sourceSha256,hash.digest('hex'),'source fingerprint differs');
const checked=[];
for(const file of await files('dist')){
 const route=path.relative('dist',file).split(path.sep).join('/');
 const response=await fetch(new URL(route==='index.html'?'':route,base),{signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,route);
 const actual=Buffer.from(await response.arrayBuffer()),disk=await readFile(file);
 assert.equal(sha(actual),sha(disk),`served bytes differ: ${route}`);
 checked.push({path:route,sha256:sha(disk),bytes:disk.length});
}
const html=await readFile('dist/index.html','utf8');
assert.doesNotMatch(html,/\/src\/|@vite\/client/,'development entry in production');
assert.match(html,/\/assets\/[^"']+\.js/);
const dir=path.resolve(process.env.ECG_EVIDENCE_DIR || '.sites-runtime/browser');await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'production-identity.json'),JSON.stringify({expectedCommit:expected,buildInfo:info,files:checked,url:base},null,2));
console.log(JSON.stringify({productionVerified:true,commit:expected,files:checked.length}));
