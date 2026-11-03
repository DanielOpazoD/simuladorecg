import { icon } from "./helpers";

let revision = 0;
/** Reading position captured when the dialog opens from the closed state; released on its close. */
type Anchor = { id: number; x: number; y: number; width: number; height: number; doc: number };
let anchor: Anchor | null = null;
let serial = 0;
const pageGeometry = () => ({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, doc: document.documentElement.scrollHeight });
const observed = new WeakSet<HTMLDialogElement>();
function dialogElement() {
  const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
  if (!observed.has(dialog)) {
    observed.add(dialog);
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      revision++;
      const saved = anchor;
      anchor = null;
      // Runs after the native focus return and the accessibility focus microtask; re-checked once at the next frame.
      if (saved) queueMicrotask(() => { restoreReading(dialog, saved); requestAnimationFrame(() => restoreReading(dialog, saved)); });
    });
  }
  return dialog;
}

/** Return to the exact reading position only if the reader is still on the page the note was opened from. */
function restoreReading(dialog: HTMLDialogElement, saved: Anchor) {
  if (dialog.open || saved.id !== serial) return;
  const now = pageGeometry();
  if (now.width !== saved.width || now.height !== saved.height || now.doc !== saved.doc) return;
  if (now.x !== saved.x || now.y !== saved.y) scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
}

/** An optional module may open only while its request is still the latest intent. */
export function requestDialog() {
  dialogElement();
  const request = ++revision;
  return () => request === revision;
}

export function openDialog(title: string, body: string, headerActions = "") {
  revision++;
  const dialog = dialogElement();
  if (!dialog.open) anchor = { id: ++serial, ...pageGeometry() };
  document.querySelector<HTMLElement>("#dialog-content")!.innerHTML =
    `<div class="dialog-head"><h2>${title}</h2>${headerActions}<button class="btn icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div>${body}`;
  dialog.showModal();
}

export function closeDialog() {
  revision++;
  dialogElement().close();
}
