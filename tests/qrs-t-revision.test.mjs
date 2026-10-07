import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {QRS_T_REVISION,assertReviewedQrsTFile,assertQrsTRefinement,summarizeRateRevision} from '../scripts/lib/qrs-t-revision.mjs';
it('pins the numerical change separately without replacing historical manifests',()=>{
 for(const file of Object.keys(QRS_T_REVISION.files)){
  expect(()=>assertReviewedQrsTFile(file,readFileSync(file))).not.toThrow();
  expect(()=>assertReviewedQrsTFile(file,readFileSync(file)+'\n')).toThrow();
 }
 expect(()=>assertReviewedQrsTFile('arbitrary.ts','')).toThrow();
});
const beat={peak:1,onset:.95,offset:1.08,qrs:130,rr:.5};
const before={detectedPeaks:[.1,.5,1,1.5,2],beats:[beat],hr:120};
const after={detectedPeaks:[.1,1,2],beats:[{...beat,rr:.9}],hr:120/1.9};
it('accepts retained boundaries and RR from the selected sample train',()=>expect(()=>assertQrsTRefinement(before,after)).not.toThrow());
it('rejects fabricated candidates',()=>expect(()=>assertQrsTRefinement(before,{...after,detectedPeaks:[.1,1,2.1]})).toThrow());
it('rejects changed boundaries',()=>expect(()=>assertQrsTRefinement(before,{...after,beats:[{...after.beats[0],offset:1.09}]})).toThrow());
it('rejects guessed rate halving',()=>expect(()=>assertQrsTRefinement(before,{...after,hr:60})).toThrow());
it('rejects RR retained from a removed T candidate',()=>expect(()=>assertQrsTRefinement(before,{...after,beats:[beat]})).toThrow());

it('does not charge corrected rates with the old numerical error',()=>{
 const rows=[{before:'usable',after:'usable',beforeBeyondReview:true,beyondReview:false,hr:60},
  {before:'review',after:'usable',beforeBeyondReview:false,beyondReview:true,hr:120},
  {before:'usable',after:'review',beforeBeyondReview:false,beyondReview:false,hr:60}];
 expect(summarizeRateRevision(rows)).toMatchObject({scenarios:3,usableBeyondBefore:1,usableBeyondAfter:1,accurateNewReviews:1,beforeUsable:2,afterUsable:2});
 expect(summarizeRateRevision(rows.slice(0,1))).toMatchObject({usableBeyondBefore:1,usableBeyondAfter:0});
});

it('admits only an audited terminal correction and rejects unrelated boundary changes',()=>{
 const source={...beat,tPeak:1.2,tEnd:1.6,qt:650,tTangentEnd:1.55};
 const a={...before,beats:[source]};
 const revised={...source,rr:.9,tEnd:1.4,qt:450,tTangentEnd:null,terminalRevision:{method:'area-return-reconciliation-v1',previousEnd:1.6,previousQt:650,previousTangentEnd:1.55,areaEnd:1.4,leadCount:3,spreadMs:4}};
 const b={...after,beats:[revised]};expect(()=>assertQrsTRefinement(a,b)).not.toThrow();
 for(const patch of [{offset:1.1},{qt:500},{tEnd:1.7},{tTangentEnd:1.55}])
  expect(()=>assertQrsTRefinement(a,{...b,beats:[{...revised,...patch}]})).toThrow();
 for(const patch of [{previousEnd:1.65},{leadCount:2},{spreadMs:40},{method:'unreviewed'}])
  expect(()=>assertQrsTRefinement(a,{...b,beats:[{...revised,terminalRevision:{...revised.terminalRevision,...patch}}]})).toThrow();
});
