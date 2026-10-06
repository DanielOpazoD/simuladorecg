import { icon } from "./helpers";

export function openDialog(title: string, body: string) {
  document.querySelector<HTMLElement>("#dialog-content")!.innerHTML =
    `<div class="dialog-head"><h2>${title}</h2><button class="btn icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div>${body}`;
  document.querySelector<HTMLDialogElement>("#dialog")!.showModal();
}

export function closeDialog() {
  document.querySelector<HTMLDialogElement>("#dialog")!.close();
}
