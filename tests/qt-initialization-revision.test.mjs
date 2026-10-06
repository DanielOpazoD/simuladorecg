import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {assertReviewedQTInitialization,predictQTInitialization} from '../scripts/lib/qt-initialization-revision.mjs';
const source=readFileSync(new URL('../src/engine/repolarization.ts',import.meta.url),'utf8');
describe('reviewed QT initialization source contract',()=>{
 it('accepts the reviewed source',()=>expect(()=>assertReviewedQTInitialization(source)).not.toThrow());
 it('rejects changing adaptation or the numerical QT ceiling',()=>{
   for(const modified of [source.replace('-120','-60'),source.replace('Math.min(0.9','Math.min(0.8')])
     expect(()=>assertReviewedQTInitialization(modified)).toThrow(/Unreviewed/);
 });
 it('does not predict from an unknown or already patched baseline',()=>{
   expect(()=>predictQTInitialization(source)).toThrow(/Unknown/);
 });
});
