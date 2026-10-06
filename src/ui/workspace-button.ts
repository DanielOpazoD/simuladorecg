import {esc,icon} from './helpers';
/** Short visible mobile labels keep the complete accessible name. */
export function workspaceButton(action:string,label:string,shortLabel:string,symbol:string,extraClass=''):string {
  return `<button type="button" data-action="${esc(action)}" class="btn ${esc(extraClass)}" aria-label="${esc(label)}">${icon(symbol)}<span class="workspace-label-long">${esc(label)}</span><span class="workspace-label-short" aria-hidden="true">${esc(shortLabel)}</span></button>`;
}
