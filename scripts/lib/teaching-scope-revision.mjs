/** Explicit prose-only revision; all identifiers, findings and physiological patches stay exact. */
import assert from 'node:assert/strict';
export const OLD_SECONDARY_SCOPE='Repolarización secundaria aproximada: al variar el voltaje QRS, la relación ST/QRS no está calibrada. Este modelo no permite validar criterios proporcionales de Sgarbossa.';
export const CURRENT_SECONDARY_SCOPE='ST y T secundarios aproximados, acoplados a la activación QRS. La amplitud y la relación ST/QRS no están calibradas clínicamente; no permiten validar criterios proporcionales de Sgarbossa.';
export const OLD_VVI_SCOPE='Estimulación capturada a frecuencia fija; sensado, demanda y fallos pendientes. ';
export const CURRENT_VVI_SCOPE='Por defecto, estimulación fija capturada. VVI ofrece demanda idealizada y una variante sin captura total sin escape; no simula fusión ni fallos intermitentes. ';
export function assertTeachingCatalogSource(current,historical){
 const old='"'+OLD_VVI_SCOPE+'" + SECONDARY_ST_RATIO_LIMIT',next='"'+CURRENT_VVI_SCOPE+'" + SECONDARY_ST_RATIO_LIMIT';
 assert.equal(historical.split(old).length,2,'Missing exact VVI predecessor prose');
 assert.equal(current,historical.replace(old,next),'Unexpected catalog source change');
}
export function assertTeachingCatalogRevision(before,after){
 let count=0;
 const expected=before.map(p=>{
  if(!['lbbb','sgarbossa','vvi','ddd'].includes(p.id))return p;
  assert.equal(p.limitation.split(OLD_SECONDARY_SCOPE).length,2,'Missing secondary-ST predecessor disclosure');count++;
  let limitation=p.limitation.replace(OLD_SECONDARY_SCOPE,CURRENT_SECONDARY_SCOPE);
  if(p.id==='vvi'){assert.ok(limitation.startsWith(OLD_VVI_SCOPE));limitation=limitation.replace(OLD_VVI_SCOPE,CURRENT_VVI_SCOPE);}
  return {...p,limitation};
 });
 assert.equal(count,4,'Missing or duplicate affected preset');
 assert.deepEqual(after,expected,'Catalog changed beyond the explicit limitation prose');
}
