# ECG Lab · v1.3

Simulador educativo de electrocardiografía, en español. Aplicación estática sin backend ni interpretación con IA. El producto muestra señales sintetizadas desde eventos y kernels vectoriales. Las pruebas del repositorio incorporan un pequeño conjunto público de ECG anotados de LUDB; esos registros no se cargan en la interfaz ni se usan como trazados del simulador.

## Ejecutar

Requiere Node.js 20.19+ (recomendado Node 22 o 24) y npm.

```bash
npm ci
npm run dev
```

Vite informa la dirección local. Para comprobar el motor y generar la versión distribuible:

```bash
npm run check
```

El directorio `dist/` contiene una aplicación estática. Debe servirse mediante HTTP; abrir `index.html` directamente como archivo no permite cargar correctamente el Web Worker. No hay claves, variables de entorno de negocio ni servicios externos necesarios. Las fuentes tipográficas se solicitan a Google Fonts y tienen alternativas locales si no están disponibles.

## Lo que incluye

- **61 presets activos** y 5 patrones adicionales marcados como pendientes. Todos se identifican como aproximados; ninguno se presenta como validado clínicamente.
- Papel de 12 derivaciones en **3×4, 3×4 + II, 3×4 + II/V1/V5, 6×2 y 12×1**. Registro de 10 s, segmentos secuenciales o simultáneos, orden estándar o Cabrera con −aVR.
- Monitor de una derivación, barrido continuo, congelación y sonido opcional. Se reproduce un buffer sintético determinista, que vuelve a utilizarse en sesiones largas.
- Tiras de ritmo de 30 o 60 s distribuidas en filas consecutivas de 10 s.
- Velocidad 12,5/25/50 mm/s. Ganancia 2,5/5/10/20 mm/mV, con ganancia precordial independiente.
- Grilla milimétrica, tema claro/oscuro y calibración física mediante una regla de 50 mm. Desactivar «Ajustar al ancho» para usar la calibración en pantalla.
- Controles de frecuencia, PR, QRS, QTc, ejes, amplitudes, respiración y variabilidad; combinaciones de conducción, ectopia, repolarización y sobrecarga.
- Calibres por arrastre **en papel y tira de ritmo**, con Δt, ΔV, mm y frecuencia equivalente.
- Delineación independiente por latido, ampliación de una derivación, límites P/QRS/T y comparación en la misma ventana de 10 s. QTc de Bazett, Fridericia, Framingham y Hodges. Auditoría posterior que retira cifras discordantes sin copiar los valores del generador.
- Quiz con cuatro alternativas y revelación de hallazgos. El nombre del caso, los controles, el catálogo, advertencias reveladoras y la exportación quedan ocultos o desactivados hasta responder.
- Exportación PNG con resolución y metadatos de **300 dpi**, exportación/importación JSON, enlace con estado codificado y hasta 30 casos personales en `localStorage`.

## Catálogo

Incluye ritmos sinusales, FA lenta/controlada/rápida, flutter 2:1 y 3:1, TSV regular aproximada, ritmo de la unión, ESA/ESV, bigeminismo/trigeminismo/duplas, idioventricular/RIVA, TV monomórfica, TV polimórfica visual, FV, asistolia; bloqueos AV; bloqueos de rama/fasciculares; preexcitación; patrones regionales de ST, Wellens, de Winter, pericarditis, BRI con lesión; sobrecarga derecha/izquierda; estimulación AAI/VVI/DDD; T prominente por hiperpotasemia, U por hipopotasemia, QT largo/corto y bajo voltaje.

El alcance específico y el motivo de aproximación de **cada preset** están en [docs/estado-presets.md](docs/estado-presets.md). El catálogo fuente y los textos educativos son datos editables en `src/presets/catalog.ts`. En [docs/casos/](docs/casos/) hay ejemplos JSON importables.

## Arquitectura

