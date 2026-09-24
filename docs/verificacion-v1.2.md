# Verificación de ECG Lab 1.2

24 de septiembre de 2026. Esta entrega fortalece las medidas y sus controles de calidad. El catálogo conserva 61 presets activos y cinco pendientes. La síntesis, los filtros y las funciones de la interfaz mantienen su alcance de v1.1.

## Resultado y alcance

**150 pruebas en siete archivos**, TypeScript y compilación de producción. Los 61 hashes de señal conservan los valores de v1.1; no se actualizaron para acomodar los cambios del analizador. Se añade un barrido de 313 escenarios sintéticos y un pequeño banco externo LUDB. Son comprobaciones de ingeniería; no establecen validez clínica del producto.

| Archivo de pruebas | Casos | Responsabilidad |
|---|---:|---|
| `engine.test.ts` | 95 | Electricidad, calendario, estado, determinismo y 61 snapshots de señal |
| `fidelity.test.ts` | 21 | QT, filtros, ST, fisiología y propagación del rechazo |
| `delineation.test.ts` | 10 | Ondas analíticas independientes, muescas, T bifásica, U y ruido |
| `worker-queue.test.ts` | 1 | Coalescencia de peticiones |
| `discrimination.test.ts` | 10 | T prominente, impulsos y conservación de QRS en patrones problemáticos |
| `audit.test.ts` | 8 | Identidad del latido, población, límites individuales, asociación AV y eje circular |
| `external.test.mjs` | 5 | Detección, cobertura y errores QRS en los cuatro registros de desarrollo LUDB |

Reproducir desde el directorio del proyecto:

```bash
npm ci
npm test
npm run build
node scripts/fidelity-report.mjs
node scripts/validate-detection.mjs
node scripts/validate-analysis.mjs --split=all
node scripts/compare-external-pairs.mjs
```

`validate-analysis.mjs` usa por defecto solo desarrollo. `--split=control` y `--split=all` permiten reproducir los resultados expuestos. Los registros están incluidos, con licencia y hashes: no se requiere descargarlos ni instalar una dependencia clínica para ejecutar las pruebas.

## 1. Comparación del analizador sintético

Base: commit **`ad5a53261a7ac170297b32e7709ec158c2ed45c4`**, v1.1. Su analizador compilado se conserva en `tests/reference/baseline-v1.1.mjs`; el reporte registra su SHA256. Ambos analizadores reciben exactamente las mismas muestras generadas por v1.2, cuya síntesis permanece igual a v1.1.

### Casos por defecto, diez segundos

Las columnas v1.1 y v1.2 muestran el **resultado crudo del analizador**, antes de auditoría. En v1.1 algunas cifras erróneas ya eran retiradas de la pantalla; no se afirma que el usuario viera esos valores como aceptados.

| Caso / variable | Referencia sintética | Crudo v1.1 | Crudo v1.2 | Presentación v1.2 |
|---|---:|---:|---:|---|
| Hiperpotasemia / FC | 72 lpm | 144,01 | 72,01 | 72 lpm |
| Escape ventricular / FC | 30 lpm | 93,44 | 30 | 30 lpm |
| WPW / QRS | 135 ms | 235 | 138 | 138 ms |
| WPW / PR | 100 ms | No estimable | 92 | 92 ms |
| AAI / QRS | 90 ms | 134 | 92 | 92 ms |
| VVI / QRS | 165 ms | 202 | 166 | 166 ms, revisar por proximidad a espiga |
| DDD / FC | 65 lpm | No estimable; 22 candidatos | 64,99; 11 candidatos | 65 lpm |
| DDD / QRS | 160 ms | No estimable | 162 | 162 ms, revisar por proximidad a espiga |
| Bigeminismo / QRS | 90 ms en la población medida | 96 | 92 | 92 ms, revisión por heterogeneidad |

El escape ventricular ofrece un ejemplo de prudencia: su QRS crudo es 170 ms frente a 165 ms, pero un límite individual discordante hace que se retire el resumen QRS y sus dependencias. Un error pequeño de la mediana no basta para validar todas las marcas.

Fuente: [analysis-validation-all.json](analysis-validation-all.json). Las referencias sintéticas son tiempos/soportes del generador, no anotaciones clínicas de pacientes.

### Cobertura del catálogo

En los mismos 61 presets, semilla y ventana de diez segundos, las medidas disponibles tras auditoría pasan de:

| Variable | v1.1 | v1.2 |
|---|---:|---:|
| FC | 54 | 58 |
| PR | 36 | 41 |
| QRS | 45 | 54 |
| QT | 31 | 35 |

