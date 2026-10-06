import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzerIdentity} from '../scripts/lib/frozen-analyzer-identity.mjs';
function fixture(fn){
 const root=mkdtempSync(path.join(tmpdir(),'frozen-identity-')),a=path.join(root,'old'),b=path.join(root,'current'),file='src/engine/sample-analysis.ts';
 for(const r of [a,b]){mkdirSync(path.join(r,'src/engine'),{recursive:true});writeFileSync(path.join(r,file),'frozen sample-only analyzer');}
 const p={analyzerFiles:{[file]:createHash('sha256').update('frozen sample-only analyzer').digest('hex')}};
 try{fn({a,b,file,p});}finally{rmSync(root,{recursive:true,force:true});}
}
it('only byte-identical current sources qualify for the old equality experiment',()=>fixture(({a,b,p})=>{
 const r=analyzerIdentity(p,a,b);expect(r.identicalAnalyzerFiles).toBe(true);expect(r.currentMeasurementsEvaluated).toBe(false);expect(r.clinicalValidation).toBe(false);
}));
it('changed current bytes are explicitly different, never an equality pass',()=>fixture(({a,b,p,file})=>{
 writeFileSync(path.join(b,file),'new algorithm');const r=analyzerIdentity(p,a,b);
 expect(r.status).toBe('different-current-analyzer');expect(r.identicalAnalyzerFiles).toBe(false);expect(r.changed).toHaveLength(1);expect(r.changed[0].currentSha256).not.toBe(r.changed[0].frozenSha256);
}));
it('missing current source remains a disclosed difference',()=>fixture(({a,b,p,file})=>{
 rmSync(path.join(b,file));expect(analyzerIdentity(p,a,b).changed[0].currentSha256).toBeNull();
}));
it('changed frozen bytes fail closed, independently of current bytes',()=>fixture(({a,b,p,file})=>{
 writeFileSync(path.join(a,file),'corrupt');expect(()=>analyzerIdentity(p,a,b)).toThrow(/Frozen analyzer changed/);
}));
it('empty, traversing or malformed manifests fail closed',()=>fixture(({a,b,p})=>{
 for(const manifest of [{},{'src/engine/../x':'a'.repeat(64)},{'src/engine/x':'bad'}])expect(()=>analyzerIdentity({...p,analyzerFiles:manifest},a,b)).toThrow();
}));

it('workflow always evaluates the pinned baseline and guards both equality-only steps',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync('.github/workflows/ludb-frozen-baseline.yml','utf8');
 expect(s).toContain('git diff --exit-code be820726613ddd7141bd2b9404987da4542da61b HEAD -- benchmarks/');
 const steps=s.split('      - name: ');
 const baseline=steps.find(x=>x.startsWith('Evaluate exact frozen baseline'));
 expect(baseline).toContain('--source-root "$RUNNER_TEMP/frozen-product"');expect(baseline).not.toContain('if:');
 for(const name of ['Verify identical analyzer on candidate','Require exact report equality except provenance'])
  expect(steps.find(x=>x.startsWith(name))).toContain("if: steps.identity.outputs.identical == 'true'");
 expect(steps.find(x=>x.startsWith('Require exact report equality'))).toContain('assert.deepEqual(a[key],b[key])');
});
