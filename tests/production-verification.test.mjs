import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/verify-production.mjs',import.meta.url));
const commit='1234567890123456789012345678901234567890';
let root,server,url,corrupt=false;
const sources={
 'src/engine/probe.ts':'export const sample = 1;\r\n',
 'public/probe.txt':'original bytes\r\n',
 'index.html':'<main>source</main>',
 'package.json':JSON.stringify({version:'1.0.0'}),
 'package-lock.json':'{}',
 'vite.config.ts':'export default {};',
 'scripts/lib/build-source-identity.ts':'export const protocol = 1;\n',
};
const put=async(relative,value)=>{const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,value);};
async function run(){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script],{cwd:root,env:{...process.env,ECG_TEST_URL:url,ECG_EXPECT_COMMIT:commit,ECG_EVIDENCE_DIR:path.join(root,'evidence')},windowsHide:true});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));
 });
}
beforeAll(async()=>{
 root=await mkdtemp(path.join(tmpdir(),'ecg-production-verifier-'));
 for(const [name,content] of Object.entries(sources))await put(name,content);
 // An explicit portable manifest is the independent expected fixture. CRLF bytes
 // stay in the digest; the changed helper must participate too.
 const hash=createHash('sha256');for(const name of Object.keys(sources).sort())hash.update(name+'\0').update(sources[name]).update('\0');
 await put('dist/build-info.json',JSON.stringify({commit,dirty:false,clinicalValidation:false,packageVersion:'1.0.0',revision:'v1.0.0',sourceSha256:hash.digest('hex')}));
 await put('dist/index.html','<script type="module" src="/assets/main.js"></script>');await put('dist/assets/main.js','globalThis.fixture = 1;');
 server=createServer(async(req,res)=>{
  const route=req.url==='/'?'index.html':req.url.slice(1);
  try{const data=await readFile(path.join(root,'dist',route));res.end(corrupt&&route==='assets/main.js'?Buffer.concat([data,Buffer.from(' altered')]):data);}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/`;
});
afterAll(async()=>{
 if(server)await new Promise(r=>server.close(r));
 if(root){const relative=path.relative(path.resolve(tmpdir()),path.resolve(root));if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(root).startsWith('ecg-production-verifier-'))throw Error('Unexpected cleanup path');await rm(root,{recursive:true,force:true});}
});
describe('production verifier: canonical sources and independent served bytes',()=>{
 it('accepts the clean artifact with the declared helper and original CRLF bytes',async()=>{const r=await run();expect(r.code).toBe(0);expect(r.output).toContain('"productionVerified":true');});
 it('rejects a changed served asset even when source identity remains valid',async()=>{corrupt=true;try{const r=await run();expect(r.code).not.toBe(0);expect(r.output).toContain('served bytes differ: assets/main.js');}finally{corrupt=false;}});
 it('rejects changed source-identity helper bytes',async()=>{await put('scripts/lib/build-source-identity.ts','changed');try{const r=await run();expect(r.code).not.toBe(0);expect(r.output).toContain('source fingerprint differs');}finally{await put('scripts/lib/build-source-identity.ts',sources['scripts/lib/build-source-identity.ts']);}});
});
