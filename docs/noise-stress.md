# Ruido calibrado, preservación ST/T/QRS y abstención

Primer PR nuevo recomendado tras la guía de bases de datos; NO es el antiguo
PR1 de fuentes ventriculares. Es un laboratorio de evaluación offline. No cambia
`src/`, los 61 presets, `measure()`, la interfaz, versión, dependencias del producto
ni la auditoría posterior. No entrena un score ni convierte el ECG Lab en un
instrumento diagnóstico. Los resultados difíciles permanecen en el informe.

## Extensión de aceptación posterior a PR20

La [protección de no regresión](noise-regression-contract.md) ejecuta ahora la
entrada actual del worker contra `aee59f6`, conservando este protocolo histórico.
Distingue `review` de abstención y falla por deterioro de muestras o cobertura.
Este documento describe el ensayo original; sus resultados no son un holdout.

## Protocolo cerrado antes de ejecutar

`benchmarks/noise-stress/protocol.json`: cinco casos existentes (sinusal,
inferior, BRI, hiperpotasemia, EV), tres registros NSTDB (bw/ma/em), tres ventanas
fijas por registro (60, 180, 300 s), cinco SNR (24,12,6,0,−6 dB) y cuatro filtros.
Son **900 escenarios contaminados + 20 controles limpios**, NO 920 pacientes.
Se comparan además 20 señales limpias de la cadena nativa. No se seleccionan
ventanas por calidad, no se omiten errores ni se recalibra tras ver resultados.

## Fuente y calibración: no inventar unidades

NSTDB 1.0.0 tiene ruido de deriva basal, muscular y movimiento de electrodos.
Los registros bw/ma/em son WFDB212, dos canales a 360 Hz. Su ganancia explícita
es **0 (desconocida)**: el benchmark NO adopta una ganancia mV por defecto.
El lector independiente de 12 bits coteja valores digitales, checksums y primera
muestra; `wfdb.rdrecord(physical=False)` debe coincidir exactamente. Todos los
archivos se validan frente a SHA256SUMS de la versión. Se conserva procedencia,
aviso de licencia y transporte; no se publican encabezados clínicos/pacientes.

Las ventanas se remuestrean 360→500 Hz con `resample_poly(25,18)`, FIR Kaiser β=5,
con 2 s de guarda real en cada extremo y recorte posterior. No se elimina ruido
mediante un filtro oculto: ese antialias y su configuración quedan registrados.
Datos ausentes en una ventana preseleccionada detienen el proceso, no se imputan.

Las ocho señales independientes reciben mezclas lineales FIJAS de dos canales.
Las cuatro derivaciones de extremidades restantes se reconstruyen desde I/II.
Esto protege Einthoven/Goldberger, pero NO equivale a 12 ruidos de electrodos
registrados independientemente ni a un modelo físico completo de adquisición.
Un mismo factor alfa convierte el ruido de cuentas a mV: RMS centrado agregado
sobre I/II/V1–V6 en [4,14) s. Se verifica el SNR alcanzado (error <1e−6 dB) y se
informa también por derivación. Ganancia cero y potencia nula no se adivinan.
Este SNR es de ingeniería: **no es el SNR ponderado por QRS de la utilidad nst**.

## Dos evaluaciones de filtro distintas

1. **Cadena nativa limpia:** `synthesize()` con off/diagnostic/monitor/aggressive,
   su filtro a 1000 Hz, antialias y salida a 500 Hz. Mismos eventos y parámetros.
2. **Estrés externo posterior a adquisición:** muestras limpias a 500 Hz + ruido
   calibrado; se aplican los kernels `highpass/biquad` existentes a 500 Hz sobre
   14 s y se descartan los primeros 4 s. Corte alto 0,05/0,5/2 Hz; bajo 40 Hz en
   monitor/aggressive. Sin notch. **No se afirma equivalencia exacta** con la
   cadena nativa previa al diezmado ni respuesta estacionaria tras solo 4 s.

No se alinean/desplazan curvas, no se reescala voltaje después ni se ajustan
filtros para aprobar. Se informa RMSE Y deformación: bajar ruido global no
compensa destruir ST o T.

## Oráculos separados y mediciones

