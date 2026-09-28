# Revisión manual fiable de señales externas — A05 + A10 + procedencia A17

Base: `efaa81936fc4662afa571ab1f8a2ce87e643e05b` (A01/A03 integrados).
Este bloque no cambia generador, presets, delineadores, filtros ni protocolos externos.
No implementa A11 (comparación externa A/B), ni la parte de hosting/CSP de A17.

## Flujo y límites

Abrir señal → control técnico → elegir derivación/tramo → colocar límites PR/QRS/QT
→ guardar lectura manual → exportar/reimportar anotaciones sobre la misma señal.

Una anotación es una lectura manual por derivación. No reemplaza `Measurement`, no
modifica ninguna muestra y no se presenta como consenso clínico. La lista puede
editarse, eliminarse, deshacerse/rehacerse (20 pasos), y contiene como máximo 100
lecturas. Los índices son enteros, absolutos y empiezan en cero; final debe ser mayor
que inicio y menor que el número de muestras. Intervalo = (final−inicio)×1000/fs ms.
No hay umbral patológico ni QTc manual. Una muestra mide resolución, no precisión.

Los candidatos automáticos sólo ayudan a centrar la vista: no se copian límites ni
se asigna un latido validado. El borrador inicial es geométrico y requiere al menos
un ajuste antes de guardarse. Puntero/arrastre, flechas y campos numéricos comparten
la misma rejilla de muestras. Cancelar descarta el borrador, no la lista guardada.
El editor manual tiene escala temporal ampliada y mV explícitos; las muestras no
se normalizan. Fuera del rango se recorta sólo la vista, no los datos.

Cambiar la ventana automática retira cifras y candidatos inmediatamente, pero no
mueve ni elimina anotaciones absolutas. Nueva selección de archivo o cierre borra
la sesión y sus anotaciones: exportarlas antes. No hay guardado en localStorage,
IndexedDB, cuentas ni envío a un servidor. Un sidecar válido reemplaza la lista
completa, operación reversible. Un archivo inválido o de otra señal no modifica
la lista; una importación tardía tras cerrar no revive la sesión.

## A05: archivo legible no equivale a medición evaluada

El lector conserva su dominio de 100–1000 Hz y 10–60 s. La política
`external-500hz-10s-v1` permite análisis exploratorio únicamente en ventanas de 10 s
a 500 Hz, con I, II, V1 y V5 explícitas. Ésta es una frontera operativa prudente del
proyecto, no una norma clínica: coincide con el dominio de los fixtures LUDB de
regresión/delineación examinados; 500 Hz NO certifica precisión en pacientes.
Los demás Hz siguen siendo visibles, exportables y medibles manualmente, sin
remuestreo oculto. No se ejecuta el analizador para una entrada excluida.

Comprobaciones técnicas, fijadas antes de CI y no ajustadas para mejorar métricas:
- dimensiones/canales/números finitos, con los límites del lector ya existente;
- canal constante en toda la ventana;
- meseta EXACTA ≥100 ms en el mínimo o máximo observado (posible recorte; no
  confirma saturación del ADC a partir de datos físicos);
- dos canales de detección idénticos muestra por muestra.

Una de estas condiciones en I/II/V1/V5 impide el análisis, sin fabricar sustitutos.
Una incidencia en otro canal se mantiene como aviso sin ocultar ese canal. No se
infiere asistolia de un canal plano. Superar el control no descarta ruido, patología,
T/U, aliasing o mala calibración: se conservan los estados y motivos del analizador.
No se alteran ni calibran sus probabilidades. La respuesta worker/UI incluye id y
ventana; la UI recomprueba aptitud, esquema y huella antes de aceptar resultados.

## A17: identidad y procedencia, no autenticación o anonimización

SHA-256 mediante Web Crypto. Requiere contexto seguro; si no existe no inventa una
huella alternativa. El cálculo se repite en el límite UI para cotejar la respuesta.

`ecg-physical-f64le-v1` define estos bytes sin depender del nombre del archivo:
1. UTF-8: `ecg-physical-f64le-v1\n{fs}\n{samples}\nmV\nI,II,III,aVR,aVL,aVF,V1,V2,V3,V4,V5,V6\n`.
2. Todas las muestras físicas en mV, Float64 little-endian, primero todas las de I,
   después II, etc. Cero negativo se canoniza a cero positivo; otros valores se
   conservan; NaN/Infinity no se admiten.

