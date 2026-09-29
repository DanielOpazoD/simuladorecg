# Refacción visual del espacio ECG

Base: `30c0a2d5e3484fadaf62547d59851e26dfdf7298` (PR51 integrado).

## Recorrido y límites

Biblioteca de patrones → buscar/filtrar → seleccionar ejemplo → examinar el
trazado → ajustar parámetros, comparar o abrir un archivo. La navegación entre
espacios queda separada de Calibres/Ondas/Ampliar/Congelar. Las acciones siguen
usando los propietarios y callbacks existentes; no hay router, store o bus nuevo.

Este bloque cambia presentación y búsqueda. No añade diagnósticos, modifica
presets, altera ondas, reinterpreta medidas ni amplía el dominio de análisis.
Los títulos clínicos completos del caso elegido y sus límites se conservan.
Las etiquetas breves del catálogo son sólo presentación; no se exportan como
un nuevo diagnóstico ni sustituyen el nombre canónico.

## Decisiones visuales

- Biblioteca con las diez familias originales, nombres de presentación y
  subgrupos en ritmos, conducción AV, ramas/fascículos y patrones ST–T.
- Búsqueda por nombre, sigla y sinónimos acotados; insensible a acentos/mayúsculas.
  Las siglas no coinciden con fragmentos ajenos (FA no equivale a fascículos).
  Todas las palabras se exigen conjuntamente y el filtro de familia se conserva.
- Recuento de disponibles/pendientes, estado vacío y una acción para limpiar
  ambos filtros. Se mantienen 61 ejemplos disponibles y cinco pendientes
  deshabilitados. Entradas futuras sin subgrupo no desaparecen.
- Títulos descriptivos: Biblioteca de patrones, Ajustar el caso, Examinar un
  latido, Comparar dos ECG y Explorar una señal. Se distingue explícitamente
  parámetro programado de medición del trazado.
- Jerarquía tipográfica y espacios consistentes, marcos discretos, color de
  acento existente, acciones principales/secundarias y modo oscuro.
- En móvil, nombres visibles en las acciones superiores; métricas en dos filas,
  controles ajustados al ancho, blancos táctiles de al menos 44px en las acciones
  comprobadas. Las ayudas de teclado quedan después del gráfico sin cambiar
  `aria-describedby` ni el acceso por teclado.
- Los requisitos extensos de CSV/WFDB se pueden desplegar; frecuencia/duración,
  doce canales y la necesidad de declarar unidades siguen visibles antes de
  abrir. No se ocultan errores, abstenciones, límites de ST o avisos de calidad.

El teclado, retorno de foco, catálogo móvil inerte, navegación de pestañas y
geometría del calibre manual se conservan. No se añade borde/relleno al canvas
manual. El nuevo acceso a parámetros está deshabilitado durante una pregunta.

## Comprobaciones

`tests/catalog-presentation.test.ts` contiene 34 pruebas: integridad de nombres/
patches/estrategias, recuentos, subgrupos, siglas, acentos, intersección de filtros,
estado vacío y futuras entradas sin clasificación.

`tests/browser-visual-workspace.mjs` es el recorrido de producción que se añade
al job de fidelidad existente. Debe ejecutarse junto con todos los recorridos
anteriores, no en sustitución de ellos. Comprueba navegación, foco, copia A fija,
restauración completa de B, etiquetas/diálogos, filtros, ancho y aislamiento de
práctica en 1440, 390 y 320px. La suite de tres motores del PR51 permanece; sólo
se actualizan dos nombres de diálogo para que coincidan con sus encabezados.

No cambian gates/tolerancias/snapshots del motor ni los protocolos externos.
La compilación, los recorridos de producción y los checks remotos sólo se dan por
aprobados cuando existe evidencia del mismo SHA. Pruebas en un arnés transpilado
local no sustituyen Vite/ESM, un origen HTTPS, WebKit/Firefox ni un iPhone físico.
