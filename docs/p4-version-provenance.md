# P4 · Versión, alcance y procedencia de informes

## Contrato

`package.json` define la versión del producto 1.4.0. `src/ui/version.ts` la importa y la UI la presenta en `data-product-version`; el build utiliza la misma versión y `revision=v{version}`. El esquema JSON del caso sigue siendo 1, sin migración. No se modifica `src/engine/` ni la señal.

`validate-analysis.mjs` mantiene estadísticas, ventanas, fuentes LUDB y comparador v1.1. Solo cambia la procedencia: versión real, commit, árbol, estado de entradas evaluadas y SHA-256 sobre motor y código de evaluación. El hash no es exactitud clínica. Una copia sin Git informa null en sus campos Git. Las salidas nuevas van a `.sites-runtime/`, salvo `--output` explícito: no reemplazan los informes históricos versionados por defecto.

## Aceptación

`tests/version-contract.test.ts` comprueba paquete/lock/UI/README. `tests/report-identity.test.mjs` verifica hash reproducible, corrupción discriminada y copia sin Git. `tests/browser-fidelity.mjs` compara la versión visible con el manifiesto servido, y `scripts/verify-production.mjs` comprueba revisión/versión además de commit y bytes.

La regresión de señales existente compara las doce derivaciones de 61 defaults con igualdad exacta y la matriz regional con sus contratos. Se conserva el código del detector. Una reejecución LUDB debe mantener todos los resultados numéricos al excluir los campos de procedencia; no se declara una nueva reserva clínica.

## Estado histórico y clínico

README documenta merges ya realizados (v1.4 y P1–P3), pero no declara la URL privada desplegada. La matriz por fase documenta las correcciones aditivas y el dominio reducido; no cambia los límites de la guía original ni su bibliografía. La revisión aportada se conserva íntegra. Este PR no concede una licencia, no añade presets y no certifica protección administrativa de main.
