import {it,expect} from 'vitest';
import {assertExactSamples} from './support/exact-samples';
it('compares every finite sample exactly without mutating inputs',()=>{
 const a=Float64Array.from([1,-0,3]),b=a.slice();expect(()=>assertExactSamples(a,b)).not.toThrow();expect([...a]).toEqual([...b]);
});
it.each([0,50000,99999])('reports a bounded first difference at sample %s',index=>{
 const a=new Float64Array(100000),b=a.slice();b[index]=Number.MIN_VALUE;
 let message='';try{assertExactSamples(a,b,'V6');}catch(e){message=(e as Error).message;}
 expect(message).toContain(`V6: sample ${index}`);expect(message.length).toBeLessThan(160);
});
it('rejects signed-zero differences, nonfinite equality, type and length mismatch',()=>{
 for(const [a,b] of [[0,-0],[NaN,NaN],[Infinity,Infinity]])expect(()=>assertExactSamples(Float64Array.of(a),Float64Array.of(b))).toThrow();
 expect(()=>assertExactSamples(new Float32Array(1),new Float64Array(1))).toThrow(/type/);
 expect(()=>assertExactSamples(new Float64Array(1),new Float64Array(2))).toThrow(/length/);
});