| Capa | Responsabilidad | Archivos principales |
|---|---|---|
| Modelo | Caso serializable, eventos, anatomía vectorial, memoria QT | `types.ts`, `rhythm.ts`, `constraints.ts`, `morphology.ts`, `repolarization.ts` |
| Señal | Proyección, artefactos, filtrado y antialias | `leads.ts`, `signal.ts`, `filter.ts` |
| Análisis independiente | Solo muestras y frecuencia de muestreo | `measure.ts`, `analysis/ventricular-candidates.ts`, `analysis/impulses.ts`, `analysis/statistics.ts`, `analysis/evidence.ts` |
| Auditoría del simulador | Compara con referencia; puede retirar, nunca rellenar medidas | `reference.ts`, `analysis/model-audit.ts` |
| Trabajo en segundo plano | Síntesis y análisis; transferencia de buffers; coalescencia de cambios | `worker.ts`, `protocol.ts`, `ui/signal-controller.ts` |
| Presentación | Papel calibrado, detalle del latido, estados y diálogos | `render/ecg.ts`, `ui/beat-detail.ts`, `ui/measurement-dialog.ts`, `ui/case-state.ts`, `presets/case-context.ts` |
| Evidencia | Pruebas, fixtures independientes y reportes reproducibles | `tests/`, `tests/reference/ludb/`, `scripts/validate-analysis.mjs`, `scripts/validate-detection.mjs`, `docs/` |

Stack: **Vite + TypeScript + Canvas 2D**, sin framework de UI. El motor usa un PRNG con semilla. Los relojes de activación y el ruido tienen secuencias aleatorias separadas. La síntesis se ejecuta a 1.000 Hz en un Web Worker; la salida a 500 Hz se dibuja preservando extremos por columna de píxel. La interfaz puede cambiar escalas sin volver a generar la señal.

Al modificar la fisiología se invalidan inmediatamente el trazado y sus medidas hasta recibir la nueva señal. Un error de generación conserva ese estado sin resultados; no permite exportar el ECG anterior bajo los parámetros nuevos. Restablecer permite reintentar.

Más detalle y referencias: [docs/modelo.md](docs/modelo.md).

## Mejoras de esta versión

La iteración 1.3 corrige contratos entre controles, señal, etiquetas y presentación. Conserva el catálogo y las funciones existentes. El [enfoque clínico](docs/enfoque-clinico.md) orienta la revisión: describir lo observado, valorar territorialidad, reciprocidad y proporcionalidad, y distinguir esas observaciones de inferencias sobre oclusión o anatomía coronaria.

1. **Importaciones coherentes:** se comprueba que la fisiología corresponda al preset declarado. Si difiere, el caso pasa a personalizado y se retira el nombre automático del preset cuando procede. Esta comprobación no altera los parámetros normalizados de señal, semilla o vista ni identifica automáticamente un preset por semejanza.
2. **BRI con lesión concordante:** seleccionar este ejemplo configura BRI, QRS de 160 ms, eje −15° y ausencia de Q septal. Una importación con conducción o anchura incompatibles conserva sus parámetros y muestra un aviso. El ejemplo no ejecuta criterios diagnósticos de Sgarbossa.
3. **Controles de ST/T consistentes:** amplitud T cero anula todos sus componentes vectoriales y locales. La intensidad escala la T regional de Wellens y el ST/T de de Winter respecto del valor de referencia 2; «ST resuelto» desactiva los aportes ST/T de lesión. U, QRS y ST secundario conservan sus controles o mecanismos propios. La interfaz declara qué componente afecta la intensidad.
4. **Límite explícito del motor:** se informa «Fuera del alcance del modelo» si se superponen soportes QRS o si una extrasístole programada inicia su QRS antes del soporte T previo. No se desplazan ni eliminan latidos para admitir el caso. Es una política conservadora del motor aditivo; no estima el período refractario efectivo ni declara imposible esa prematuridad en pacientes.
5. **Estado visual y pruebas eléctricas:** pausa, etiquetas, disponibilidad y estado de calibres se sincronizan desde una misma función. Se comprueba el error absoluto de las identidades eléctricas y la independencia de las ocho derivaciones fuente respecto de ajustes de vista.