La huella abarca TODO el registro; cambiar una muestra, Hz, longitud u orden físico
de canales la modifica. Reordenar columnas con etiquetas correctas o convertir
WFDB a CSV sin cambiar muestras físicas conserva la identidad. Diferencias reales
de redondeo en una conversión ajena producirán otra huella y rechazo prudente.

El sidecar `ecg-manual-review`, schemaVersion 1, contiene identidad, anotaciones y
build. No contiene muestras ni datos de paciente. `createdWith` identifica el build
que fijó los límites guardados; una edición los vuelve a registrar en el build
actual. La importación conserva esa procedencia; `exportedWith` identifica quien
serializó el archivo. No acredita identidad del operador ni firma profesional.
Campos desconocidos, tipos incorrectos, IDs duplicados y archivos >128 KiB se
rechazan. Nunca se reimporta un sidecar como un caso sintético.

El informe externo pasa explícitamente a schemaVersion 2: añade build, identidad,
aptitud, `analysisAttempted` y lista manual separada. La medición queda null cuando
no se ejecutó. Sus tiempos siguen relativos a la ventana declarada; las lecturas
manuales usan índices absolutos. El CSV conserva el formato físico previo.

Vite inserta la misma identidad que escribe en build-info.json. Incluye commit,
sourceSha256 y analysisSourceSha256. Este último es conservador: SHA-256 de TODAS
las fuentes `src/engine/`, ordenadas por ruta, `ruta + NUL + bytes + NUL`. El hash del
build completo cubre además la política externa, el worker y la interfaz. Un build
sin Git se declara unknown/dirty, no una versión publicada ficticia.

No se añaden datos de paciente, nombres originales o comentarios a exportaciones.
Las muestras y sus huellas pueden seguir siendo datos sensibles y permitir
vinculación entre archivos. No se promete anonimato, ausencia universal de egress,
resistencia a un origen comprometido ni borrado forense de memoria.

## Aceptación y evidencia

61 pruebas focales: cinco Hz, plano/meseta/canales idénticos, gate que no invoca al
analizador excluido, SHA-256 independiente, corruptelas de sidecar, undo/redo,
rejilla exacta y respuestas no válidas. Cuatro fixtures LUDB de desarrollo YA
EXPUESTOS comprueban que el resultado sample-only no cambia para entradas admitidas.
No se consumió un nuevo holdout ni se midió aquí rendimiento poblacional.

Recorrido Playwright nuevo sobre el MISMO build, 1440×1000 y 390×844: importar,
colocar/guardar con campos/teclado/puntero, comparar datos automáticos y originales,
editar/cancelar/deshacer/rehacer, exportar, rechazar anotaciones ajenas, recuperar
sobre CSV equivalente, revisión manual a 250 Hz, canal plano, cambio de ventana,
respuesta con huella manipulada y recuperación, aislamiento del simulador y red.
Se mantiene el resto de pruebas históricas. Capturas y reportes deben inspeccionarse
antes de integrar. Un build correcto no sustituye validación visual ni clínica.

Local: pruebas TypeScript transformadas a Node nativo; caché npm incompleta y DNS
no disponible. Suite Vitest completa/build/browser se ejecutarán en CI, no se
presuponen a partir del ensayo focal. Browser plugin ausente: Playwright en CI.
No se modificaron políticas/red del hosting, no hubo despliegue ni revisión clínica
humana. Safari/iPhone físico, Firefox y auditoría WCAG integral quedan fuera.

## Fuentes y contratos

- LUDB 1.0.1: https://physionet.org/content/ludb/1.0.1/data/ (10 s, doce derivaciones, 500 Hz).
- Protocolo del proyecto: `tests/reference/ludb/README.md`; suites `benchmarks/` congeladas.
- Web Crypto: https://www.w3.org/TR/webcrypto/ (digest SHA-256, no firma).
- Alternativa por teclado: https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html.
Estas fuentes no validan los umbrales de este control técnico ni las lecturas manuales.
