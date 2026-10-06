import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const digest=x=>createHash('sha256').update(x).digest('hex');
/** Frozen bytes must match. Current differences are disclosed, never called equal. */
export function analyzerIdentity(protocol, frozenRoot, currentRoot) {
 const files=Object.entries(protocol.analyzerFiles??{});
 if(!files.length)throw Error('Empty frozen analyzer manifest');
 const changed=[];
 for(const [file,expected] of files){
  if(!file.startsWith('src/engine/')||file.split('/').includes('..')||! /^[a-f0-9]{64}$/.test(expected))throw Error('Invalid frozen analyzer manifest');
  if(digest(readFileSync(path.join(frozenRoot,file)))!==expected)throw Error('Frozen analyzer changed: '+file);
  let actual=null;
  try{actual=digest(readFileSync(path.join(currentRoot,file)));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(actual!==expected)changed.push({file,frozenSha256:expected,currentSha256:actual});
 }
 return {schemaVersion:1,status:changed.length?'different-current-analyzer':'byte-identical',
  identicalAnalyzerFiles:changed.length===0,changed,comparedFiles:files.length,
  currentMeasurementsEvaluated:false,clinicalValidation:false};
}
