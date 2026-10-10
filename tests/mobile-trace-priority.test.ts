import {it,expect} from 'vitest';
import {explorationContextHtml,createExplorationOrigin,explorationChanges} from '../src/ui/exploration-origin';
import {PRESETS,fromPreset} from '../src/presets/catalog';
it('provenance remains explicit outside a closed disclosure, with its actions',()=>{
 const p=PRESETS[0],c=fromPreset(p),origin=createExplorationOrigin(p,c),changes=explorationChanges(origin,{...c,hr:c.hr+1});
 const html=explorationContextHtml(origin,changes,false);
 expect(html).not.toMatch(/<details[^>]*\bopen\b/);expect(html).toContain('1 ajuste');
 expect(html).toMatch(/<\/details><p>El origen no diagnostica/);
 for(const action of ['exploration-changes','restore-origin'])expect(html).toContain(`data-action="${action}"`);
 expect(explorationContextHtml(origin,changes,true)).toMatch(/<details[^>]*\bopen\b/);
});
it('escapes untrusted provenance rather than introducing markup',()=>{
 const p=PRESETS[0],origin={...createExplorationOrigin(p,fromPreset(p)),presetName:'<img src=x onerror=alert(1)>'};
 expect(explorationContextHtml(origin,[],false)).not.toContain('<img');
});
