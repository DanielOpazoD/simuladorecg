import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {QRS_T_REVISION,assertReviewedQrsTFile,assertQrsTRefinement} from '../scripts/lib/qrs-t-revision.mjs';
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