Se añade una [base inicial de aceptación de fenotipos](docs/aceptacion-fenotipos.md): 61 comprobaciones comunes y 24 verificaciones específicas sobre muestras de 12 presets, con filtro apagado y diagnóstico. Es una protección contra regresiones del generador; la revisión clínica independiente de los trazados sigue pendiente.

Las mejoras del analizador introducidas en v1.2 y sus resultados se conservan íntegros en la [verificación histórica de v1.2](docs/verificacion-v1.2.md). Los fundamentos y límites del motor están en [modelo.md](docs/modelo.md).

## Verificación de esta entrega

La suite reúne **293 pruebas en 11 archivos**, con contratos de importación, amplitud, prematuridad, fenotipos y las pruebas previas del motor y analizador. El cierre de la ejecución completa se registra en [docs/verificacion.md](docs/verificacion.md). No constituye validación clínica.

```bash
npm ci
npm run check
node scripts/validate-detection.mjs --output docs/detection-regression-v1.3.json
```

`npm run check` ejecuta Vitest, TypeScript y la compilación de producción. Los **61 presets por defecto** permanecen dentro del alcance del motor. El barrido conserva sus **313 configuraciones**: **283 comparadas y 30 fuera de alcance**, con configuración y motivo registrados. Entre las admitidas no se añaden omisiones ni falsos positivos frente al analizador de referencia v1.1; persisten 12 omisiones en las variantes de duplas. Las 30 exclusiones no cuentan como aciertos ni como fallos del detector.

**60 de los 61 hashes de señal se conservan.** El de bajo voltaje cambia por el escalado correcto de la componente Z de T; su diferencia precordial es intencional y el cambio de hash en DII corresponde a redondeo numérico mínimo. La [aceptación de fenotipos](docs/aceptacion-fenotipos.md) publica la diferencia, ambos hashes y el alcance de la comparación.

Evidencia de v1.3:

- [Método, resultados y límites](docs/verificacion.md).
- [313 configuraciones, admisión y regresión de detección](docs/detection-regression-v1.3.json).
- [Contratos iniciales de fenotipos](docs/aceptacion-fenotipos.md).

La evaluación completa de ocho registros LUDB **no se repitió en esta entrega**. Los reportes [analysis-validation-all.json](docs/analysis-validation-all.json), [analysis-paired-comparison.json](docs/analysis-paired-comparison.json), [detection-regression.json](docs/detection-regression.json) y [fidelity-report.json](docs/fidelity-report.json) pertenecen a v1.2. Los ocho ECG son registros de regresión ya conocidos; no constituyen una nueva reserva independiente. Las pruebas automatizadas existentes sobre los cuatro registros de desarrollo siguen formando parte de la suite. [Procedencia y licencia de LUDB](tests/reference/ludb/README.md).

El estado de la revisión real de navegador de v1.3 se registra por separado en [verificacion.md](docs/verificacion.md). El smoke opcional `tests/browser-smoke.mjs` requiere Playwright y **no se ejecutó como script independiente**. Las capturas y los renderizados de `docs/trazados/` anteriores mantienen su carácter histórico; estos últimos proceden directamente de Canvas y no son capturas del navegador.

Para regenerar renderizados directos, sin atribuirles revisión clínica:

```bash
npm install --no-save @napi-rs/canvas
node scripts/render-evidence.mjs
```

## Límites importantes