Esta cobertura incluye estados que requieren revisión. La ausencia de PR/QT es apropiada en varios ritmos; otras ausencias reflejan fallos o incertidumbre. Los recuentos no representan sensibilidad clínica ni porcentaje de presets validados. [fidelity-report.json](fidelity-report.json) conserva referencia de la población medida, referencia de toda la ventana, medidas crudas, presentadas, retiradas y motivos.

### Discriminación en 313 escenarios

`validate-detection.mjs` compara 61 presets por defecto y 252 variantes de frecuencia, semilla y acoplamiento. Evalúa eventos interiores entre 0,3 y 9,7 s, con asociación única dentro del soporte QRS sintético ampliado 30 ms. La comparación es de detección de eventos, no de exactitud de sus límites.

**Ningún escenario añade falsos positivos u omisiones frente a v1.1.** El resultado no significa ausencia absoluta de errores. En las variantes:

| Grupo | Escenarios | Omisiones v1.1→v1.2 | Falsos positivos v1.1→v1.2 |
|---|---:|---:|---:|
| ESV | 60 | 0→0 | 0→0 |
| Bigeminismo | 60 | 0→0 | 0→0 |
| Duplas | 60 | 12→12 | 0→0 |
| TV | 12 | 0→0 | 30→3 |
| Hiperpotasemia | 12 | 0→0 | 150→63 |
| Escape ventricular lento | 12 | 0→0 | 48→0 |
| AAI | 12 | 132→0 | 150→0 |
| VVI | 12 | 0→0 | 0→0 |
| DDD | 12 | 0→0 | 120→0 |

Los conteos suman eventos a través de escenarios relacionados, no personas independientes. Persisten omisiones con ectopia muy prematura y confusión de ondas en variantes rápidas de TV/hiperpotasemia. Informe completo: [detection-regression.json](detection-regression.json).

## 2. Regresión externa con LUDB

