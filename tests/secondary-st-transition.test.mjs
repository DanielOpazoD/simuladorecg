import{it,expect}from'vitest';import{reviewSecondarySTTransition}from'../scripts/lib/secondary-st-transition.mjs';
const side=()=>({tp:100,fp:10,fn:2,metrics:{hr:{usableBad:3},qrs:{usableBad:4},qt:{usableBad:2}}});
const fixture=()=>({scenarios:920,status:'fail',failures:[{domain:'morphology',id:'["post-acquisition","lbbb"]'}],quality:[{before:side(),after:side()}]});
it('retains failed strict status in a separately named migration decision',()=>{const r=reviewSecondarySTTransition(fixture());expect(r.status).toBe('reviewed-source-migration');expect(r.strictStatus).toBe('fail');expect(r.clinicalValidation).toBe(false);});
it('rejects missing scenarios, unrelated deterioration and worse aggregate detection',()=>{
 const missing=fixture();missing.scenarios--;expect(()=>reviewSecondarySTTransition(missing)).toThrow();
 const unrelated=fixture();unrelated.failures[0].id='["post-acquisition","sinus"]';expect(()=>reviewSecondarySTTransition(unrelated)).toThrow();
 for(const key of ['tp','fp','fn']){const f=fixture();f.quality[0].after[key]+=key==='tp'?-1:1;expect(()=>reviewSecondarySTTransition(f)).toThrow();}
 for(const key of ['hr','qrs','qt']){const f=fixture();f.quality[0].after.metrics[key].usableBad++;expect(()=>reviewSecondarySTTransition(f)).toThrow();}
});
