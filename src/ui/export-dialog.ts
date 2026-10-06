import type { ECGCase } from "../engine/types";
import { icon, btn, esc } from "./helpers";

export function exportDialogHtml(
  c: ECGCase,
  canExport: boolean,
  saved: ECGCase[],
) {
  return `<p class="dialog-lead">Conserva el trazado o comparte exactamente el mismo caso y semilla.</p><div class="export-options"><button data-action="png" ${canExport ? "" : "disabled"}>${icon("download")}<div><strong>PNG de impresión</strong><span>Papel completo · 300 píxeles por pulgada</span></div>${icon("chevron")}</button><button data-action="json">${icon("save")}<div><strong>Exportar caso JSON</strong><span>Parámetros, vista y semilla reproducible</span></div>${icon("chevron")}</button><button data-action="import">${icon("book")}<div><strong>Importar caso JSON</strong><span>Carga un caso exportado desde ECG Lab</span></div>${icon("chevron")}</button><button data-action="share">${icon("share")}<div><strong>Copiar enlace del caso</strong><span>El estado completo viaja en el enlace</span></div>${icon("chevron")}</button></div><div class="save-form"><label class="field"><span>Nombre del caso personal</span><input id="save-name" maxlength="100" value="${esc(c.name)}"/></label>${btn("save", "Guardar en este navegador", "save")}</div>${
    saved.length
      ? `<h3>Mis casos</h3><div class="saved-list">${saved
          .map(
            (x, i) =>
              `<button data-saved="${i}">${esc(x.name)}${icon("chevron")}</button>`,
          )
          .join("")}</div>`
      : ""
  }`;
}
