import { icon } from "./helpers";

let revision = 0;
const observed = new WeakSet<HTMLDialogElement>();
function dialogElement() {
  const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
  if (!observed.has(dialog)) {
    observed.add(dialog);
    dialog.addEventListener("close", () => { if (!dialog.open) revision++; });
  }
  return dialog;
}

/** An optional module may open only while its request is still the latest intent. */
export function requestDialog() {
  dialogElement();
  const request = ++revision;
  return () => request === revision;
}

export function openDialog(title: string, body: string, headerActions = "") {
  revision++;
  document.querySelector<HTMLElement>("#dialog-content")!.innerHTML =
    `<div class="dialog-head"><h2>${title}</h2>${headerActions}<button class="btn icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div>${body}`;
  dialogElement().showModal();
}

export function closeDialog() {
  revision++;
  dialogElement().close();
}
