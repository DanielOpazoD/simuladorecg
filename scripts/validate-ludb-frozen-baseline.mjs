/** Immutable baseline on the original 40 records. Candidate is allowed only with identical analyzer bytes. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLudb, fourLeadWaveReference } from '../tests/reference/ludb/load-ludb.mjs';
import { assessRecord, poolRecords } from './lib/ludb-frozen-baseline.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function arg(k){const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error(k+' requires a value');return process.argv[i+1];}
const root=resolve(arg('--source-root')),fixtures=resolve(arg('--fixtures')),out=resolve(arg('--output'));
const role=arg('--role'),commit=arg('--commit');
if(!['baseline','candidate'].includes(role))throw new Error('Invalid role');
const protocolBytes=readFileSync('benchmarks/ludb-baseline/protocol.json'),p=JSON.parse(protocolBytes);
if(p.holdoutEvaluated||!p.noAlgorithmChanges)throw new Error('Frozen baseline scope changed');
if(role==='baseline'&&commit!==p.baselineCommit)throw new Error('Wrong baseline commit');
if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw new Error('Claimed commit is not checked out');
const cohortBytes=readFileSync(p.cohortProtocol),cohort=JSON.parse(cohortBytes);
if(hash(cohortBytes)!==p.cohortProtocolSha256)throw new Error('Historical cohort protocol changed');
const manifestBytes=readFileSync(resolve(fixtures,'manifest.json')),manifest=JSON.parse(manifestBytes);
if(manifest.protocolSha256!==p.cohortProtocolSha256)throw new Error('Wrong fixture protocol');
const ids=manifest.records.map(r=>Number(r.record)).sort((a,b)=>a-b);
if(JSON.stringify(ids)!==JSON.stringify(cohort.records)||manifest.records.some(r=>r.split!==p.split))throw new Error('Missing, extra or wrong cohort records');
const reserved=JSON.parse(readFileSync('tests/reference/ludb-delineation/protocol.json'));
if(reserved.holdoutEnabled||ids.some(id=>reserved.holdout.records.includes(id)||reserved.calibration.records.includes(id)))throw new Error('Cohort contamination');
for(const [file,expected] of Object.entries(p.analyzerFiles))
  if(hash(readFileSync(resolve(root,file)))!==expected)throw new Error('Frozen analyzer changed: '+file);
mkdirSync('.sites-runtime',{recursive:true});
const bundle=resolve('.sites-runtime/frozen-ludb-'+role+'.mjs');
const result=await build({absWorkingDir:root,entryPoints:[p.analysisEntry],bundle:true,platform:'node',format:'esm',metafile:true,outfile:bundle});
if(JSON.stringify(Object.keys(result.metafile.inputs).sort())!==JSON.stringify(Object.keys(p.analyzerFiles).sort()))throw new Error('Unexpected analyzer dependency');
const {analyzeSamples}=await import(pathToFileURL(bundle));
const samplesHash=s=>hash(Buffer.concat(Object.keys(s.leads).sort().map(k=>Buffer.from(s.leads[k].buffer,s.leads[k].byteOffset,s.leads[k].byteLength))));
const records=cohort.records.map(id=>{
  const {signal,metadata}=loadLudb(fixtures,p.split,id),before=samplesHash(signal);
  const references=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
  let measurement;
  const report=assessRecord(signal,references,x=>{measurement=analyzeSamples(x);return measurement;},p);
  if(samplesHash(signal)!==before)throw new Error('Analyzer mutated physical input: '+id);
  return {id,physicalSamplesSha256:before,unassignedBoundaryEvents:metadata.unassignedBoundaryEvents,measurement,...report};
});
const evaluationFiles=['scripts/validate-ludb-frozen-baseline.mjs','scripts/lib/ludb-frozen-baseline.mjs',
  'scripts/lib/external-delineation-evaluation.mjs','scripts/lib/external-qrs-evaluation.mjs','tests/reference/ludb/load-ludb.mjs'];
const report={schemaVersion:1,role,productCommit:commit,baselineCommit:p.baselineCommit,cohortRole:p.cohortRole,
  protocolSha256:hash(protocolBytes),fixtureManifestSha256:hash(manifestBytes),analyzerFiles:p.analyzerFiles,
  evaluationFiles:Object.fromEntries(evaluationFiles.map(f=>[f,hash(readFileSync(f))])),
  statistics:p.statistics,reference:p.reference,evaluationWindow:p.evaluationWindow,
  inputContract:p.inputContract,holdoutEvaluated:false,clinicalValidation:false,
  limitations:['Known records, not a new holdout.','Micro observations are correlated within records.',
    'Record medians can summarize different beat populations; paired-beat intervals are reported separately.',
    'Clinical failure causes are not adjudicated.','Matching within 150ms is not acceptable boundary error.',
    'No aggregate wave reference is unscored; it does not prove absence of that wave.'],summary:poolRecords(records),records};
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:out,role,productCommit:commit,summary:report.summary}));
