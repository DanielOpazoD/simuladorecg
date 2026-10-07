import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync('.github/workflows/fidelity.yml','utf8');
const browserGates=['fidelity','worker-recovery','t-peak-evidence','t-end-assistance','posterior-amplitude','comparison','comparison-external','external','external-review','repolarization-coherence','visual-workspace','activation','accessibility','vvi-noncapture','qrs-t-discrimination','wide-qrs','diagnosis-navigation','regional-activation'];
function check(text){
 const jobs=text.split('jobs:\n')[1];expect(jobs).toBeTruthy();
 const job=name=>jobs.match(new RegExp('(?:^|\\n)  '+name+':\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)'))?.[1]??'';
 const build=job('build'),verify=job('verify'),browser=job('accessibility');
 expect(build).toContain('run: npm run build');expect(build).toContain('actions/upload-artifact@v6');
 expect(build).toContain('if-no-files-found: error');expect(build).toContain('name: ecg-browser-build-${{ github.sha }}');
 expect(build).not.toContain('if: always()');
 for(const downstream of [verify,browser]){
  expect(downstream).toContain('needs: build');expect(downstream).toContain('actions/download-artifact@v7');
  expect(downstream).toContain('name: ecg-browser-build-${{ github.sha }}');
  expect(downstream).not.toContain('run: npm run build');
  expect(downstream).toContain('node scripts/verify-production.mjs');
  expect(downstream).toContain('ECG_EXPECT_COMMIT: ${{ github.sha }}');
 }
 for(const name of browserGates)expect(text.split('node tests/browser-'+name+'.mjs').length-1,name).toBe(1);
 for(const name of ['validate-regional-activation','validate-af-clock','validate-wpw-support','validate-vvi-noncapture','validate-qrs-t-discrimination','validate-repolarization-scope','validate-repolarization','validate-posterior-amplitude'])expect(verify).toContain('node scripts/'+name+'.mjs');
 expect(verify).toContain('npm test');expect(job('portability')).toContain('npm run check');
 expect(text).not.toContain('continue-on-error');expect(text).not.toContain('if: false');
}
it('runs both complete validation branches on one exact build, preserving served-byte verification',()=>check(source));
it('rejects skipping a browser gate',()=>expect(()=>check(source.replace('          node tests/browser-fidelity.mjs\n',''))).toThrow());
it('rejects substituting an unversioned artifact',()=>expect(()=>check(source.replaceAll('ecg-browser-build-${{ github.sha }}','latest-build'))).toThrow());
it('rejects restoring sequential validation',()=>expect(()=>check(source.replace('  accessibility:\n    needs: build','  accessibility:\n    needs: verify'))).toThrow());
it('rejects bypassing actual served-source identity in one environment',()=>expect(()=>check(source.replace('          node scripts/verify-production.mjs\n',''))).toThrow());
