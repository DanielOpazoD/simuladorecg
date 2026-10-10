# Índice de la documentación

Punto de entrada a `docs/`. La navegación vigente empieza en el [README](../README.md) y en la [matriz de alcance](alcance-actual.md). Ningún documento acredita validación clínica. Los registros históricos se conservan tal cual y sus cifras no describen el HEAD actual.

## Alcance y modelo vigentes
- [Matriz vigente de alcance por fase](alcance-actual.md): implementado, probado y pendiente.
- [Estado de los patrones](estado-presets.md) · [JSON](estado-presets.json).
- [Modelo y decisiones](modelo.md) · [Enfoque clínico y contratos de fidelidad](enfoque-clinico.md) · [Aceptación de fenotipos](aceptacion-fenotipos.md).
- [Patrones y variantes en la hoja](diagnosis-navigation.md).

## Contratos del producto (P1–P9)
- [P1 · Fisiología basal y adquisición invertida](p1-acquisition-contract.md)
- [P2 · Límites visibles de repolarización secundaria](p2-secondary-repolarization-limits.md)
- [P3 · CI del código integrado y del artefacto servido](p3-ci-contract.md)
- [P4 · Versión, alcance y procedencia de informes](p4-version-provenance.md)
- [P5 · Derechos y contribución](p5-licensing-contribution.md) · [estado de licencias](licensing-status.json)
- [P6 · Sesión del trazado](p6-trace-session.md)
- [P7 · Registro de las doce derivaciones](p7-lead-registry.md)
- [P8 · Feedback de los ejercicios](p8-practice-feedback.md)
- [P9 · Calibres, teclado y contraste](p9-keyboard-calipers.md)

## Generador: despolarización
- [Fuente ventricular separada del ritmo (v1.5)](ventricular-source-v1.5.md)
- [Activación regional BRD](regional-rbbb-activation.md)
- [Eje en ritmos ventriculares polimórficos](polymorphic-axis.md)
- Amplitud QRS: [R posterior](posterior-qrs-amplitude.md) · [sobrecarga del VD](rv-qrs-amplitude.md) · [onda delta WPW](wpw-qrs-amplitude.md)

## Generador: repolarización
- [Repolarización secundaria: alcance vigente](secondary-repolarization-v1.md) · [contrato QRS-repolarización](qrs-coupled-repolarization-contract.json)
- [Coherencia de repolarización A01 → A02/A03](repolarization-coherence.md)
- [Repolarización regional v1.4](regional-repolarization-v1.4.md) · [protocolo v1.4](repolarization-protocol-v1.4.md)

## Analizador y medición
- [Integridad de entrada antes de medir](sample-input-contract.md)
- [Calidad y procedencia de las medidas](measurement-support-quality.md) · [Medidas retiradas entre etapas](audit-rejection-provenance.md)
- [FC: incertidumbre de detección](hr-detection-quality.md) · [Discriminación QRS–T y límites](qrs-t-discrimination.md) · [Componentes de QRS ancho](wide-qrs-candidates.md)
- [Pico T sin QT fabricado](t-peak-evidence.md)
- Final de T: [ayuda por área](t-end-area-assistance.md) · [estratos de concordancia](t-end-confidence.md) · [concordancia visible](t-end-confidence-ui.md) · protocolos [área](t-end-area-protocol.json) y [concordancia](t-end-confidence-protocol.json)
- [Monitor 0,5–40 Hz y fase cero](monitor-phase-revision.md)
- Ruido: [estrés calibrado y abstención](noise-stress.md) · [contrato de regresión](noise-regression-contract.md)

## Referencias externas y benchmarks (fuera del producto)
- LUDB: [línea base congelada](ludb-frozen-baseline.md) · [expansión preseleccionada](ludb-expansion-protocol.md) · [delineación v2](ludb-delineation-v2.md)
- PTB-XL+: [referencia morfológica](ptbxl-morphology-reference.md) · [brecha del generador](generator-ptbxl-gap.md)
- STAFF III: [exploración](staff-exploration-v1.4.md) · [selección del banco](staff-selection-v1.4.md)
- [Referencias aportadas](referencias/README.md)

## Interfaz y accesibilidad
- [Espacio visual del ECG](visual-workspace.md) · [Teclado y móvil](mobile-accessibility.md) · [Recuperación del motor web](worker-recovery.md)

## Registros históricos (no describen el HEAD)
- v1.4: [verificación](verificacion-v1.4.md) · [reejecución de v1.3](baseline-recheck-v1.4.md) · [metrología](metrologia-v1.4.md)
- v1.3: [README](README-v1.3.md) · [verificación](verificacion.md) · [entrega HTML](ECG_Lab_Entrega_v1.3.html) · [regresión de detección](detection-regression-v1.3.json)
- v1.2: [verificación](verificacion-v1.2.md) · [auditoría HTML](auditoria-v1.2.html) · v1.1: [verificación](verificacion-v1.1.md)
- Análisis congelado: [freeze](analysis-freeze.json) · [comparación pareada](analysis-paired-comparison.json) · [revisión post-freeze](analysis-post-freeze-review.json) · validación [completa](analysis-validation-all.json) y [desarrollo](analysis-validation-development.json)
- Fidelidad: [informe](fidelity-report.json) · [antes/después](fidelity-before-after.json) · [regresión de detección](detection-regression.json)
- Material gráfico y casos: `browser-captures/`, `trazados/`, `casos/`

- [Referencia tabular QRS con unidades trazables](ptbxl-tabular-amplitude-reference.md)

- [Evaluación prospectiva del final T reservado](t-end-reserved-evaluation.md): protocolo, límites y resultados de la reserva, sin habilitar QT automático

- [Referencias originales y auditoría de escala](annotated-morphology-reference.md): morfología anotada, límites de amplitud LUDB y control de originales PTB-XL
