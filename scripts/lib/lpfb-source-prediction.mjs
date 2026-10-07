import assert from 'node:assert/strict';
/** Frozen-source mathematical prediction of the LPFB early-vector intervention.
 * Retains area, time supports, main and delayed RV sources. Does not read the
 * candidate implementation. Independent clinical landmarks are separate tests. */
export function predictLpfbSource(source){
 const ratio=source.includes('kernelWeight(k)')?'kernelWeight(ks[0]) / kernelWeight(ks[2])':'ks[0].sigma / ks[2].sigma';
 const anchor='  return ks;';assert.equal(source.split(anchor).length,2,'Unrecognized QRS source return');
 return source.replace(anchor,`  if (block === "lpfb" || block === "rbbb_lpfb") {
    const previous = ks[0].v, projected = project(previous);
    const amplitude = Math.hypot(projected.I, (2 * projected.II - projected.I) / Math.sqrt(3));
    ks[0].v = frontal(-60, amplitude, previous[2]);
    for (let j = 0; j < 3; j++) ks[2].v[j] +=
      (previous[j] - ks[0].v[j]) * ${ratio};
  }
  return ks;`);
}
