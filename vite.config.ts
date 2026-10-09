import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
/** Build identity is an artefact, not a promise of deployment or clinical validation. */
function identity() {
 const root=process.cwd(),files: string[]=[];
 const walk=(dir: string)=>{for(const e of readdirSync(dir,{withFileTypes:true}))e.isDirectory()?walk(path.join(dir,e.name)):files.push(path.relative(root,path.join(dir,e.name)));};
 walk(path.join(root,'src'));
 if(existsSync(path.join(root,'public')))walk(path.join(root,'public'));
 files.push('index.html','package.json','package-lock.json','vite.config.ts');files.sort();
 const hash=createHash('sha256');for(const file of files)hash.update(file+'\0').update(readFileSync(file)).update('\0');
 // Conservative analysis source identity: every engine source, path-ordered and byte-exact.
 const analysisHash=createHash('sha256');for(const file of files.filter(f=>f.startsWith('src/engine/')))analysisHash.update(file+'\0').update(readFileSync(file)).update('\0');
 let commit='unknown',dirty=true;
 try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain','--',...files],{encoding:'utf8'}).trim();}catch{/* archive builds have no Git metadata */}
 return {commit,dirty,analysisSourceSha256:analysisHash.digest('hex'),sourceSha256:hash.digest('hex'),packageVersion:JSON.parse(readFileSync('package.json','utf8')).version,revision:'v'+JSON.parse(readFileSync('package.json','utf8')).version,clinicalValidation:false};
}
const build=identity();
export default defineConfig({
 define:{__ECG_BUILD_PROVENANCE__:JSON.stringify({appVersion:build.packageVersion,commit:build.commit,sourceSha256:build.sourceSha256,analysisSourceSha256:build.analysisSourceSha256,dirty:build.dirty})},
 server:{host:'0.0.0.0',allowedHosts:['terminal.local']},
 // Module workers (already created with type 'module'): the signal worker loads
 // each learned class model as its own chunk on demand.
 worker:{format:'es'},
 plugins:[{name:'ecg-build-identity',generateBundle(){this.emitFile({type:'asset',fileName:'build-info.json',source:JSON.stringify(build,null,2)});}}],
});