**Morfología:** muestras limpias originales, con ventanas fijadas por los eventos
sintéticos. Basal QRS−35 a −20 ms; QRS programado; soporte nativo de T. Primer
ciclo completo entre 5 y 12 s por cada tipo de latido presente (normal/EV).
Se evalúan las 12 derivaciones: J, J+60, QRS pico-pico, T pico y área absoluta.
Esto comprueba preservación respecto de la fuente sintética, NO anatomía real.

**Analizador:** bundle separado de `measure.ts`, entrada `{fs,leads}` exclusivamente,
sin calendario, truth ni `auditMeasurement`. Se comparan detecciones en [0,2;9,8)
s con el centro del QRS programado. Emparejamiento uno a uno a 150 ms sirve para
identidad del evento, NO para aceptar 150 ms de error de delimitación. Se informa
TP/FP/FN, fuera de ventana y errores de inicio/final/duración/QT de matches
con delineación. Se conserva la ausencia de medidas; no se rellena con el modelo.

El estado usable/review/unavailable es global y describe la evidencia del
analizador, no confianza clínica por latido. El informe expone errores por encima
del margen incluso si el estado es usable. No se obliga a que todo ruido provoque
abstención: puede haber una señal aún medible. Tampoco se afirma que el analizador
sea seguro porque los controles de ingeniería aprueben.

## Márgenes de revisión (NO umbrales diagnósticos)

| Variable | Bandera de revisión | Razón de ingeniería |
|---|---|---|
| J/J+60 | error >0,02 mV | detectar cambios de 0,2 mm a 10 mm/mV |
| QRS/T pico | >máx(0,02 mV;10% del valor limpio) | proteger escala sin amplificar cocientes de voltajes mínimos |
| Área T absoluta | >máx(0,005 mV·s;10%) | cambio integrado que un único pico puede ocultar |
| QRS/QT estimados | >20/30 ms | identificar sesgos superiores a 10/15 muestras a 500 Hz |
| FC | >5 lpm | bandera descriptiva frente a frecuencia media del intervalo |

Se fijan antes de adquirir ruido; no son recomendaciones clínicas ni tolerancias
normativas. CI valida integridad, calibración, independencia y métricas; no fuerza
una tasa clínica de éxito. Una ejecución completa puede documentar deformación
o medidas erróneas persistentes y seguir siendo una evaluación correctamente
realizada. Esos resultados deben guiar un PR posterior, no ocultarse.

## Pruebas discriminativas

Ruido cero conserva las 12 señales; calibración por SNR; determinismo; identidades
con ambos signos de corrupción; matrices/cortes inválidos; entrada no mutada;
T borrada, J desplazado y QRS atenuado deben activar banderas. Una medida ausente
no tiene error cero, y usable puede superar el límite. La señal plana se retira.
La cadena nativa diagnóstica conserva J/J60 inferior dentro de 0,02 mV en
I/II/III/aVL/aVF. El lector WFDB212 verifica muestras con signo, checksum, longitud
y ganancia desconocida sin inventar mV.

## Ejecución

```bash
npm ci
python -m pip install wfdb==4.3.1
python -m unittest discover -s tests -p test_noise_stress.py -v
npx vitest run tests/noise-stress.test.ts
python scripts/prepare-noise-stress.py --output .sites-runtime/noise-stress
node scripts/benchmark-noise-stress.mjs .sites-runtime/noise-stress
```

El workflow dedicado ejecuta antes/después de merge, conserva fuente exacta,
protocolo, ruido remuestreado, resultados, hashes, paquetes y avisos. No se integra
ningún ruido real al bundle web. La CI general mantiene los recorridos de UI.

## Fuentes

- Moody GB, Muldrow WE, Mark RG. A noise stress test for arrhythmia detectors.
  Computers in Cardiology 1984;11:381–384. NSTDB 1.0.0, doi:10.13026/C2HS3T:
  https://physionet.org/content/nstdb/1.0.0/ .
- Licencia ODC Attribution v1.0 (incluida mediante su URI en los derivados):
  https://physionet.org/content/nstdb/view-license/1.0.0/ .
- Formato WFDB212: https://physionet.org/physiotools/wag/signal-5.htm .
- Convención diferente de SNR en nst: https://physionet.org/physiotools/wag/nst-1.htm .
- Remuestreo: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.resample_poly.html .

La guía aportada propone Noise Stress para filtros/robustez. Este contrato añade
una corrección metodológica: `measure(clean)` NO es la verdad del ECG contaminado.
El código del simulador conserva su estado de licencia previo.
