import { describe, expect, it } from 'vitest';
import { classifyTEndReviewCandidate, T_END_CONFIDENCE_POLICY } from '../src/engine/t-end-confidence';
import type { TEndAreaCandidate } from '../src/engine/t-end-area';
const candidate=(spreadMs:number,amps:number[]):TEndAreaCandidate=>({peak:1,time:1.3,method:'area-agreement-v1',
 searchWindow:{start:1.1,end:1.5},supportingLeads:['I','II','V1'],spreadMs,
 leadEstimates:amps.map((areaAmplitudeMv,i)=>({lead:(['I','II','V1','V5'] as const)[i],time:1.3,windowDifferenceMs:2,areaAmplitudeMv}))});
describe('T-end review strata are descriptive and conservative',()=>{
 it('requires both tight timing and bounded amplitude heterogeneity',()=>{
  expect(classifyTEndReviewCandidate(candidate(6,[.04,.08,.12])).stratum).toBe('high-agreement');
  expect(classifyTEndReviewCandidate(candidate(6.1,[.04,.08,.12])).stratum).toBe('review');
  expect(classifyTEndReviewCandidate(candidate(6,[.04,.08,.121])).stratum).toBe('review');
 });
 it('never turns malformed amplitude evidence into high agreement',()=>{
  expect(classifyTEndReviewCandidate(candidate(2,[0,.1,.1])).stratum).toBe('review');
  expect(classifyTEndReviewCandidate(candidate(2,[Number.NaN,.1,.1])).stratum).toBe('review');
 });
 it('publishes the exact retrospective policy',()=>{
  expect(T_END_CONFIDENCE_POLICY).toMatchObject({version:'agreement-strata-v1',highMaximumSpreadMs:6,highMaximumAreaAmplitudeRatio:3});
 });
});
