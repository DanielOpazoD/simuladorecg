import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
function arg(name){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error(name+' requires a path');return resolve(process.argv[i+1]);}
const baseline=JSON.parse(readFileSync(arg('--baseline'))),candidate=JSON.parse(readFileSync(arg('--candidate'))),output=arg('--output');
if(baseline.protocolSha256!==candidate.protocolSha256||baseline.fixtureManifestSha256!==candidate.fixtureManifestSha256)
  throw new Error('Pair must use identical protocol and fixtures');
const d=(a,b)=>a===null||b===null?null:b-a;
const waves={};
for(const w of ['P','QRS','T']){
  const a=baseline.summary.waves[w],b=candidate.summary.waves[w];
  waves[w]={tp:d(a.tp,b.tp),fp:d(a.fp,b.fp),fn:d(a.fn,b.fn),sensitivity:d(a.sensitivity,b.sensitivity),ppv:d(a.ppv,b.ppv),
    endpoints:Object.fromEntries(['peak','onset','offset','duration'].map(k=>[k,{
      maeMs:d(a.endpoint[k].maeMs,b.endpoint[k].maeMs),
      p95AbsMs:d(a.endpoint[k].p95AbsMs,b.endpoint[k].p95AbsMs),
      coverageOfEligible:d(a.endpoint[k].coverageOfEligible,b.endpoint[k].coverageOfEligible)}]))};
}
const intervals={};
for(const k of ['pr','qrs','qt']){
  const a=baseline.summary.intervals[k],b=candidate.summary.intervals[k];
  intervals[k]={numericWithReference:d(a.numericWithReference,b.numericWithReference),
    abstentionsWithReference:d(a.abstentionsWithReference,b.abstentionsWithReference),
    maeMs:d(a.errors.maeMs,b.errors.maeMs),p95AbsMs:d(a.errors.p95AbsMs,b.errors.p95AbsMs),
    statusDelta:Object.fromEntries(['usable','review','unavailable','unknown'].map(s=>[s,d(a.statuses[s]??0,b.statuses[s]??0)]))};
}
const report={schemaVersion:1,baselineCommit:baseline.productCommit,candidateCommit:candidate.productCommit,
  sameProtocol:true,sameFixtures:true,descriptiveOnly:true,noAcceptanceVerdict:true,waves,intervals};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
