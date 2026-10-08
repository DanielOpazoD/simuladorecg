/** Explicit teaching revision; all identifiers and physiological patches stay exact. */
import assert from 'node:assert/strict';
export const OLD_SECONDARY_SCOPE='Repolarización secundaria aproximada: al variar el voltaje QRS, la relación ST/QRS no está calibrada. Este modelo no permite validar criterios proporcionales de Sgarbossa.';
export const CURRENT_SECONDARY_SCOPE='ST y T secundarios aproximados, acoplados a la activación QRS. La amplitud y la relación ST/QRS no están calibradas clínicamente; no permiten validar criterios proporcionales de Sgarbossa.';
export const OLD_VVI_SCOPE='Estimulación capturada a frecuencia fija; sensado, demanda y fallos pendientes. ';
export const CURRENT_VVI_SCOPE='Por defecto, estimulación fija capturada. VVI ofrece demanda idealizada y una variante sin captura total sin escape; no simula fusión ni fallos intermitentes. ';
export const OLD_WPW_SCOPE='Preexcitación aproximada: la delta no modifica el ST-T secundario en este modelo. No uses esta T para aprender la repolarización típica de WPW.';
export const CURRENT_WPW_SCOPE='Preexcitación aproximada: en los latidos preexcitados, ST y T siguen la activación QRS incluida la onda delta. Amplitudes no calibradas; no localiza vías accesorias ni reproduce AVRT o memoria cardíaca.';
export const OLD_WPW_MECHANISM='Adición de una activación ventricular inicial lenta.';
export const CURRENT_WPW_MECHANISM='Activación inicial lenta con ST-T secundario acoplado a la activación ventricular y su delta.';
export const WPW_FINDING='ST-T discordante a la activación integrada representada';
export function assertTeachingCatalogSource(current,historical){
 const old='"'+OLD_VVI_SCOPE+'" + SECONDARY_ST_RATIO_LIMIT',next='"'+CURRENT_VVI_SCOPE+'" + SECONDARY_ST_RATIO_LIMIT';
 assert.equal(historical.split(old).length,2,'Missing exact VVI predecessor prose');
 const previousFindings='["PR corto", "Ascenso inicial empastado", "QRS ancho"]';
 assert.equal(historical.split(OLD_WPW_MECHANISM).length,2);
 assert.equal(historical.split(previousFindings).length,2);
 const predicted=historical.replace(old,next).replace(OLD_WPW_MECHANISM,CURRENT_WPW_MECHANISM)
   .replace(previousFindings,previousFindings.slice(0,-1)+', "'+WPW_FINDING+'"]');
 assert.equal(current,predicted,'Unexpected catalog source change');
}
export function assertTeachingCatalogRevision(before,after){
 let count=0;
 const expected=before.map(p=>{
  if(p.id==='wpw'){
   assert.ok(p.limitation.includes(OLD_WPW_SCOPE));
   assert.equal(p.mechanism,OLD_WPW_MECHANISM);
   return {...p,mechanism:CURRENT_WPW_MECHANISM,findings:[...p.findings,WPW_FINDING],limitation:p.limitation.replace(OLD_WPW_SCOPE,CURRENT_WPW_SCOPE)};
  }
  if(!['lbbb','sgarbossa','vvi','ddd'].includes(p.id))return p;
  assert.equal(p.limitation.split(OLD_SECONDARY_SCOPE).length,2,'Missing secondary-ST predecessor disclosure');count++;
  let limitation=p.limitation.replace(OLD_SECONDARY_SCOPE,CURRENT_SECONDARY_SCOPE);
  if(p.id==='vvi'){assert.ok(limitation.startsWith(OLD_VVI_SCOPE));limitation=limitation.replace(OLD_VVI_SCOPE,CURRENT_VVI_SCOPE);}
  return {...p,limitation};
 });
 assert.equal(count,4,'Missing or duplicate affected preset');
 assert.deepEqual(after,expected,'Catalog changed beyond the explicit limitation prose');
}
