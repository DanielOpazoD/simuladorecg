import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const group="  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}";
const cancel="  cancel-in-progress: ${{ github.event_name == 'pull_request' }}";
function validate(source){
 const block=source.match(/^concurrency:\n(?:[ \t].*\n)*/m)?.[0];
 if(!block||!block.includes(group+'\n')||!block.includes(cancel+'\n'))throw new Error('Unsafe concurrency scope');
}
for(const file of readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){
 const source=readFileSync('.github/workflows/'+file,'utf8');if(!source.includes('  pull_request:'))continue;
 it('isolates PR concurrency and preserves every non-PR run: '+file,()=>{
  expect(()=>validate(source)).not.toThrow();
  for(const mutation of [source.replace(cancel,'  cancel-in-progress: true'),source.replace(' || github.run_id',' || github.ref'),source.replace('${{ github.workflow }}-','')])expect(()=>validate(mutation)).toThrow();
 });
}
