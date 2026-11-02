import type {ECGCase} from '../engine/types';
import {quickAdjustmentControls, type QuickNumberControl} from './controls';
import {esc, options} from './helpers';
import './quick-adjust.css';

const limits=(f:QuickNumberControl)=>`min="${f.min}" max="${f.max}" step="${f.step}"`;

/** One editing surface for existing targets; no measurements or synthesis here. */
export function quickAdjustHtml(c:ECGCase):string {
  const fields=quickAdjustmentControls(c);
  if(!fields.some(f=>!f.disabled))return '';
  return `<h2 id="quick-adjust-title">Ajustar ECG</h2><fieldset class="qa-fields"><legend class="sr-only">Parámetros del caso</legend>${fields.map(f=>{
    const disabled=f.disabled?' disabled':'',hidden=f.disabled?' hidden':'';
    if(f.kind==='select')return `<div class="qa-field qa-conduction" data-qa-field="${f.key}"${hidden}><label for="qa-conduction">${esc(f.label)}</label><select id="qa-conduction" data-key="conduction" aria-label="${esc(f.accessibleLabel)}"${disabled}>${options(f.options,f.value)}</select></div>`;
    return `<div class="qa-field" data-qa-field="${f.key}"${hidden}><div class="qa-heading"><label for="qa-${f.key}-range">${esc(f.label)}</label><div class="qa-value"><input id="qa-${f.key}-number" type="number" data-quick-number="${f.key}" aria-label="${esc(f.accessibleLabel)}: valor" aria-describedby="qa-${f.key}-unit" ${limits(f)} value="${f.value}" inputmode="${f.key==='axis'?'text':'numeric'}" required${disabled}/><span id="qa-${f.key}-unit">${esc(f.unit)}</span></div></div><input id="qa-${f.key}-range" type="range" data-key="${f.key}" aria-label="${esc(f.accessibleLabel)}" aria-valuetext="${f.value} ${esc(f.unit)}" ${limits(f)} value="${f.value}"${disabled}/></div>`;
  }).join('')}</fieldset>`;
}

/** Preserve slider capture and unfinished numeric drafts while the case updates. */
export function syncQuickAdjust(root:HTMLElement,c:ECGCase):void {
  const fields=quickAdjustmentControls(c);
  root.hidden=!fields.some(f=>!f.disabled);
  for(const f of fields){
    const wrapper=root.querySelector<HTMLElement>(`[data-qa-field="${f.key}"]`);
    if(!wrapper)continue;
    wrapper.hidden=f.disabled;
    if(f.kind==='select'){
      const select=wrapper.querySelector('select')!;select.disabled=f.disabled;select.value=f.value;continue;
    }
    const range=wrapper.querySelector<HTMLInputElement>('input[type=range]')!;
    const number=wrapper.querySelector<HTMLInputElement>('input[type=number]')!;
    for(const input of [range,number]){
      input.disabled=f.disabled;input.min=String(f.min);input.max=String(f.max);input.step=String(f.step);
    }
    range.value=String(f.value);range.setAttribute('aria-valuetext',`${f.value} ${f.unit}`);
    if(document.activeElement!==number)number.value=String(f.value);
    range.setAttribute('aria-label',f.accessibleLabel);number.setAttribute('aria-label',`${f.accessibleLabel}: valor`);
    wrapper.querySelector('label')!.textContent=f.label;
  }
}
