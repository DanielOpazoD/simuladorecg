/** Generate/verify an offline blinded phenotype review. No dataset download. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, stat, mkdtemp, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLudb } from '../tests/reference/ludb/load-ludb.mjs';
import { assertSampleOnlyImports, linearSummary } from './lib/ptbxl-morphology.mjs';
import { sha256, json, ID, HASH, validateProtocol, blindRoster, reviewTemplate, assessReviews, paperSVG } from './lib/blind-clinical-review.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURES = path.join(ROOT, 'tests/reference/ludb/fixtures');
const DEFAULT_PROTOCOL = path.join(ROOT, 'benchmarks/clinical-review/protocol-v1.json');
const LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const inside = (a,b) => { const rel=path.relative(a,b); return rel==='' || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)); };
const must = (condition,message) => { if (!condition) throw Error(message); };
const readJSON = async file => JSON.parse(await readFile(file,'utf8'));
const fileHash = async file => sha256(await readFile(file));
async function files(dir) {
  const out=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...await files(p));else if(entry.isFile())out.push(p);else throw Error('Symlink/special file is not a frozen source: '+p);
  }
  return out;
}
async function newOutput(dir) {
  const absolute=path.resolve(dir), parent=await realpath(path.dirname(absolute));
  const resolved=path.join(parent,path.basename(absolute));
  must(!inside(ROOT,resolved),'Review outputs must stay outside the checkout');
  try { await stat(resolved); throw Error('Output already exists; never overwrite a frozen packet: '+resolved); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  return resolved;
}
async function sourceIdentity() {
  const paths=[...await files(path.join(ROOT,'src')),...await files(FIXTURES),
    ...['package.json','package-lock.json','scripts/prepare-clinical-review.mjs','scripts/lib/blind-clinical-review.mjs',
      'scripts/lib/ptbxl-morphology.mjs','tests/reference/ludb/load-ludb.mjs'].map(p=>path.join(ROOT,p))];
  const entries=await Promise.all(paths.map(async p=>({path:path.relative(ROOT,p).split(path.sep).join('/'),sha256:await fileHash(p)})));
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  const dirty=!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim();
  return {commit,dirty,sourceSha256:sha256(json(entries)),files:entries};
}
async function engine() {
  const temp=await mkdtemp(path.join(tmpdir(),'ecg-blind-review-'));
  try {
    const output=path.join(temp,'engine.mjs');
    const result=await build({stdin:{contents:`export { synthesize } from './src/engine/signal';
export { PRESETS, fromPreset, patchCase } from './src/presets/catalog';
export { DEFAULT_CASE, cloneCase } from './src/engine/types';
export { renderPaper } from './src/render/ecg';
export { registerShapeModel } from './src/engine/realistic/shape-model';
export { registerIschemiaModel } from './src/engine/realistic/ischemia';`,resolveDir:ROOT,loader:'ts'},bundle:true,
      format:'esm',platform:'node',outfile:output,metafile:true,logLevel:'silent'});
    assertSampleOnlyImports(Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/')));
    const E=await import(pathToFileURL(output).href);
    for(const f of await readdir(path.join(ROOT,'src/engine/realistic/models')))
      if(f.endsWith('.json'))E.registerShapeModel(f.slice(0,-5),await readJSON(path.join(ROOT,'src/engine/realistic/models',f)));
    E.registerIschemiaModel(await readJSON(path.join(ROOT,'src/engine/realistic/ischemia/ischemia-model.json')));
    return E;
  } finally {
    must(path.dirname(path.resolve(temp))===path.resolve(tmpdir()),'Unsafe temporary cleanup');
    await rm(temp,{recursive:true,force:true});
  }
}
function physicalBytes(signal) {
  const samples=signal.leads.I.length;
  must(signal.fs===500 && samples===5000,'Review v1 requires exactly 10 seconds at 500 Hz');
  must(LEADS.every(lead=>signal.leads[lead]?.length===samples),'Mismatched physical lead dimensions');
  const bytes=Buffer.alloc(samples*LEADS.length*8);
  for(let i=0;i<samples;i++)for(let k=0;k<LEADS.length;k++) {
    const x=signal.leads[LEADS[k]]?.[i];
    must(Number.isFinite(x),'Missing/non-finite physical sample');
    bytes.writeDoubleLE(x===0?0:x,(i*LEADS.length+k)*8);
  }
  return bytes;
}
function sampledSummary(signal,metadata=null) {
  const leads={};
  for(const lead of LEADS) {
    const a=signal.leads[lead];let lo=Infinity,hi=-Infinity,sum=0;
    for(const x of a){lo=Math.min(lo,x);hi=Math.max(hi,x);sum+=x*x;}
    const beat=signal.events?.beats.find(b=>b.time>2 && b.time<6 && Number.isFinite(b.qrs));
    const annotation=metadata?.annotations[lead]?.filter(a=>a.wave==='QRS'&&a.onset!==null&&a.offset!==null)
      .sort((a,b)=>Math.abs(a.peak/metadata.fs-4)-Math.abs(b.peak/metadata.fs-4))[0];
    const window=annotation?[annotation.onset/metadata.fs,annotation.offset/metadata.fs]
      :beat?[beat.time,beat.time+beat.qrs]:null;
    let qrs=null;
    if(window){
      const [start,end]=window,from=Math.ceil(start*signal.fs),to=Math.floor(end*signal.fs);
      if(from>=0&&to<a.length&&to>from){let min=Infinity,max=-Infinity,area=0;
        for(let i=from;i<=to;i++){min=Math.min(min,a[i]);max=Math.max(max,a[i]);if(i>from)area+=(a[i]+a[i-1])/(2*signal.fs);}
        qrs={windowSeconds:window,windowSource:annotation?'human per-lead LUDB annotation':'synthetic event support; not independent delineation',
          peakToPeakMv:max-min,areaFromZeroMvS:area};
      }
    }
    leads[lead]={wholeTracePeakToPeakMv:hi-lo,wholeTraceRmsMv:Math.sqrt(sum/a.length),qrs};
  }
  return {role:'Descriptive surface-sample metrics only, no diagnostic thresholds or validity score',
    qrsAreaReference:'Raw zero, not an adjudicated isoelectric baseline; independent atrial activity may overlap',leads};
}

export async function generateReviewPacket(readerDir,coordinatorDir,protocolFile=DEFAULT_PROTOCOL,blindingKeyFile=null) {
  const publicDir=await newOutput(readerDir), privateDir=await newOutput(coordinatorDir);
  must(!inside(publicDir,privateDir)&&!inside(privateDir,publicDir),'Reader and coordinator outputs must be separate sibling locations');
  const protocol=validateProtocol(await readJSON(protocolFile)), protocolBytes=Buffer.from(json(protocol));
  const protocolSha256=sha256(protocolBytes), source=await sourceIdentity(), E=await engine();
  for(const row of protocol.synthetic)must(E.PRESETS.some(p=>p.id===row.preset&&p.strategy!=='pending'),'Unknown or pending preset in frozen protocol: '+row.preset);
  const items=protocol.synthetic.flatMap(p=>p.variants.map(variant=>({kind:'synthetic',preset:p.preset,variant})));
  items.push(...protocol.external.records.map(record=>({kind:'exposed-LUDB-control',record})));
  // Reusing the private key is an explicit replay, never a new independent round.
  const secret=blindingKeyFile?await readFile(blindingKeyFile):randomBytes(32), roster=blindRoster(items,secret);
  const packageId=sha256(Buffer.concat([secret,Buffer.from(protocolSha256+source.sourceSha256)]));
  await mkdir(publicDir);await mkdir(privateDir);
  await writeFile(path.join(privateDir,'protocol.json'),protocolBytes);
  await writeFile(path.join(privateDir,'source-provenance.json'),json(source));
  await writeFile(path.join(privateDir,'blinding-key.bin'),secret);
  const keys=[],cases=[],metrics=[],exclusions=[],privateFiles=[],publicFiles=[];
  const put=async(dir,file,bytes,list)=>{await writeFile(path.join(dir,file),bytes);list.push({file,sha256:sha256(bytes)});};
  const view={...E.DEFAULT_CASE.view,mode:'paper',format:'3x4+1',speed:25,gain:10,chestGain:10,
    fit:true,pxPerMm:4,palette:'paper',grid:true,cabrera:false,timing:'sequential'};
  for(const row of roster){
    let signal,c,metadata=null;
    try {
      if(row.source.kind==='synthetic'){
        const p=E.PRESETS.find(p=>p.id===row.source.preset&&p.strategy!=='pending');
        must(!!p,'Unknown or pending preset');
        c=E.fromPreset(p);
        if(row.source.variant!=='preset')c=E.patchCase(c,{seed:row.source.variant});
        c={...c,acquisition:'ideal',filter:'off',notch:0,view};
        c.artifacts={...c.artifacts,baseline:0,muscle:0,mains:0,loose:0,reversed:false};
        signal=E.synthesize(c,10);
      }else{
        const split=Number(row.source.record)<100?'development':'control';
        const loaded=loadLudb(FIXTURES,split,row.source.record);metadata=loaded.metadata;
        must(metadata.channels.every(x=>x.unit==='mV'),'External units are not established mV');
        signal={...loaded.signal,duration:10,events:{atria:[],beats:[],spikes:[]}};
        c={...E.cloneCase(E.DEFAULT_CASE),name:'',presetId:'custom',view};
      }
      const bytes=physicalBytes(signal),file=`${row.id}.svg`,sampleFile=`${row.id}.f64`;
      await put(privateDir,sampleFile,bytes,privateFiles);
      const svg=paperSVG(E.renderPaper,signal,c,row.id);
      await put(publicDir,file,svg,publicFiles);
      cases.push({id:row.id,file,svgSha256:sha256(svg),fs:signal.fs,samples:5000});
      keys.push({id:row.id,source:row.source,case:row.source.kind==='synthetic'?c:null,
        sourceRole:row.source.kind==='synthetic'?'generated teaching phenotype':'already-exposed LUDB regression control; not a holdout',
        sampleFile,physicalSha256:sha256(bytes)});
      metrics.push({id:row.id,...sampledSummary(signal,metadata)});
    }catch(error){
      // A missing/corrupt reference is an integrity failure, not an exclusion.
      if(row.source.kind!=='synthetic')throw error;
      // Only a declared generator-domain rejection may be retained as unrepresented.
      if(error.name!=='ModelScopeError')throw error;
      exclusions.push({id:row.id,source:row.source,reason:error.message});
    }
  }
  must(cases.length>0,'No representable review cases');
  const duplicateGroups=Object.values(Object.groupBy(keys,c=>c.physicalSha256)).filter(x=>x.length>1).map(rows=>rows.map(x=>x.id));
  await put(privateDir,'case-key.json',json({packageId,keys,exclusions,duplicateGroups,
    independence:'Different seeds or labels do not establish different patients; identical waveform hashes are reported, never independent evidence'}),privateFiles);
  await put(privateDir,'sample-metrics.json',json(metrics),privateFiles);
  const familySummary={};
  for(const [family,rows] of Object.entries(Object.groupBy(keys,k=>k.source.kind==='synthetic'?k.source.preset:'LUDB-exposed-heterogeneous'))){
    const ids=new Set(rows.map(r=>r.id)), selected=metrics.filter(m=>ids.has(m.id));
    familySummary[family]={records:rows.length,uniqueWaveforms:new Set(rows.map(r=>r.physicalSha256)).size,
      role:'Descriptive convenience selection, not normal ranges, diagnosis adjudication or population validity',
      leads:Object.fromEntries(LEADS.map(lead=>[lead,Object.fromEntries([
        ['wholeTraceRmsMv',m=>m.leads[lead].wholeTraceRmsMv],
        ['wholeTracePeakToPeakMv',m=>m.leads[lead].wholeTracePeakToPeakMv],
        ['qrsPeakToPeakMv',m=>m.leads[lead].qrs?.peakToPeakMv],
      ].map(([field,get])=>[field,linearSummary(selected.map(get))]))]))};
  }
  await put(privateDir,'family-sample-summary.json',json(familySummary),privateFiles);
  const manifest={kind:'ecg-blind-phenotype-packet',schemaVersion:1,packageId,protocolSha256,
    sourceSha256:source.sourceSha256,clinicalValidation:false,
    role:'Development phenotype review with hidden source labels; not a clinical validation or independent holdout',cases,files:publicFiles};
  await put(publicDir,'reader-a-template.json',json(reviewTemplate(manifest)),publicFiles);
  await put(publicDir,'reader-b-template.json',json(reviewTemplate(manifest)),publicFiles);
  const html=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Lectura ciega ECG</title><style>body{font:18px system-ui;margin:24px;color:#123}img{display:block;width:100%;min-width:900px}section{overflow:auto;border-top:1px solid #aaa;margin:30px 0}h2{font-size:18px}</style><h1>Lectura ciega de fenotipos ECG</h1><p>Describe los hallazgos visibles, su plausibilidad, legibilidad y cualquier error docente mayor. El origen y la intención están ocultos. No se pide inferir una arteria culpable ni validar un diagnóstico por una etiqueta. Conserva lectura independiente sin claves.</p><p>Escala uniforme: 25 mm/s y 10 mm/mV. El tamaño físico depende de impresión al 100%; las proporciones señal/cuadrícula se conservan al ampliar. Guarda la lectura fuera de esta carpeta, sin modificar los trazados.</p>${cases.map(c=>`<section><h2>${c.id}</h2><img src="${c.file}" alt="${c.id}" loading="lazy"></section>`).join('')}</html>\n`;
  await put(publicDir,'index.html',html,publicFiles);
  if(protocol.external.records.length){
    await put(publicDir,'LICENSE-LUDB.txt',await readFile(path.join(FIXTURES,'LICENSE-LUDB.txt')),publicFiles);
    await put(publicDir,'ATTRIBUTION.txt',`Some traces are derived from the Lobachevsky University Electrocardiography Database (LUDB), version 1.0.1.\nSource: https://physionet.org/content/ludb/1.0.1/\nDOI: https://doi.org/10.13026/eegm-h675\nLicense: Open Data Commons Attribution License v1.0; see LICENSE-LUDB.txt.\nTraces are decoded to physical mV and rendered with the same review-paper geometry. Source identity remains with the coordinator during blinded reading.\nThe selected records were already exposed in project regression tests; they are not an untouched holdout.\n`,publicFiles);
  }
  await writeFile(path.join(publicDir,'manifest.json'),json(manifest));
  await put(privateDir,'adjudication-template.json',json(reviewTemplate(manifest,'adjudication')),privateFiles);
  for(const file of ['protocol.json','source-provenance.json','blinding-key.bin'])privateFiles.push({file,sha256:await fileHash(path.join(privateDir,file))});
  const after=await sourceIdentity();
  must(after.commit===source.commit&&after.sourceSha256===source.sourceSha256,'Source changed while freezing the packet; discard this incomplete output');
  const seal={kind:'ecg-blind-phenotype-seal',schemaVersion:1,packageId,manifestSha256:await fileHash(path.join(publicDir,'manifest.json')),privateFiles};
  await writeFile(path.join(privateDir,'seal.json'),json(seal));
  return {reviewState:'pending-human-review',clinicalValidation:false,readerDir:publicDir,coordinatorDir:privateDir,
    packageId,sealSha256:sha256(json(seal)),cases:cases.length,exclusions:exclusions.length,duplicateGroups:duplicateGroups.length,
    exposedExternalControls:protocol.external.records.length,untouchedExternalHoldout:false,
    sourceCommit:source.commit,sourceDirty:source.dirty,
    instruction:'Pin sealSha256 outside both folders. Share only readerDir. Two independent human readings and later key-based adjudication remain required.'};
}

export async function verifyReviewPacket(readerDir,coordinatorDir,expectedSealSha256,readingFiles=[],adjudicationFile=null) {
  must(HASH.test(expectedSealSha256),'An externally pinned seal SHA-256 is required');
  const sealBytes=await readFile(path.join(coordinatorDir,'seal.json'));
  must(sha256(sealBytes)===expectedSealSha256,'Frozen seal SHA-256 mismatch');
  const seal=JSON.parse(sealBytes), manifestBytes=await readFile(path.join(readerDir,'manifest.json'));
  must(seal.kind==='ecg-blind-phenotype-seal'&&seal.schemaVersion===1&&sha256(manifestBytes)===seal.manifestSha256,'Reader manifest integrity mismatch');
  const manifest=JSON.parse(manifestBytes);
  must(manifest.kind==='ecg-blind-phenotype-packet'&&manifest.schemaVersion===1&&manifest.clinicalValidation===false&&
    manifest.packageId===seal.packageId&&HASH.test(manifest.protocolSha256)&&HASH.test(manifest.sourceSha256)&&
    Array.isArray(manifest.cases)&&manifest.cases.length>0&&Array.isArray(manifest.files),'Invalid sealed manifest');
  const verifyFiles=async(dir,entries)=>{
    const seen=new Set();
    for(const item of entries){
      must(typeof item.file==='string'&&/^[A-Za-z0-9_.-]+$/.test(item.file)&&!seen.has(item.file)&&HASH.test(item.sha256),'Unsafe or duplicate sealed file');
      seen.add(item.file);must(await fileHash(path.join(dir,item.file))===item.sha256,'Frozen file integrity mismatch: '+item.file);
    }
    return seen;
  };
  const publicSet=await verifyFiles(readerDir,manifest.files);
  const privateSet=await verifyFiles(coordinatorDir,seal.privateFiles);
  const actualPublic=await readdir(readerDir,{withFileTypes:true});
  must(actualPublic.every(e=>e.isFile()&&(e.name==='manifest.json'||publicSet.has(e.name)))&&
    actualPublic.length===publicSet.size+1,'Unexpected content in reader packet; keep keys and submitted reviews outside it');
  const protocol=validateProtocol(await readJSON(path.join(coordinatorDir,'protocol.json')));
  must(sha256(json(protocol))===manifest.protocolSha256,'Protocol hash mismatch');
  const provenance=await readJSON(path.join(coordinatorDir,'source-provenance.json'));
  must(provenance.sourceSha256===manifest.sourceSha256&&sha256(json(provenance.files))===manifest.sourceSha256,'Source provenance mismatch');
  const key=await readJSON(path.join(coordinatorDir,'case-key.json'));
  must(key.packageId===manifest.packageId&&Array.isArray(key.keys)&&key.keys.length===manifest.cases.length,'Private case key mismatch');
  const seen=new Set();
  for(const c of manifest.cases){
    must(ID.test(c.id)&&!seen.has(c.id)&&c.file===`${c.id}.svg`&&c.fs===500&&c.samples===5000&&
      HASH.test(c.svgSha256),'Invalid or duplicate case identity');seen.add(c.id);
    must(publicSet.has(c.file)&&await fileHash(path.join(readerDir,c.file))===c.svgSha256,'Trace identity mismatch');
    const k=key.keys.find(x=>x.id===c.id);
    must(k&&k.sampleFile===`${c.id}.f64`&&privateSet.has(k.sampleFile)&&HASH.test(k.physicalSha256),'Physical identity mismatch');
    const raw=await readFile(path.join(coordinatorDir,k.sampleFile));
    must(raw.length===5000*12*8&&sha256(raw)===k.physicalSha256,'Physical samples checksum/dimensions mismatch');
    for(let i=0;i<raw.length;i+=8)must(Number.isFinite(raw.readDoubleLE(i)),'Non-finite sealed physical sample');
  }
  const readReview=async file=>{const bytes=await readFile(file);must(bytes.length<2*1024*1024,'Review file too large');return {bytes,value:JSON.parse(bytes)};};
  const readings=await Promise.all(readingFiles.map(readReview));
  const adjudication=adjudicationFile?await readReview(adjudicationFile):null;
  const assessment=assessReviews(manifest,readings,adjudication);
  if(key.exclusions.length){assessment.reviewState='incomplete-protocol-coverage';assessment.issues.push('Declared generator exclusions remain outside the reviewed protocol coverage');}
  return {packetIntegrity:'verified-against-pinned-seal',...assessment,
    exclusions:key.exclusions,duplicateGroups:key.duplicateGroups,untouchedExternalHoldout:false,
    cohortRole:'Synthetic development phenotypes plus already-exposed external regression controls; no population-level clinical validation'};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const [mode,...args]=process.argv.slice(2);let result;
    if(mode==='generate'&&args.length>=2&&args.length<=4)result=await generateReviewPacket(...args);
    else if(mode==='verify'&&args.length>=3&&args.length<=6)result=await verifyReviewPacket(args[0],args[1],args[2],args.slice(3,5),args[5]??null);
    else throw Error('Usage: prepare-clinical-review.mjs generate READER_DIR COORDINATOR_DIR [PROTOCOL.json [PRIVATE_REPLAY_KEY.bin]] | verify READER_DIR COORDINATOR_DIR PINNED_SEAL_SHA [READING_A.json READING_B.json ADJUDICATION.json]');
    console.log(json(result));
    if(result.reviewState!=='review-records-complete-not-clinical-validation')process.exitCode=2;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