Se integraron ocho registros de **LUDB 1.0.1**, con señal original de 12 derivaciones, 500 Hz y diez segundos, y anotaciones P/QRS/T. La base original tiene 200 registros; esta entrega usa una selección de conveniencia muy pequeña. [LUDB en PhysioNet](https://physionet.org/content/ludb/1.0.1/).

- Desarrollo: registros **1, 2, 3, 4**, utilizados para analizar errores y ajustar reglas.
- Control: registros **101, 102, 103, 104**, evaluados por primera vez tras congelar detector, lector y protocolo.
- Datos y atribución: **Open Data Commons Attribution License v1.0**, conservada íntegra. [Licencia LUDB](https://physionet.org/content/ludb/view-license/1.0.1/).
- Lectura: 112 SHA256 de origen y checksums WFDB comprobados. Contraste independiente con WFDB Python 4.3.1: 480 000 muestras físicas y 6474 eventos de anotación coincidentes antes de convertir las muestras a Float32.

La publicación describe anotaciones de consenso por derivación. La referencia global de este benchmark es una agregación propia de I/II/V1/V5, con inicio mínimo y final máximo. No se presenta como un límite global original adjudicado por los cardiólogos. Un límite ausente en origen permanece ausente. El protocolo detallado y la procedencia están en [tests/reference/ludb/README.md](../tests/reference/ludb/README.md).

El medidor recibe únicamente `fs` y muestras. **La auditoría sintética no interviene** en los resultados externos. Se asocian eventos uno a uno a ≤150 ms dentro de la ventana con cobertura de anotaciones; los candidatos fuera de ella se registran por separado. Esa tolerancia identifica complejos: no es una tolerancia de precisión de inicio/final QRS.

### Resultados del protocolo principal

MAE significa error absoluto medio en milisegundos. Los denominadores de inicio, final y duración pueden diferir cuando faltan anotaciones originales.

| Partición / indicador | v1.1 | v1.2 |
|---|---:|---:|
| Desarrollo: QRS identificados | 33/33, FP 0 | 33/33, FP 0 |
| Desarrollo: latidos emparejados con delineación | 27 | 30 |
| Desarrollo: MAE inicio QRS | 42,0 (n=27) | 13,4 (n=30) |
| Desarrollo: MAE final QRS | 27,0 (n=27) | 21,1 (n=30) |
| Desarrollo: MAE duración QRS | 69,0 (n=27) | 31,7 (n=30) |
| Control: QRS identificados | 43/43, FP 0 | 43/43, FP 0 |
| Control: latidos emparejados con delineación | 38 | 42 |
| Control: MAE inicio QRS | 10,3 (n=29) | 12,4 (n=33) |
| Control: MAE final QRS | 14,2 (n=38) | 10,0 (n=42) |
| Control: MAE duración QRS | 19,9 (n=29) | 21,6 (n=33) |

**El control muestra más cobertura y mejor final QRS, pero no mejor precisión de duración ni de inicio.** La duración pasa a tener sesgo medio de −14,4 ms, con un error absoluto máximo de 108 ms. Se publica el fallo junto a los resultados favorables; no se reajustaron parámetros tras observarlo.

Los 42 latidos delineados del control no equivalen a 42 duraciones evaluables: solo 33 tienen ambos límites de referencia completos. Los errores completos, sesgos, percentiles y exclusiones están en [analysis-validation-all.json](analysis-validation-all.json).

### Comprobación descriptiva en los mismos latidos

Después de la evaluación principal se comparó también la intersección de latidos delineados por ambas versiones. Es un análisis descriptivo posterior, sin cambiar el protocolo ni entrenar con control.

| Partición / variable | n común | MAE v1.1 | MAE v1.2 |
|---|---:|---:|---:|
| Desarrollo / duración | 27 | 69,0 ms | 34,1 ms |
| Control / inicio | 29 | 10,3 ms | 12,1 ms |
| Control / final | 38 | 14,2 ms | 9,6 ms |
| Control / duración | 29 | 19,9 ms | 21,5 ms |

El pequeño empeoramiento de duración en control **no se explica solo por añadir latidos**. No se descartó ningún latido previamente comparable. Fuente y script: [analysis-paired-comparison.json](analysis-paired-comparison.json), `scripts/compare-external-pairs.mjs`.

### Congelación y corrección posterior independiente

[analysis-freeze.json](analysis-freeze.json) conserva los hashes previos al primer control. La revisión final encontró después un error lógico de auditoría: un candidato P/PR podía asociarse a un evento ventricular sin asociación AV. Se corrigió y se añadió una prueba, conservando las muestras, detección y delineación congeladas. El cambio de hash se declara en [analysis-post-freeze-review.json](analysis-post-freeze-review.json). La auditoría no se usa en LUDB; los resultados externos permanecen idénticos.

Los cuatro registros de control ya están expuestos. Una futura iteración que ajuste el detector necesita una nueva reserva. Ocho registros no permiten inferir precisión poblacional, equivalencia de morfologías sintéticas o validez clínica. LUDB no anota U; aquí solo se evalúa QRS externo, sin afirmar validación externa de QT ni de separación T/U.

## 3. Límites independientes y espigas

Los fixtures lineales no usan ondas ni eventos del generador. A 500 Hz, el caso limpio devuelve PR 160 ms y QRS 90 ms; QT 398 ms frente a 400 ms conocidos. La T bifásica devuelve QT 478 ms frente a 480 ms, y una U separada no alarga indebidamente el QT. Se conservan cobertura mínima y tolerancias, de modo que devolver siempre valores nulos no permite aprobar.

Los fixtures de T prominente y de delineación se prueban a 250/500/1000 Hz. La prueba automatizada de espigas utiliza el flujo nativo de **500 Hz**: impulsos breves antes de P y próximos al QRS, diez QRS detectados, ocho límites interiores y QRS de 90 ms, sin modificar las muestras originales.

La revisión adicional reprodujo un **fallo a 250 Hz**: un impulso de 3 mV antes de P puede pasar como complejo, con frecuencia aparentemente correcta y QRS aceptable. El mismo estímulo se discrimina a 500/1000 Hz. Esta limitación queda abierta y no se retocaron umbrales después del control. La protección frente a impulsos tampoco reconstruye el inicio de QRS oculto; los límites cercanos se marcan para revisión.

## 4. Revisión visual y continuidad

La interfaz real de escritorio verifica las medidas y marcas actualizadas de WPW, los estados de revisión de la estimulación y el rechazo de intervalos del escape ventricular. El diálogo conserva por separado medidas, referencia de la misma población y candidatos. La ampliación sigue usando los mismos límites que el resumen y mantiene la señal original, con ejes en ms/mV.

La captura `browser-captures/v1.2-wpw.jpg` es del navegador real. Las capturas anteriores pertenecen a v1.1. `trazados/` contiene renderizados directos de Canvas y `mediciones.json` identifica v1.2. El smoke opcional de Playwright no se ejecutó en esta sesión. La revisión amplia de calibres, exportación PNG a 300 dpi, monitor y práctica se conserva como antecedente en [verificacion-v1.1.md](verificacion-v1.1.md), sin repetir esa cobertura aquí.

Quedan pendientes revisión clínica independiente del trazado, un banco de referencia más diverso, delimitación de baja pendiente y superposiciones, protección a otros muestreos y pruebas completas en móviles, accesibilidad asistida, audio y rendimiento físico. No se afirma 60 fps sostenido ni señal infinita en el monitor.
