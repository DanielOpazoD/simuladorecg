import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync('.github/workflows/fidelity.yml','utf8');
const mapping={BUILD:'build',CORE:'verify-core',NATIVE:'qrs-discrimination',BROWSER:'accessibility',PORTABILITY:'portability',AMPLITUDE:'amplitude-regression'};
const job=(text,name)=>text.match(new RegExp('(?:^|\\n)  '+name+':\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)'))?.[1]??'';
function validate(text){
 const native=job(text,'qrs-discrimination'),core=job(text,'verify-core'),gate=job(text,'verify');
 expect([...text.split('jobs:\n')[1].matchAll(/^  ([A-Za-z_][A-Za-z0-9_-]*):$/gm)].map(m=>m[1]).filter(n=>n!=='verify').sort()).toEqual(Object.values(mapping).sort());
 const command='node scripts/validate-qrs-t-discrimination.mjs';
 expect(text.split(command)).toHaveLength(2);expect(native).toContain(command);expect(core).not.toContain(command);
 for(const body of [core,native])expect(body).toContain('needs: build');
 expect(native).toContain('test -s "$RUNNER_TEMP/qrs-t-discrimination-results.json"');
 expect(native).toContain('git archive HEAD');expect(native).toContain('git rev-parse HEAD');
 expect(native).toContain('name: qrs-discrimination-${{ github.sha }}');expect(native).toContain('if-no-files-found: error');
 expect(gate).toContain('if: ${{ always() }}');
 expect(gate.match(/needs: \[([^\]]+)\]/)?.[1].split(',').map(x=>x.trim()).sort()).toEqual(Object.values(mapping).sort());
 for(const [key,name] of Object.entries(mapping)){
  expect(gate).toContain(`RESULT_${key}: \${{ needs['${name}'].result }}`);
  expect(gate).toContain(`test "$RESULT_${key}" = "success"`);
 }
 expect(text).not.toContain('continue-on-error');expect(gate).not.toContain('if: success()');
 return gate;
}
it('runs the full unchanged native matrix independently behind a fail-closed verify context',()=>validate(source));
it('executes the actual join shell against success, failure, skipped, cancelled and absent results',()=>{
 const gate=validate(source),script=gate.split('        run: |\n')[1].trimEnd().split('\n').map(l=>l.slice(10)).join('\n');
 const env=Object.fromEntries(Object.keys(mapping).map(k=>['RESULT_'+k,'success']));
 const run=extra=>execFileSync('bash',['-e','-o','pipefail','-c',script],{env:{...process.env,...env,...extra},stdio:'pipe'});
 expect(()=>run({})).not.toThrow();
 for(const key of Object.keys(mapping))for(const status of ['failure','skipped','cancelled',''])
  expect(()=>run({['RESULT_'+key]:status}),key+'/'+status).toThrow();
});
it('rejects dropping a prerequisite, changing the reference artifact or suppressing a failure',()=>{
 for(const changed of [source.replace('qrs-discrimination, accessibility','accessibility'),source.replace('if: ${{ always() }}\n    needs:', 'if: success()\n    needs:'),source.replace('test "$RESULT_NATIVE" = "success"','true'),source.replace('name: qrs-discrimination-${{ github.sha }}','name: latest-native'),source+'\n  unjoined_check:\n    runs-on: ubuntu-latest\n    steps: []\n']){
  expect(changed).not.toBe(source);expect(()=>validate(changed)).toThrow();
 }
});
