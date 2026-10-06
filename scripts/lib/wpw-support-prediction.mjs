import assert from 'node:assert/strict';
/** Predict only the declared support correction in immutable historical source.
 * No candidate implementation is imported; amplitudes/phase arithmetic stay intact. */
export function predictWpwSupport(source){
 const prefix='      add(b.time, 0.045, (u) =>\n        ';
 const gains=['','c.qrsAmp * ','qrsAmplitudeScale(c) * '];
 const anchors=gains.map(gain=>prefix+`scale(frontal(c.axis, 0.25, 0.03), ${gain}Math.sin(Math.PI * u)),\n      );`);
 const found=anchors.filter(anchor=>source.includes(anchor));
 assert.equal(found.length,1,'Unrecognized historical WPW delta anchor');
 const anchor=found[0];assert.equal(source.split(anchor).length,2,'Duplicated WPW anchor');
 const expression=anchor.slice(prefix.length,-'\n      );'.length).replace(/,$/,'');
 return source.replace(anchor,`      add(b.time, 0.045, (u) => {\n        if (u <= 0 || u >= 1) return [0, 0, 0];\n        return ${expression};\n      });`);
}
