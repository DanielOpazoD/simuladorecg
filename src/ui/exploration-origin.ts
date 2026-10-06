import { cloneCase, type ECGCase } from "../engine/types";
import { rhythmControlState } from "./rhythm-controls";
import type { Preset } from "../presets/catalog";
export interface ExplorationOrigin { readonly presetId:string; readonly presetName:string; readonly case:ECGCase }
export interface ExplorationChange { readonly key:string; readonly label:string; readonly before:unknown; readonly after:unknown; readonly beforeLabel?:string; readonly afterLabel?:string }
const LABELS:Record<string,string>={seed:"Semilla",rhythm:"Ritmo",ventricularSource:"Fuente ventricular",activationModel:"Modelo de activación QRS",av:"Conducción AV",conduction:"Conducción intraventricular",ischemia:"Repolarización / lesión",overload:"Sobrecarga",hr:"Frecuencia base (lpm)",atrialRate:"Frecuencia auricular independiente (lpm)",variability:"Variabilidad RR",respiratoryRate:"Frecuencia respiratoria",pr:"PR",qrs:"QRS",qtc:"QTc programado",axis:"Eje QRS",pAxis:"Eje P",tAxis:"Eje T",pAmp:"Amplitud P",qrsAmp:"Amplitud QRS",tAmp:"Amplitud T",transition:"Transición precordial",septalQ:"Q septal",ectopy:"Ectopia",coupling:"Acoplamiento",flutterPattern: "Secuencia de conducción flutter", flutterRatio:"Relación de conducción flutter",escape:"Escape",pacing:"Modo de marcapasos",st:"ST",phase:"Fase",stShape:"Morfología ST",electrolyte:"Modificador metabólico",filter:"Filtro",notch:"Notch",mainsFrequency:"Frecuencia de red","artifacts.baseline":"Deriva de línea de base","artifacts.muscle":"Artefacto muscular","artifacts.mains":"Interferencia de red","artifacts.loose":"Electrodo suelto","artifacts.reversed":"Inversión de brazos"};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function createExplorationOrigin(preset:Preset,c:ECGCase):ExplorationOrigin{return{presetId:preset.id,presetName:preset.name,case:cloneCase(c)}}
export function explorationChanges(origin:ExplorationOrigin,current:ECGCase):ExplorationChange[]{const out:ExplorationChange[]=[];for(const key of Object.keys(LABELS)){const [group,item]=key.split(".");const before=item?(origin.case[group as "artifacts"] as unknown as Record<string,unknown>)[item]:(origin.case as unknown as Record<string,unknown>)[key];const after=item?(current[group as "artifacts"] as unknown as Record<string,unknown>)[item]:(current as unknown as Record<string,unknown>)[key];if(!equal(before,after))out.push({key,label:LABELS[key],before,after,...rateContext(key,origin.case,current)})}return out}
export function restoreExplorationOrigin(origin:ExplorationOrigin,current:ECGCase):ECGCase{const restored=cloneCase(origin.case);restored.view=cloneCase(current).view;return restored}
export function sameExplorationModel(origin:ExplorationOrigin,current:ECGCase):boolean{return explorationChanges(origin,current).length===0}

/** Explain each state separately: a stored value can change meaning or become
 * inactive when the rhythm changes. This describes the scheduler, not diagnosis.
 */
function rateContext(key:string,before:ECGCase,after:ECGCase) {
  if(key !== "hr" && key !== "atrialRate") return {};
  const label=(c:ECGCase)=>{
    const state=rhythmControlState(c);
    const disabled=key==="hr"?state.baseRateDisabled:state.atrialRateDisabled;
    const name=key==="hr"?state.baseRateLabel:"Frecuencia auricular independiente";
    return disabled?`${name} · valor conservado, no utilizado en este ritmo`:name;
  };
  return {beforeLabel:label(before),afterLabel:label(after)};
}
