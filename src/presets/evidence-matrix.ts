import { PRESETS, fromPreset } from "./catalog";
import { modelProvenance } from "./model-provenance";

/** The default catalogue configuration only. UI provenance must use the current
 * case: a conduction/overload/phase/source edit can select a different generator. */
export function presetEvidence() {
  return PRESETS.map(p => {
    const pending = p.strategy === "pending";
    const model = pending ? null : modelProvenance(fromPreset(p, undefined, { natural: false }), p);
    return {
      id: p.id, nombre: p.name, categoria: p.group,
      estado: pending ? "pendiente" : "aproximado",
      mecanismo: model?.summary ?? "Sin modelo disponible.",
      fuentes: model?.sources ?? [],
      evidencia: model?.evidence ?? "No implementado.",
      limitacion: model?.limitations.join(" ") ?? p.limitation,
      validacionClinica: "pendiente",
    };
  });
}

export function presetEvidenceMarkdown(): string {
  const cell = (x: string) => x.replaceAll("|", "\\|").replaceAll("\n", " ");
  return "# Estado de los patrones\n\n" +
    "Generado por `node scripts/model-provenance.mjs` desde el catálogo y la selección efectiva del motor. Comprueba su vigencia con `node scripts/model-provenance.mjs --check`.\n\n" +
    "Ningún patrón se presenta como validado clínicamente. Los 63 patrones activos figuran como aproximados y los cinco pendientes continúan sin modelo. «Aprendido» identifica la procedencia de los coeficientes; no significa validación clínica. La estrategia histórica del catálogo no determina el generador efectivo.\n\n" +
    "La tabla describe la configuración predeterminada. Cambiar conducción, fase, sobrecarga, electrolitos o fuente ventricular puede cambiar la familia del generador. La interfaz consulta la misma función de procedencia con el caso actual. Para las fases y sus combinaciones, véase [alcance vigente](alcance-actual.md).\n\n" +
    "| ID | Patrón | Estado | Mecanismo efectivo | Procedencia | Límite |\n|---|---|---|---|---|---|\n" +
    presetEvidence().map(p => `| ${[p.id, p.nombre, p.estado, p.mecanismo, p.fuentes.join(", ") || (p.estado === "pendiente" ? "Sin modelo" : "Paramétrica"), p.limitacion].map(cell).join(" | ")} |`).join("\n") + "\n";
}
