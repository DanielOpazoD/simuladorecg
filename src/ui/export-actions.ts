import { cloneCase, type ECGCase, type Signal } from "../engine/types";
import { caseReading } from "../presets/case-context";
import { renderPaper } from "../render/ecg";
import { openDialog } from "./dialog";
import { esc } from "./helpers";
import { download, encodeCase, pngWithDpi, saveCase } from "./persistence";

export interface ExportContext {
  c: ECGCase;
  signal: Signal | null;
  canExport: boolean;
  hideName: boolean;
  toast: (message: string) => void;
  refreshDialog: () => void;
}

export async function handleExportAction(
  action: string,
  { c, signal, canExport, hideName, toast, refreshDialog }: ExportContext,
): Promise<boolean> {
  switch (action) {
    case "png": {
      if (!signal || !canExport) {
        toast("El PNG estará disponible al generar correctamente la señal.");
        return true;
      }
      const canvas = document.createElement("canvas"),
        exportCase = cloneCase(c);
      exportCase.view.palette = "paper";
      renderPaper(canvas, signal, exportCase, 1000, {
        pxPerMm: 300 / 25.4,
        ratio: 1,
        hideName,
        displayName: caseReading(c).title,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          download(await pngWithDpi(blob, 300), "ecg-lab-300dpi.png");
          toast("PNG exportado a 300 dpi");
        }
      }, "image/png");
      return true;
    }
    case "json":
      download(
        new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }),
        "ecg-lab-caso.json",
      );
      toast("Caso JSON exportado");
      return true;
    case "import":
      document.querySelector<HTMLInputElement>("#file-input")!.click();
      return true;
    case "share": {
      const url = location.origin + location.pathname + encodeCase(c);
      try {
        await navigator.clipboard.writeText(url);
        toast("Enlace del caso copiado");
      } catch {
        openDialog(
          "Enlace del caso",
          `<p>Copia este enlace:</p><textarea readonly rows="5">${esc(url)}</textarea>`,
        );
      }
      return true;
    }
    case "save": {
      const name = document.querySelector<HTMLInputElement>("#save-name")!.value.trim();
      if (!name) {
        toast("Escribe un nombre para el caso");
        return true;
      }
      const copy = cloneCase(c);
      copy.name = name;
      try {
        saveCase(copy);
        toast("Caso guardado en este navegador");
        refreshDialog();
      } catch {
        toast("No se pudo guardar. Exporta el caso como JSON.");
      }
      return true;
    }
    default:
      return false;
  }
}
