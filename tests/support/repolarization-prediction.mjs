/** A02/A03 prediction built ONLY on immutable b744caca source.
 * This is an independent software oracle for the declared delta, not clinical truth.
 * It never imports the candidate morphology or secondary-repolarization modules.
 */
import assert from 'node:assert/strict';
export function predictSource(source) {
  function replaceOnce(oldText,newText) {
    assert.equal(source.split(oldText).length,2,'Frozen oracle anchor changed');
    source=source.replace(oldText,newText);
  }
  assert.equal(source.split('      tv = secondary.t\n').length,2,'Frozen selection anchor changed');
  replaceOnce('? secondary.t.map((x) => x * secondaryScale) as Vec',
    '? secondary.t.map((x) => x * secondaryScale * predictedTModifier(c)) as Vec');
  return source+`
// Reuse existing educational amplitude factors, after direction selection.
function predictedTModifier(c: ECGCase): number {
  if(c.rhythm==='torsades' || c.tAmp===0) return 1;
  const intensity=Math.min(1,Math.max(0,c.st/2));
  const phase=c.ischemia!=='none' && intensity>0 && ['hyperacute','evolving'].includes(c.phase);
  const k=['hypokalemia','hyperkalemia'].includes(c.electrolyte);
  if(phase && k) throw new Error('Combined potassium and active ischemic phase outside scope');
  if(k) return c.electrolyte==='hypokalemia'?.4:2.6;
  if(c.ischemia!=='none' && c.phase==='hyperacute') return 1+1.15*intensity;
  if(c.ischemia!=='none' && c.phase==='evolving') return 1-2*intensity;
  return 1;
}
`;
}
