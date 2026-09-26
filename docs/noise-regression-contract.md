# Protección exigible de ST/T/QRS y calidad ante ruido

## Qué añade, y qué no

Continúa los PR #19 (ensayo NSTDB) y #20 (revisión de confianza de FC). No crea
un segundo generador de ruido, no cambia filtros, ondas, detector, interfaz,
versión ni dependencias del producto. Añade una condición de aceptación sobre
muestras y resultados: el ensayo puede fallar por regresión, no solo por errores
de descarga o ejecución. `src/` y `public/` permanecen intactos en esta entrega.

La guía de datos proponía proteger ST/T/QRS y declarar calidad insuficiente.
No se usa `measure(clean)` como verdad: la morfología se contrasta con muestras
limpias y ventanas sintéticas; el analizador recibe exclusivamente `{fs,leads}`.

## Dos antecedentes, una comparación explícita

- `784173f`: lector y protocolo de adquisición NSTDB originales de PR19.
- `aee59f6`: producto aceptado después de PR20, referencia de no regresión.
- Candidato: código realmente propuesto en el PR, no su informe histórico.

Se reconstruyen ambas versiones en worktrees. El MISMO evaluador actual aplica
las MISMAS ventanas de ruido a ambas. Los kernels de filtro y la entrada de
análisis proceden de cada versión respectiva; no se evalúan ambos brazos con el
filtro del candidato. La CI usa `analyzeSamples()` (entrada del worker), no solo
el primitivo histórico `measure()`, y nunca usa `auditMeasurement()`.

El CLI histórico mantiene por defecto `--analyzer primitive`. La nueva CI pide
`--analyzer worker` explícitamente y cada informe identifica cuál fue ejecutado.
Una verificación de dependencias del bundle impide importar la referencia
sintética en el analizador. Ambas ramas comparten el extractor morfológico, que
no se presenta como delineador independiente.

## Matriz y unidades conservadas

Cinco presets, tres ruidos bw/ma/em, tres ventanas 60/180/300 s, cinco SNR,
cuatro filtros: **920 escenarios** (900 contaminados, 20 controles). Aparte,
**20 comparaciones nativas limpias**. Son ventanas expuestas, no nuevos pacientes
ni un nuevo holdout. No se ajustan las ondas o la política de FC con estos datos.

Permanecen el lector WFDB212, sus checksums y contraste digital con WFDB Python,
la ganancia original desconocida, el remuestreo 360→500 Hz y las mezclas fijas.
La calibración RMS agregada sobre ocho derivaciones NO es el SNR ponderado por
QRS de `nst`, ni representa doce ruidos de electrodos independientes.

Se distinguen cadena nativa (filtro a 1000 Hz antes de diezmar) y estrés
postadquisición (500 Hz). No se supone equivalencia entre ellas. Ventanas,
notch desactivado, guardas y criterios de anotación son los de PR19.

## Qué hace fallar la aceptación

1. **Integridad:** caso ausente, repetido o reemplazado; menos derivaciones,
   métricas/valores no finitos; SNR incorrecto; protocolos, ruido, señal limpia
   o ventanas distintos. No se puede alterar la fuente limpia para redefinir
   la verdad y aprobar el filtro. No se rellenan valores ausentes con ceros.
2. **Morfología:** aumento de media, p95 (cuantil tipo 7) o máximo del error
   absoluto de J, J+60, QRS pico-pico, pico T o área T absoluta. Se estratifica
   por preset/ruido/SNR/filtro/tipo de latido/derivación: mejorar una derivación
   no compensa empeorar otra. RMSE tiene su comprobación adicional y no puede
   compensar una pérdida de ST/T. Las cadenas nativa/post se comparan aparte.
3. **Detección:** menos TP o más FP/FN con los mismos eventos de referencia.
4. **Calidad:** más errores conservados como `usable`, menos observaciones
   correctas `usable`, menos observaciones correctas retenidas o más salidas sin
   referencia comparable. Convertir todo en `review` o retirar todo no aprueba.

Las banderas de error de PR19 (5 lpm, 20/30 ms, 0,02 mV, etc.) NO se modifican.
Para comparar ejecuciones se permite solo holgura numérica: 1e-6 mV y 1e-8 mV·s.
Es mucho menor que las banderas de revisión y no constituye exactitud clínica.
Los contadores son enteros, sin tolerancia. Los totales se recalculan de las
filas; no se confía en resúmenes suministrados por el candidato.

## Interpretación de calidad y cobertura

`review` conserva una cifra y una advertencia: **no es abstención**. Abstención
significa ausencia de cifra o estado `unavailable`. Una cifra ausente no tiene
error cero. Los recuentos de QRS/QT corresponden a errores de latidos emparejados
bajo un estado global del analizador: no son probabilidades por latido ni una
validación de la mediana global. FC usa la referencia temporal de PR19.

El informe conserva cifras retenidas correctas/erróneas, denominadores,
abstenciones, resultados sin referencia, estratos y todos los incumplimientos.
**La referencia puede ser inexacta.** Conservarla sin empeorar puede dar verde
mientras persisten errores; las banderas preexistentes siguen visibles. No se
transforma CI verde en una afirmación de seguridad clínica.

Cambios intencionales de fuente o un intercambio entre cobertura y error
necesitan una enmienda revisada en otro PR, resultados antes/después y motivos.
Nunca regenerar la referencia automáticamente para borrar un fallo. La regla
es conservadora para proteger lo existente, no una función de optimización.

## Ejecución

```bash
npm ci
node --test tests/noise-regression.node.mjs
npx vitest run tests/noise-stress.test.ts
# DATA: salida del lector congelado de PR19; BASE: worktree exacto de aee59f6
mkdir -p "$OUT/before" "$OUT/after"
node scripts/benchmark-noise-stress.mjs "$OUT/before" --noise-dir "$DATA" --source-root "$BASE" --analyzer worker
node scripts/benchmark-noise-stress.mjs "$OUT/after" --noise-dir "$DATA" --analyzer worker
node scripts/check-noise-regression.mjs "$OUT/before/noise-results.json" "$OUT/after/noise-results.json" "$OUT/acceptance-results.json"
```

El workflow `Calibrated ECG noise stress` realiza adquisición, comparación y
aceptación. Ahora se dispara también al cambiar motor, presets, extractor,
evaluador o dependencias. La CI general ejecuta las pruebas adversarias sin red.
Los resultados se archivan incluso ante fallo, junto a código exacto, hashes,
licencia y paquetes. No se añaden datos reales al bundle del navegador.

## Referencias y límites

- Protocolo previo: [ruido calibrado](noise-stress.md).
- Confianza de FC: `src/engine/sample-analysis.ts`, PR20 y su réplica temporal.
- NSTDB 1.0.0: https://physionet.org/content/nstdb/1.0.0/ .
- Definición de SNR de la herramienta original:
  https://physionet.org/physiotools/wag/nst-1.htm .

Los datos expuestos no se renombran reserva independiente. Se preservan las
licencias existentes; no hay revisión humana nueva, despliegue ni validación
clínica. Esta entrega protege contra regresiones, no repara por sí sola los
sesgos documentados de filtros y mediciones.
