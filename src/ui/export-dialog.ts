import type { ECGCase } from "../engine/types";
import { icon, btn, esc } from "./helpers";

export function exportDialogHtml(
  c: ECGCase,
  canExport: boolean,
  saved: ECGCase[],
  storageWarning: string | null = null,
) {
  return `${storageWarning ? `<p class="warning" role="status">${esc(storageWarning)}</p>` : ""}<p class="dialog-lead">Señales sintéticas sin validación clínica.</p><div class="export-options"><button data-action="png" ${canExport ? "" : "disabled"}>${icon("download")}<div><strong>PNG de impresión</strong><span>Papel completo · 300 píxeles por pulgada</span></div></button><button data-action="json">${icon("save")}<div><strong>Exportar caso JSON</strong></div></button><button data-action="import">${icon("book")}<div><strong>Importar caso JSON</strong></div></button><button data-action="share">${icon("share")}<div><strong>Copiar enlace del caso</strong></div></button></div><details class="local-case-storage"><summary>Guardar en este navegador</summary><p class="control-note">Hasta 30 casos. Guardar con el mismo nombre actualiza ese caso; no se elimina el más antiguo al alcanzar el límite. Se guardan parámetros y semilla, no una historia clínica.</p><div class="save-form"><label class="field"><span>Nombre del caso personal</span><input id="save-name" maxlength="100" value="${esc(c.name)}"/></label>${btn("save", "Guardar caso", "save")}</div>${
    saved.length
      ? `<h3>Mis casos</h3><div class="saved-list">${saved
          .map(
            (x, i) =>
              `<button data-saved="${i}">${esc(x.name)}${icon("chevron")}</button>`,
          )
          .join("")}</div>`
      : ""
  }</details>`;
}
