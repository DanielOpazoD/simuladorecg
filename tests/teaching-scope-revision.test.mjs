import {it,expect} from 'vitest';
import {assertTeachingCatalogSource,assertTeachingCatalogRevision,OLD_SECONDARY_SCOPE,CURRENT_SECONDARY_SCOPE,OLD_VVI_SCOPE,CURRENT_VVI_SCOPE} from '../scripts/lib/teaching-scope-revision.mjs';
const before=['lbbb','sgarbossa','vvi','ddd','sinus'].map(id=>({id,patch:{hr:60},limitation:id==='sinus'?'unchanged':(id==='vvi'?OLD_VVI_SCOPE:'')+OLD_SECONDARY_SCOPE}));
const after=before.map(p=>({...p,limitation:p.limitation.replace(OLD_SECONDARY_SCOPE,CURRENT_SECONDARY_SCOPE).replace(OLD_VVI_SCOPE,CURRENT_VVI_SCOPE)}));
it('admits only the two explicitly declared prose corrections',()=>expect(()=>assertTeachingCatalogRevision(before,after)).not.toThrow());
it('rejects physiology hidden inside a prose revision',()=>expect(()=>assertTeachingCatalogRevision(before,after.map((p,i)=>i===0?{...p,patch:{hr:120}}:p))).toThrow());
it('rejects unrelated claim edits',()=>expect(()=>assertTeachingCatalogRevision(before,after.map(p=>p.id==='sinus'?{...p,limitation:'validated'}:p))).toThrow());
it('rejects a missing preset',()=>expect(()=>assertTeachingCatalogRevision(before,after.slice(1))).toThrow());

it('rejects unrelated catalog source edits despite the prose allowance',()=>{
 const old='prefix "'+OLD_VVI_SCOPE+'" + SECONDARY_ST_RATIO_LIMIT suffix';
 const next=old.replace(OLD_VVI_SCOPE,CURRENT_VVI_SCOPE);
 expect(()=>assertTeachingCatalogSource(next,old)).not.toThrow();
 expect(()=>assertTeachingCatalogSource(next+'extra',old)).toThrow();
 expect(()=>assertTeachingCatalogSource(old,old)).toThrow();
});
