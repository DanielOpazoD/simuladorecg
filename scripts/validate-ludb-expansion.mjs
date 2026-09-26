/** Fixed-cohort evaluation only; never synthesize() or auditMeasurement(). */
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reportIdentity} from './lib/report-identity.mjs';
import {loadLudb,fourLeadQrsReference} from '../tests/reference/ludb/load-ludb.mjs';
import {assessExternalQrs,poolExternalQrs} from './lib/external-qrs-evaluation.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function arg(name){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw new Error(name+' requires a path');return resolve(process.argv[i+1]);}
function optionalArg(name,fallback){const i=process.argv.indexOf(name);return i<0?resolve(fallback):resolve(process.argv[i+1]);}
const fixture=arg('--fixtures'),output=arg('--output'),sourceRoot=optionalArg('--source-root','.');
const source=file=>resolve(sourceRoot,file);
const protocolBytes=readFileSync('tests/reference/ludb-expansion/protocol.json'),protocol=JSON.parse(protocolBytes);
for(const [file,digest] of Object.entries(protocol.analyzerFiles))if(sha(readFileSync(source(file)))!==digest)throw new Error('Frozen analyzer changed: '+file);
const manifest=JSON.parse(readFileSync(resolve(fixture,'manifest.json')));
if(manifest.protocolSha256!==sha(protocolBytes))throw new Error('Fixtures/protocol mismatch');
if(JSON.stringify(manifest.records.map(r=>Number(r.record)).sort((a,b)=>a-b))!==JSON.stringify(protocol.records))throw new Error('Missing/extra cohort record');
mkdirSync('.sites-runtime',{recursive:true});
const bundle=resolve('.sites-runtime/ludb-independent-measure.mjs');
const built=await build({entryPoints:[source('src/engine/measure.ts')],bundle:true,platform:'node',format:'esm',metafile:true,outfile:bundle});
const analyzerInputs=Object.keys(built.metafile.inputs).map(input=>relative(sourceRoot,resolve(input))).sort();
if(JSON.stringify(analyzerInputs)!==JSON.stringify(Object.keys(protocol.analyzerFiles).sort()))throw new Error('Unexpected analyzer dependency');
const {measure}=await import(pathToFileURL(bundle));
const records=protocol.records.map(id=>{const {signal,metadata}=loadLudb(fixture,'expansion',id);return {id,unassignedBoundaryEvents:metadata.unassignedBoundaryEvents,...assessExternalQrs(signal,fourLeadQrsReference(metadata),measure,protocol.eventMatchToleranceSeconds)};});
const evaluationFiles=Object.fromEntries(['scripts/validate-ludb-expansion.mjs','scripts/lib/external-qrs-evaluation.mjs','scripts/prepare-ludb-expansion.py','tests/reference/ludb/prepare_ludb.py','tests/reference/ludb/load-ludb.mjs'].map(f=>[f,sha(readFileSync(f))]));
const report={schemaVersion:1,provenance:reportIdentity(),evaluationFiles,protocolSha256:sha(protocolBytes),analyzerFiles:protocol.analyzerFiles,
  fixtureManifestSha256:sha(readFileSync(resolve(fixture,'manifest.json'))),cohortRole:protocol.cohortRole,
  clinicalValidation:false,detectorTuned:false,method:protocol.reference,matchingWindow:protocol.window,
  eventMatchToleranceSeconds:protocol.eventMatchToleranceSeconds,
  statisticalScope:'Descriptive only; correlated beats are not independent patients. Micro and macro record summaries, with explicit coverage. No before/after superiority claim.',
  limitations:protocol.outOfScope,summary:poolExternalQrs(records),records};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,summary:report.summary,detectorTuned:false}));
