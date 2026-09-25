/** v1.3 versus working tree, on matched synthetic samples. Not clinical validation. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const BASE = '38c0cd31b5836c96c82556d756e8150cfde99c64';
const root = process.cwd(), args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i+=2) {
 if (!['--baseline-dir','--output'].includes(args[i]) || !args[i+1]) throw new Error('Use --baseline-dir PATH and/or --output FILE');
 options[args[i]] = path.resolve(args[i+1]);
}
const temp = await mkdtemp(path.join(tmpdir(),'ecg-regional-'));
try {
 let baseDir = options['--baseline-dir'];
 if (!baseDir) {
   baseDir = path.join(temp,'base'); await mkdir(baseDir);
   const archive = execFileSync('git',['archive',BASE],{maxBuffer:100*1024*1024});
   execFileSync('tar',['-xf','-','-C',baseDir],{input:archive});
 }
 async function load(dir, name) {
   const outfile = path.join(temp, name+'.mjs');
   await build({stdin:{contents:`export {synthesize} from './src/engine/signal'; export {measure} from './src/engine/measure'; export {fromPreset,presetById,PRESETS} from './src/presets/catalog';`,resolveDir:dir},bundle:true,platform:'node',format:'esm',outfile});
   return import(pathToFileURL(outfile).href);
 }
 const [before, after] = await Promise.all([load(baseDir,'before'),load(root,'after')]);
 const outfile = path.join(temp,'metrics.mjs');
 await build({entryPoints:[path.join(root,'tests/support/morphology-metrics.ts')],bundle:true,platform:'node',format:'esm',outfile});
 const {morphologyMetrics} = await import(pathToFileURL(outfile).href);
 const detectorFiles = ['src/engine/measure.ts', ...(await readdir(path.join(root,'src/engine/analysis'))).filter(p=>p.endsWith('.ts')).sort().map(p=>'src/engine/analysis/'+p)];
 const detector = await Promise.all(detectorFiles.map(async p => {
   const a=await readFile(path.join(baseDir,p)),b=await readFile(path.join(root,p));
   return {path:p,unchanged:a.equals(b),sha256:createHash('sha256').update(b).digest('hex')};
 }));
 if (detector.some(f=>!f.unchanged)) throw new Error('Detector freeze violated');
 const rows=[];
 for(const id of ['inferior','inferior_lcx','anterior','lateral'])
 for(const phase of ['acute','hyperacute','evolving','chronic'])
 for(const filter of ['off','diagnostic']) {
   const c=after.fromPreset(after.presetById(id)); Object.assign(c,{phase,filter,hr:72,variability:0});
   const a=before.synthesize(c,10),b=after.synthesize(c,10),beat=b.events.beats.find(x=>x.time>3);
   const qrs=beat.qrs,qt=beat.qt,tStart=qt-Math.min(.22,(qt-qrs)*.68);
   const windows={baseline:[beat.time-.04,beat.time-.02],qrs:[beat.time,beat.time+qrs],t:[beat.time+tStart,beat.time+qt]};
   const leads={};
   for(const lead of Object.keys(b.leads)) leads[lead]={before:morphologyMetrics(a.leads[lead],a.fs,windows),after:morphologyMetrics(b.leads[lead],b.fs,windows)};
   // The product detector sees only samples; model windows are not passed to it.
   const am=after.measure(a),bm=after.measure(b);
   rows.push({id,phase,filter,case:c,windows,eventsUnchanged:JSON.stringify(a.events)===JSON.stringify(b.events),leads,
    detector:{before:{hr:am.hr,qrs:am.qrs,qt:am.qt},after:{hr:bm.hr,qrs:bm.qrs,qt:bm.qt}}});
 }
 const defaults=[];
 for(const p of after.PRESETS.filter(p=>p.strategy!=='pending')) {
   const c=after.fromPreset(p),a=before.synthesize(c,10),b=after.synthesize(c,10);
   let max=0; for(const l of Object.keys(b.leads)) for(let i=0;i<b.leads[l].length;i++) max=Math.max(max,Math.abs(a.leads[l][i]-b.leads[l][i]));
   defaults.push({id:p.id,maxDifferenceMv:max});
 }
 const output=options['--output'] || path.join(root,'.sites-runtime','repolarization-comparison.json');
 await mkdir(path.dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify({schema:1,base:BASE,runtime:process.version,measurementScope:'Whole signal in T window; ST can contribute. Not isolated cellular T, HATW score, or diagnostic accuracy.',windowSource:'generator events; not independent delineation',externalValidation:false,detector,defaultPresets:defaults,scenarios:rows},null,2));
 console.log(JSON.stringify({output,scenarios:rows.length,unchangedDefaults:defaults.filter(x=>x.maxDifferenceMv===0).length,detectorFrozen:detector.every(x=>x.unchanged)}));
} finally { await rm(temp,{recursive:true,force:true}); }
