import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {assertReviewedEventCalendar} from '../scripts/lib/event-calendar-revision.mjs';
describe('reviewed event integrity source',()=>{
 for(const file of ['src/engine/rhythm.ts','src/engine/event-calendar.ts','src/engine/flutter-conduction.ts','src/engine/vvi-demand.ts'])it(file,()=>{
  const source=readFileSync(new URL('../'+file,import.meta.url));
  expect(()=>assertReviewedEventCalendar(file,source)).not.toThrow();
  expect(()=>assertReviewedEventCalendar(file,Buffer.concat([source,Buffer.from('\n')]))).toThrow(/Unreviewed/);
 });
 it('rejects unknown source paths',()=>expect(()=>assertReviewedEventCalendar('other','')).toThrow(/Unknown/));
});
