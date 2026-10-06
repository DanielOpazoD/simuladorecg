import {it,expect} from 'vitest';
import {afInterval,AF_RR_CV} from '../src/engine/af-rr';
import {random} from '../src/engine/random';
it('preserves positive mean and CV over independently specified long-run moments',()=>{
 const r=random(173),n=100000,values=Array.from({length:n},()=>afInterval(r,.8));
 const mean=values.reduce((a,b)=>a+b,0)/n,variance=values.reduce((a,b)=>a+(b-mean)**2,0)/n;
 expect(mean).toBeGreaterThan(.795);expect(mean).toBeLessThan(.805);
 expect(Math.sqrt(variance)/mean).toBeGreaterThan(.215);expect(Math.sqrt(variance)/mean).toBeLessThan(.225);
 expect(values.every(v=>v>0&&Number.isFinite(v))).toBe(true);
 expect(values.filter(v=>v===.8*.38||v===.8*2.15)).toHaveLength(0);
 expect(AF_RR_CV).toBe(.22);
});
it('is seed deterministic, duration-independent and scale-equivariant',()=>{
 const a=random(18),b=random(18),c=random(18);
 for(let i=0;i<1000;i++){const x=afInterval(a,.5);expect(afInterval(b,.5)).toBe(x);expect(afInterval(c,1)).toBe(2*x);}
});
it('does not accumulate probability at either former clipping boundary',()=>{
 const r=random(92),values=Array.from({length:100000},()=>afInterval(r,1));
 expect(new Set(values).size).toBe(values.length);
 expect(values.some(v=>v<.38)).toBe(true);expect(values.some(v=>v>2.15)).toBe(true);
});
it('fails explicitly for invalid timing and an unusable random source',()=>{
 for(const mean of [0,-1,NaN,Infinity])expect(()=>afInterval(random(1),mean)).toThrow();
 expect(()=>afInterval(()=>NaN,1)).toThrow(/random source/);
});
