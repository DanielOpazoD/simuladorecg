/** Exact finite samples with bounded failure output; never allocates a full-array diff. */
export function assertExactSamples(actual: Float64Array | Float32Array, expected: Float64Array | Float32Array, label='samples'): void {
 if(actual.constructor!==expected.constructor)throw new Error(`${label}: sample storage type differs`);
 if(actual.length!==expected.length)throw new Error(`${label}: length ${actual.length} != ${expected.length}`);
 for(let i=0;i<actual.length;i++){
  const a=actual[i],b=expected[i];
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Object.is(a,b))
   throw new Error(`${label}: sample ${i}, actual=${a}, expected=${b}`);
 }
}
