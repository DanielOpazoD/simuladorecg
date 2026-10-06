import {describe,it,expect} from 'vitest';
import {traceSampleIndices} from '../src/render/trace-samples';
// Frozen allocation-based implementation from PR80, independent of candidate.
function previous(a:Float64Array,fs:number,from:number,to:number,pps:number) {
 const out:number[]=[],lo=Math.max(0,Math.ceil(from*fs)),hi=Math.min(a.length,Math.ceil(to*fs)),step=Math.max(1,Math.floor(fs/pps));
 for(let i=lo;i<hi;i+=step){const end=Math.min(i+step,hi)-1;if(step===1){out.push(i);continue;}let min=i,max=i;
 for(let j=i+1;j<=end;j++){if(a[j]<a[min])min=j;if(a[j]>a[max])max=j;}
 out.push(...[...new Set([i,min,max,end])].sort((x,y)=>x-y));}return out;
}
describe('allocation-free buckets preserve every emitted sample and its order',()=>{
 it('matches the frozen reducer for ties, partial buckets, reversed extrema and fractional windows',()=>{
  for(const length of [1,2,3,7,37,503])for(const pattern of [0,1,2]){
   const a=Float64Array.from({length},(_,i)=>pattern===0?0:pattern===1?Math.sin(i*2.34):i%7-3);
   for(const pps of [10,73,249,250,501,2000])for(const [from,to] of [[0,length/500],[-.01,.5],[.003,.077]]){
    const out:number[]=[];traceSampleIndices(a,500,from,to,pps,i=>out.push(i));
    expect(out).toEqual(previous(a,500,from,to,pps));
   }
  }
 });
});
