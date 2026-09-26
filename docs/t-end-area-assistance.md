# Final T por área: ayuda de revisión, no sustitución del QT

## Alcance

Base integrada: `08571bc9d374c361baf2b2aec0bf66a56e1bcbdb` (PR29).
El analizador automático y sus nueve dependencias permanecen byte por byte iguales.
El PR27 no se incorpora. No se cambian generador, filtros, presets, paquetes,
protocolos históricos, QT/QTc, estados de calidad ni decisiones de auditoría.

La ampliación del latido añade un marcador **T fin propuesto**, sólo cuando existe
una propuesta multiderivación estable. No crea una banda QT, no cambia el final
publicado por el analizador y no promueve una medida a `usable`. El texto explica
que la marca no es un límite validado de la derivación seleccionada. Cambiar de
latido o de caso recalcula o retira la propuesta; no existe persistencia adicional.

## Intervención y fundamento

La condición histórica de retorno de amplitud puede fallar ante una línea basal
mal estimada. Se estudió primero una recuperación por meseta con basales PR: tuvo
escasa cobertura y errores grandes al reducir el número de derivaciones exigidas;
se descartó. El código entregado utiliza exclusivamente un indicador de área:

`A[k] = media(x[k-w+1..k]) - media(x[k-p..k+p])`

Se busca el máximo absoluto terminal con ventanas de 96 y 128 ms. Se requieren
ubicaciones concordantes entre ambas ventanas y al menos tres derivaciones de
I/II/V1/V5. La ventana no incluye el QRS anterior, deja una guarda antes del siguiente
QRS y rechaza máximos en los bordes. No hay referencia humana ni diagnóstico en
estos cálculos. Los umbrales concretos son decisiones de ingeniería, no criterios
clínicos publicados. Dos escalas y cuatro derivaciones NO son pruebas independientes.

La resta elimina offsets constantes. Tras el valor absoluto no se garantiza
invariancia a toda deriva lineal ni a movimientos de electrodo. Una regla de empate
numérico toma el último máximo dentro de 1e-9 mV: evita que el redondeo elija sitios
arbitrarios en mesetas analíticas; no es una tolerancia de error clínico.

Fuentes primarias consultadas:
- Zhang Q et al. An algorithm for robust and efficient location of T-wave ends in
  electrocardiograms. IEEE TBME. 2006;53:2544-2552. DOI:10.1109/TBME.2006.884644.
  https://pubmed.ncbi.nlm.nih.gov/17153212/
- Moeyersons J et al. Automated T Wave End Detection Methods: Comparison of Four
  Different Methods for T Wave End Detection. BIOSIGNALS 2017. DOI:10.5220/0006171700920098.
  https://www.scitepress.org/PublishedPapers/2017/61717/
- Kalyakulina A et al. LUDB 1.0.1. DOI:10.13026/eegm-h675.
  https://physionet.org/content/ludb/1.0.1/

Estas publicaciones justifican investigar el indicador, no certifican esta
implementación ni sus resultados. El artículo de 2017 distingue varios métodos;
no se presenta el método del área como universalmente superior para toda morfología.

## Evaluación y límites

Se reutilizan por separado los 40 originales PR17 y los 40 de calibración PR26,
ambos observados. **No se descarga ni evalúa el holdout.** El evaluador PR28, sus
referencias y todas las detecciones T permanecen idénticos: sólo se evalúa otra
columna de final T. Las cifras del analizador nunca se sustituyen en la aplicación.

Resultados locales nativos (deben reproducirse con esbuild y WFDB en CI):

| Cohorte | Límites comparables / elegibles | MAE | p95 | Máximo |
|---|---:|---:|---:|---:|
| Original40 | 124/311 | 9.68 ms | 30 ms | 74 ms |
| Calibración40 | 153/340 | 9.65 ms | 36 ms | 120 ms |

Sobre la MISMA población con ambas estimaciones: 28 límites originales pasan de
MAE102.71 a9.86ms, y68 de calibración de65.38 a6.41ms. Son comparaciones descriptivas
sobre datos de desarrollo ya expuestos, no una demostración de generalización.
Se añaden96/85 propuestas donde faltaba el final automático; se abstiene en39/49
casos donde ese analizador sí tenía un final. Por ello no se afirma una sustitución
completa ni se compara ciegamente el MAE total de poblaciones diferentes.

Hay127/156 propuestas totales: tres por cohorte no tienen un límite emparejable.
Las omisiones, referencias incompletas, predicciones fuera de ventana y errores
individuales permanecen en los JSON. Una propuesta estable puede errar120ms.
Las pruebas analíticas T bifásica/U deliberadamente ambiguas exigen abstención;
esto no garantiza que todas las T bifásicas o U sean reconocidas como ambiguas.

`docs/t-end-area-protocol.json` fija los límites de humo de ingeniería seleccionados
sobre desarrollo. No son umbrales de seguridad clínica ni preregistro anterior a
la exploración local. El siguiente paso hacia QT automático necesita otra revisión,
política de aceptación y evaluación independiente; no queda autorizado por este PR.

## Verificación

La validación exige: pruebas analíticas 250/500/1000Hz, offset y polaridad,
no mutación, ausencia/ruido, cobertura mínima multiderivación y límites de ventana;
comparación externa con adquisición/cotejo WFDB; suite histórica completa,
TypeScript/build, benchmarks existentes y navegación de producción escritorio/móvil.
Browser plugin no disponible: se utiliza el Playwright ya establecido por el repositorio
en CI. No cambia ninguna dependencia del producto. Una CI aprobada no equivale a
prueba física en iPhone, impresión real o validación clínica.
