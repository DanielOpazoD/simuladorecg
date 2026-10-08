import {it,expect,vi} from 'vitest';
import * as covariance from '../src/engine/analysis/ventricular-candidates';
import {briefImpulseFractions} from '../src/engine/analysis/impulse-confidence';
import {makeArrays} from '../src/engine/leads';
it('uses the same verified symmetric solver for every impulse covariance',()=>{
 const fs=500,leads=makeArrays(1500),peaks=[.5,1.5,2.5];
 for(const t of peaks){const i=Math.round(t*fs);leads.I[i]=1;leads.II[i]=-1;leads.V1[i]=1;leads.V5[i]=-1;}
 const before=structuredClone(leads),spy=vi.spyOn(covariance,'covarianceResidual');
 try{
  expect(briefImpulseFractions({fs,leads},peaks)).toEqual({strong:1,possible:1});
  expect(spy).toHaveBeenCalledTimes(3);
  for(const call of [...spy.mock.calls]){expect(call[0]).toHaveLength(4);expect(covariance.covarianceResidual(call[0])).toBe(0);}
  expect(leads).toEqual(before);
 }finally{spy.mockRestore();}
});
it('resolves a larger distributed eigenvalue despite the strongest diagonal belonging to another direction',()=>{
 const matrix=[[5,0,0,0],[0,3,3,3],[0,3,3,3],[0,3,3,3]];
 expect(covariance.covarianceResidual(matrix)).toBeCloseTo(5/14,14);
});
