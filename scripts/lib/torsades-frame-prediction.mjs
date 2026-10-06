import assert from 'node:assert/strict';
/** Mathematical intervention on frozen source; never imports candidate helpers.
 * This verifies declared scope, not electrophysiological accuracy. */
export function predictTorsadesFrame(source) {
  const anchor=`    add(tStart, tLen, (u) =>
      scale(tv, tWave(u, c.electrolyte === "hyperkalemia")),
    );`;
  assert.equal(source.split(anchor).length,2,'Frozen T placement anchor changed');
  return source.replace(anchor,`    add(tStart, tLen, (u, t) =>
      scale(c.rhythm === "torsades" ? predictedTFrame(tv,t,c.hr) : tv, tWave(u, c.electrolyte === "hyperkalemia")),
    );`)+`
function predictedTFrame(v: Vec, time: number, rate: number): Vec {
  const angle=2*Math.PI*time/(720/rate), sn=Math.sin(angle), cs=Math.cos(angle);
  const gain=.55+.325*(1+sn);
  const matrix=[[gain*cs,0,-gain*sn],[0,cs,0],[sn,0,cs]];
  return matrix.map(row=>row.reduce((sum,x,j)=>sum+x*v[j],0)) as Vec;
}
`;
}
