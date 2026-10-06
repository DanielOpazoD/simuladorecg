import {it,expect} from 'vitest';
import {workspaceButton} from '../src/ui/workspace-button';
import {explorationContextHtml,createExplorationOrigin,explorationChanges} from '../src/ui/exploration-origin';
import {PRESETS,fromPreset} from '../src/presets/catalog';
it('short labels retain complete accessible names without duplicate speech',()=>{
 const html=workspaceButton('compare','Comparar A/B','Comparar','strip');
 expect(html).toContain('aria-label="Comparar A/B"');expect(html).toContain('workspace-label-short" aria-hidden="true"');expect(html).toContain('type="button"');
});
it('provenance remains explicit outside a closed disclosure, with all actions retained',()=>{
 const p=PRESETS[0],c=fromPreset(p),origin=createExplorationOrigin(p,c),changes=explorationChanges(origin,{...c,hr:c.hr+1});
 const html=explorationContextHtml(origin,changes,false);
 expect(html).not.toMatch(/<details[^>]*\bopen\b/);expect(html).toContain('1 ajuste');
 expect(html).toMatch(/<\/details><p>El origen no diagnostica/);
 for(const action of ['exploration-changes','compare-origin','restore-origin'])expect(html).toContain(`data-action="${action}"`);
 expect(html).toMatch(/data-action="compare-origin" disabled/);
 expect(explorationContextHtml(origin,changes,true,true)).toMatch(/<details[^>]*\bopen\b/);
});
it('escapes untrusted provenance rather than introducing markup',()=>{
 const p=PRESETS[0],origin={...createExplorationOrigin(p,fromPreset(p)),presetName:'<img src=x onerror=alert(1)>'};
 expect(explorationContextHtml(origin,[],false)).not.toContain('<img');
});
