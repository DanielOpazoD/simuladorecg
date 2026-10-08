import {describe,it,expect} from 'vitest';
import {covarianceResidual} from '../src/engine/analysis/ventricular-candidates';
const outer=(v:number[])=>v.map(a=>v.map(b=>a*b));
describe('Directional covariance statistic independent of an arbitrary seed',()=>{
 it('recognizes anti-aligned rank-one channels even when their sum is zero',()=>{
  expect(covarianceResidual(outer([1,-1,1,-1]))).toBeCloseTo(0,12);
 });
 it('uses the dominant eigenvalue even if the old seed lies in a smaller eigenspace',()=>{
  const a=outer([1,-1,1,-1]),b=outer([1,1,1,1]);
  const m=a.map((row,i)=>row.map((v,j)=>v+.125*b[i][j]));
  expect(covarianceResidual(m)).toBeCloseTo(1-4/4.5,12);
 });
 it('preserves known isotropic and zero-energy values',()=>{
  expect(covarianceResidual(Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?1:0)))).toBeCloseTo(.75,12);
  expect(covarianceResidual(outer([0,0,0,0]))).toBe(1);
 });
});

describe('Covariance eigensolver precision and invariants',()=>{
 const hadamard=[[1,1,1,1],[1,-1,1,-1],[1,1,-1,-1],[1,-1,-1,1]].map(r=>r.map(v=>v/2));
 const matrix=(basis:number[][],eigen:number[])=>{
  // Compute one triangle and mirror it, as the production outer-product sum
  // does; independently rounded matrix products are not exactly symmetric.
  const result=Array.from({length:4},()=>Array(4).fill(0));
  for(let i=0;i<4;i++)for(let j=i;j<4;j++)result[i][j]=result[j][i]=basis[i].reduce((sum,v,k)=>sum+v*eigen[k]*basis[j][k],0);
  return result;
 };
 const m=matrix(hadamard,[1,4,2,.5]);
 it('matches an independently constructed known spectrum',()=>expect(covarianceResidual(m)).toBeCloseTo(1-4/7.5,12));
 it('is invariant to channel permutation and sign reversal',()=>{
  const order=[3,1,0,2],sign=[1,-1,1,-1];
  const changed=order.map((i,a)=>order.map((j,b)=>m[i][j]*sign[a]*sign[b]));
  expect(covarianceResidual(changed)).toBeCloseTo(covarianceResidual(m),12);
 });
 it.each([1e-100,1e-12,1,1e12,1e100])('is invariant to positive covariance scale %s',scale=>{
  expect(covarianceResidual(m.map(r=>r.map(v=>v*scale)))).toBeCloseTo(1-4/7.5,12);
 });
 it('does not mutate covariance',()=>{const copy=structuredClone(m);covarianceResidual(m);expect(m).toEqual(copy)});
 it('matches rotated known spectra without selecting a preferred initial direction',()=>{
  for(let n=0;n<80;n++){
   const q:number[][]=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?1:0));
   for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const theta=(n+1)*(a+2)*(b+3)*.137,c=Math.cos(theta),s=Math.sin(theta);
    for(let i=0;i<4;i++){const x=q[i][a],y=q[i][b];q[i][a]=c*x-s*y;q[i][b]=s*x+c*y;}
   }
   const a=matrix(q,[.7,.2,.09,.01]);
   expect(covarianceResidual(a)).toBeCloseTo(.3,12);
  }
 });
 it('rejects invalid matrices instead of reporting a plausible statistic',()=>{
  const invalid=[[[1]],[[1,2,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],[[1,2,0,0],[2,1,0,0],[0,0,0,0],[0,0,0,0]],outer([NaN,1,1,1]),outer([Infinity,1,1,1])];
  for(const a of invalid)expect(()=>covarianceResidual(a)).toThrow();
 });
});

import {detectVentricularCandidates} from '../src/engine/analysis/ventricular-candidates';
import {covarianceFixture} from './support/covariance-fixture';
describe('Sample-only discrimination is not dependent on channel-sign cancellation',()=>{
 for(const fs of [250,500,1000])for(const polarity of [-1,1])for(const offset of [0,.7])
 it(`${fs} Hz, T polarity ${polarity}, offset ${offset}: rejects the rank-one T`,()=>{
  const s=covarianceFixture(fs,polarity,offset),copy=Object.fromEntries(Object.entries(s.leads).map(([k,v])=>[k,v.slice()]));
  const result=detectVentricularCandidates(s);
  expect(result.peaks).toHaveLength(10);
  for(let beat=0;beat<10;beat++)expect(result.peaks.filter(i=>Math.abs(i/fs-(beat+.4))<.07)).toHaveLength(1);
  expect(s.leads).toEqual(copy);
 });
});