1. Dipolo único aproximado: no incorpora torso individual, conductividades tisulares ni propagación celular. La morfología sintética no está calibrada frente a una población representativa de ECG reales.
2. Posterior, Wellens, de Winter y PR de pericarditis recurren a ajustes locales documentados. Las derivaciones de extremidades conservan sus identidades algebraicas.
3. Marcapasos representa estimulación periódica con captura; demanda, sensado, refractariedad programable y fallos no están implementados.
4. TV polimórfica muestra torsión visual del eje; no reproduce el QT previo ni la secuencia de inicio de torsades. Captura/fusión en TV quedan pendientes.
5. FA + BAV completo es una combinación clínicamente posible que aún no está implementada. Las opciones AV se desactivan al seleccionar ritmos no sinusales por alcance del simulador.
6. La memoria QT es una aproximación universal, sin restitución celular rápida ni parámetros individuales. Los cambios de controles reinician el registro; no representan una intervención sobre un paciente continuo. La fase «ST resuelto» desactiva los aportes ST/T de lesión; no genera cicatriz ni ondas Q patológicas.
7. Admitir un caso no demuestra validez fisiológica. Las nuevas fronteras de prematuridad dejan fuera algunas combinaciones; dentro de las admitidas el detector aún puede confundir ondas en variantes de frecuencia alta, ectopia o superposición. La auditoría puede retirar intervalos aunque la FC sea correcta; se conserva la causa. P/T fusionadas requieren calibres. La protección de espigas tiene un fallo reproducido a 250 Hz; no debe extrapolarse fuera del flujo nativo de 500 Hz.
8. Los filtros tienen bandas nominales y no han sido certificados como filtros diagnósticos. Un paso alto agresivo altera ST y T.
9. V7–V9, V3R–V4R, Brugada, Osborn, efecto digitálico, alternancia eléctrica y dextrocardia están pendientes.
10. La sesión verificó la interfaz en escritorio; falta prueba completa en móviles, accesibilidad asistida y rendimiento físico. El monitor sigue reproduciendo un buffer finito.

## Atajos

| Tecla | Acción |
|---|---|
| P | Papel de 12 derivaciones |
| M | Monitor |
| R | Tira de ritmo |
| Espacio | Congelar/reanudar monitor |
| V | Siguiente velocidad |
| G | Siguiente ganancia |

Los atajos no actúan dentro de entradas de texto o diálogos. El sonido requiere activación explícita del usuario por las restricciones normales de Web Audio.

## Próxima prioridad dentro del alcance actual

Ampliar de forma predefinida el conjunto independiente y la revisión de lectores, estudiar el inicio QRS de baja pendiente y las superposiciones P/T, y resolver la sensibilidad al muestreo de los impulsos. Los cuatro controles utilizados ya están expuestos: una siguiente evaluación necesita registros nuevos reservados. La prioridad continúa siendo exactitud y cobertura de lo existente.

## Reproducibilidad entre versiones

Caso, semilla y versión del motor identifican un resultado. Los JSON de esquema 1 siguen siendo importables; se normalizan con el esquema existente y se comprueba aparte su etiqueta. v1.3 se desarrolla sobre v1.2, commit `d8bb0a27710de2537737f2c1b03b14ad15b62598`. La corrección de T modifica algunas señales al cambiar su amplitud o intensidad; entre los presets por defecto solo cambia el hash de bajo voltaje. Algunas configuraciones extremas antes sintetizadas ahora informan que están fuera de alcance.

El analizador de referencia usado por el barrido sigue siendo v1.1, commit `ad5a53261a7ac170297b32e7709ec158c2ed45c4`, conservado en `tests/reference/baseline-v1.1.mjs`. Comparar ambos analizadores sobre las mismas muestras admitidas de v1.3 permite vigilar detección; no constituye una nueva comparación clínica de v1.2 con v1.3.

Los resultados históricos conservan sus versiones: [v1.2](docs/verificacion-v1.2.md), [v1.1](docs/verificacion-v1.1.md) y comparación v1.0→v1.1 en `docs/fidelity-before-after.json`. La congelación anterior al primer control LUDB y la corrección posterior de auditoría de v1.2 permanecen en `docs/analysis-freeze.json` y `docs/analysis-post-freeze-review.json`; no representan una nueva congelación o reserva en v1.3.
