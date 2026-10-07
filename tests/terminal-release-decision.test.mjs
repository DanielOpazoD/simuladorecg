import{it,expect}from'vitest';import{createHash}from'node:crypto';import{reviewApprovedTerminalRelease as review}from'../scripts/accept-terminal-consensus-release.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report=()=>({outcome:{paired:false,coverage:true,qt:true,usable:true,terminal:true},summary:{count:11,max:24.17},comparison:{pairs:2,before:7,after:20.90}});
const decision=r=>({approved:true,repository:'DanielOpazoD/simuladorecg',pullRequest:150,approvedSummarySha256:hash(r.summary),approvedComparisonSha256:hash(r.comparison)});
it('records approval without relabelling the failed frozen test as a pass',()=>{const r=report(),copy=structuredClone(r),d=decision(r),out=review(r,d);expect(out.status).toBe('accepted-with-documented-exception');expect(out.frozenAcceptance).toBe('failed');expect(r).toEqual(copy);});
it('requires explicit approval',()=>{const r=report();expect(()=>review(r,{...decision(r),approved:false})).toThrow();});
it.each(['coverage','qt','usable','terminal'])('cannot excuse failure of %s',key=>{const r=report(),d=decision(r);r.outcome[key]=false;expect(()=>review(r,d)).toThrow();});
it('rejects a different paired tradeoff or worse absolute result',()=>{const r=report(),d=decision(r);r.comparison.after=21;expect(()=>review(r,d)).toThrow();r.comparison.after=20.90;r.summary.max=25;expect(()=>review(r,d)).toThrow();});
it('cannot reuse the decision for another PR',()=>{const r=report();expect(()=>review(r,{...decision(r),pullRequest:151})).toThrow();});
