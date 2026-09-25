/** The immutable LUDB adapter is JavaScript, as in external.test.mjs. */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadLudb } from './reference/ludb/load-ludb.mjs';
import { measure } from '../src/engine/measure';
import { analyzeSamples } from '../src/engine/sample-analysis';
const root=fileURLToPath(new URL('./reference/ludb/fixtures',import.meta.url));
const numeric=m=>({...m,evidence:{...m.evidence,hr:{...m.evidence.hr,status:'review',reason:''}}});
describe('Known LUDB regression of the full sample-only entry',()=>{
 it.each([1,2,3,4,101,102,103,104])('preserves numerical analysis of known record %s',id=>{
  const {signal}=loadLudb(root,id<100?'development':'control',id);
  const before=measure(signal),after=analyzeSamples(signal);
  expect(numeric(after)).toEqual(numeric(before));
  if(before.evidence.hr.status!=='usable')expect(after.evidence.hr).toEqual(before.evidence.hr);
 });
});
