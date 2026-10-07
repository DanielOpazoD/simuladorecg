import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync('.github/workflows/fidelity.yml','utf8');
const groups={source:['activation','regional-activation'],navigation:['diagnosis-navigation'],interaction:['accessibility','vvi-noncapture','qrs-t-discrimination','wide-qrs']};
const job=(text,name)=>text.match(new RegExp('(?:^|\\n)  '+name+':\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)'))?.[1]??'';
function validate(text){
 const matrix=job(text,'browser-contracts'),gate=job(text,'accessibility');
 expect(matrix).toContain('needs: build');expect(matrix).toContain('fail-fast: false');
 expect(matrix.match(/group: \[([^\]]+)\]/)?.[1].split(',').map(s=>s.trim()).sort()).toEqual(Object.keys(groups).sort());
 expect(matrix).toContain('ECG_BROWSER_GROUP: ${{ matrix.group }}');
 expect(matrix).toContain('name: ecg-accessibility-${{ matrix.group }}-${{ github.sha }}');
 expect(matrix).toContain('ECG_EXPECT_COMMIT: ${{ github.sha }}');
 expect(matrix.indexOf('node scripts/verify-production.mjs')).toBeGreaterThan(0);
 expect(matrix.indexOf('node scripts/verify-production.mjs')).toBeLessThan(matrix.indexOf('case "$ECG_BROWSER_GROUP"'));
 expect(gate).toContain('if: ${{ always() }}');expect(gate).toContain('needs: [build, browser-contracts]');
 expect(gate).toContain('RESULT_BUILD: ${{ needs.build.result }}');
 expect(gate).toContain("RESULT_BROWSER_GROUPS: ${{ needs['browser-contracts'].result }}");
 expect(gate).toContain('test "$RESULT_BUILD" = "success"');expect(gate).toContain('test "$RESULT_BROWSER_GROUPS" = "success"');
 expect(job(text,'verify')).toContain('test "$RESULT_BROWSER_GROUPS" = "success"');
 expect(text).not.toContain('continue-on-error');
 return {matrix,gate};
}
function execute(text,group,fail=''){
 const {matrix}=validate(text),route=matrix.match(/case "\$ECG_BROWSER_GROUP" in[\s\S]*?\besac/)?.[0];expect(route).toBeTruthy();
 const stub='node(){ if [ "$1" = "$FAIL_SCRIPT" ]; then return 23; fi; printf "%s|%s|%s|%s\\n" "$1" "$ECG_ACTIVATION_ENGINES" "$ECG_GROUP_ENGINES" "$ECG_REGIONAL_ENGINES"; };\n';
 return execFileSync('bash',['-e','-o','pipefail','-c',stub+route],{env:{...process.env,ECG_BROWSER_GROUP:group,FAIL_SCRIPT:fail},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n');
}
it('routes every unchanged browser script exactly once across three independent groups',()=>{
 const all=[];
 for(const [group,scripts] of Object.entries(groups)){
  const lines=execute(source,group),paths=lines.map(l=>l.split('|')[0]);
  expect(paths).toEqual(scripts.map(s=>'tests/browser-'+s+'.mjs'));all.push(...paths);
  for(const line of lines)if(/activation|diagnosis-navigation/.test(line))expect(line.split('|').slice(1)).toContain('all');
 }
 expect(new Set(all).size).toBe(7);expect(all.length).toBe(7);expect(()=>execute(source,'unknown')).toThrow();
});
it('propagates a failure from every routed browser command',()=>{
 for(const [group,scripts] of Object.entries(groups))for(const script of scripts)
  expect(()=>execute(source,group,'tests/browser-'+script+'.mjs')).toThrow();
});
it('executes the preserved accessibility join with fail-closed dependency results',()=>{
 const {gate}=validate(source),shell=gate.split('        run: |\n')[1].trimEnd().split('\n').map(l=>l.slice(10)).join('\n');
 const run=extra=>execFileSync('bash',['-e','-c',shell],{env:{...process.env,RESULT_BUILD:'success',RESULT_BROWSER_GROUPS:'success',...extra},stdio:'pipe'});
 expect(()=>run({})).not.toThrow();
 for(const key of ['RESULT_BUILD','RESULT_BROWSER_GROUPS'])for(const result of ['failure','skipped','cancelled',''])expect(()=>run({[key]:result})).toThrow();
});
it('rejects omitted groups, non-versioned evidence and bypassed joins',()=>{
 for(const changed of [source.replace('source, navigation, interaction','source, interaction'),source.replace(job(source,'browser-contracts'),job(source,'browser-contracts').replace('fail-fast: false','fail-fast: true')),source.replace('name: ecg-accessibility-${{ matrix.group }}-${{ github.sha }}','name: latest-browser'),source.replace('test "$RESULT_BROWSER_GROUPS" = "success"','true')]){
  expect(changed).not.toBe(source);expect(()=>validate(changed)).toThrow();
 }
});
