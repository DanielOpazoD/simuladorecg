/** Evaluate sample-only P/QRS/T delineation on the fixed calibration cohort. */
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reportIdentity} from './lib/report-identity.mjs';
import {loadLudb,fourLeadWaveReference} from '../tests/reference/ludb/load-ludb.mjs';
import {assessExternalDelineation,poolExternalDelineation} from './lib/external-delineation-evaluation.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function arg(name){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error(name+' requires a value');return process.argv[i+1];}
const fixture=resolve(arg('--fixtures')),output=resolve(arg('--output')),sourceRoot=resolve(arg('--source-root'));
const productCommit=arg('--commit'),role=arg('--role');
if(!['baseline','candidate'].includes(role))throw new Error('role must be baseline or candidate');
const protocolBytes=readFileSync('tests/reference/ludb-delineation/protocol.json'),protocol=JSON.parse(protocolBytes);
if(protocol.holdoutEnabled)throw new Error('Reserved holdout cannot run in calibration workflow');
const manifest=JSON.parse(readFileSync(resolve(fixture,'manifest.json')));
if(manifest.protocolSha256!==sha(protocolBytes))throw new Error('Fixtures/protocol mismatch');
if(manifest.reservedHoldoutDownloaded!==false)throw new Error('Holdout contamination flag');
if(JSON.stringify(manifest.records.map(r=>Number(r.record)).sort((a,b)=>a-b))!==JSON.stringify(protocol.calibration.records))
  throw new Error('Missing/extra calibration record');
mkdirSync('.sites-runtime',{recursive:true});
const bundle=resolve('.sites-runtime/ludb-delineation-'+role+'.mjs');
await build({entryPoints:[resolve(sourceRoot,protocol.analysisEntry)],bundle:true,platform:'node',format:'esm',outfile:bundle});
const {analyzeSamples}=await import(pathToFileURL(bundle));
if(typeof analyzeSamples!=='function')throw new Error('sample-analysis entry must export analyzeSamples');
const records=protocol.calibration.records.map(id=>{
  const {signal,metadata}=loadLudb(fixture,'delineation-calibration',id);
  const references=Object.fromEntries(['P','QRS','T'].map(w=>[w,fourLeadWaveReference(metadata,w)]));
  return {id,unassignedBoundaryEvents:metadata.unassignedBoundaryEvents,
    ...assessExternalDelineation(signal,references,analyzeSamples,protocol)};
});
const report={schemaVersion:1,provenance:reportIdentity(),role,productCommit,
  baselineCommit:protocol.baselineCommit,protocolSha256:sha(protocolBytes),
  fixtureManifestSha256:sha(readFileSync(resolve(fixture,'manifest.json'))),
  cohortRole:protocol.calibration.role,holdoutEvaluated:false,clinicalValidation:false,
  inputContract:protocol.productInput,reference:protocol.reference,limitations:protocol.limitations,
  statisticalScope:'Descriptive engineering evaluation. Beats and waves are correlated within records; no patient-level inferential claim.',
  summary:poolExternalDelineation(records),records};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,role,productCommit,summary:report.summary,holdoutEvaluated:false}));
