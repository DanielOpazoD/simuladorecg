# Contrato previo: muestras → píxeles → PNG

Protocolo fijado antes de ejecutar el candidato, sobre la base `fbad93d`.
No modifica el generador, el analizador ni la geometría de producción.

## Flujo y juez

Una señal analítica de 10 s a 500 Hz, con escalones de +1 y −0,5 mV y
una deflexión de una sola muestra, entra en `renderPaper`. El mismo objeto entra
en `handleExportAction("png")`; se recupera el archivo descargado y se decodifica
con el navegador. El juez examina píxeles RGBA, no comandos Canvas, `Layout`,
`paperLayout`, `calibrationGeometry`, `traceSampleIndices` ni funciones de ganancia.
Las muestras se verifican antes y después, byte a byte.

Se usa papel 12×1 simultáneo para separar todas las derivaciones sin depender de
las coordenadas internas. Las líneas largas de señal revelan las bases y la
cuadrícula revela la escala de píxeles/mm. Se contrasta la anchura de un pulso de
200 ms, la separación de pulsos, su altura y signo, la calibración de 1 mV/200 ms
y la conservación del extremo de una muestra. Cabrera exige aVR invertido en su
tercera fila y las otras filas con el signo original.

## Matriz y criterios fijados

- Chromium instalado, sin nuevas dependencias; viewport 1440×960 y 390×844,
  DPR 1 y 2; orden estándar y Cabrera; velocidad 25 y 50 mm/s y ganancia 5 y
  10 mm/mV. La matriz acotada declara sus combinaciones exactas en el script.
- Pantalla: ajuste al ancho existente. Exportación: ruta PNG real a 300 dpi.
- Error absoluto máximo de **2 píxeles de la imagen examinada** en alturas,
  anchuras y distancias, incluyendo antialiasing, redondeo y discretización de
  los escalones. Los tiempos se eligen sobre muestras exactas. La localización
  del extremo de una sola muestra admite **2 píxeles** por redondeo del trazo.
- La separación de cuadrícula recuperada en X/Y debe concordar en ≤1 píxel por
  cuadro grande. La exportación debe contener un único pHYs de 11811 píxeles/m
  en ambos ejes, unidad metro; su escala recuperada debe concordar en ≤1 píxel
  por cuadro grande con 300/25,4 píxeles/mm.
- Controles negativos: alterar solo los píxeles de amplitud, tiempo o polaridad
  debe hacer fallar el juez, sin modificar el original ni sus muestras.
- Cualquier fallo del candidato se conserva en el informe externo. No se
  amplían tolerancias después de observarlo. Un error de la herramienta se
  distingue de un defecto de producto y se documenta como tal.

## Acceso y límites

Browser plugin not available: se usa Playwright instalado. La guía
`export-html-media-from-canvas` fue consultada: su API HTML-in-canvas experimental
no se necesita; se conserva Canvas2D, su backing store y `toBlob` de producción.
Las imágenes y resultados se escriben fuera del repositorio en una carpeta nueva.
La segmentación se verifica con la paleta de papel predeterminada, no con otras
paletas. No certifica tamaño físico del monitor, impresión, Safari/Firefox, el zoom ST,
todos los formatos de papel ni comprensión clínica por lectores. La señal
analítica es un instrumento metrológico; no representa un paciente ni valida
plausibilidad electrofisiológica.

## Instrumento implementado y lectura de resultados

```sh
node scripts/check-pixel-metrology.mjs /ruta/fuera/del/checkout/ronda-nueva
```

La matriz tiene ocho configuraciones: ambos viewports × ambos DPR × dos ajustes
de papel (estándar a 25 mm/s y 10 mm/mV; Cabrera a 50 mm/s y 5 mm/mV). No es el
producto cartesiano de todas las velocidades, ganancias y órdenes. Cada una
produce una captura real del elemento Canvas y un PNG descargado por la acción
de exportación existente: 16 imágenes, 192 filas y 1.344 comparaciones geométricas.
La captura de Playwright encierra la caja CSS fraccional; se verifica su tamaño
contra esa caja, con un máximo de un píxel CSS de redondeo multiplicado por DPR.
El límite de error de las medidas sigue siendo dos píxeles de la imagen.

El instrumento separa la tinta de la cuadrícula rosa por contraste óptico
`(255−R) − 0,46·(253−G)`. Dentro de cada banda se conserva únicamente la tinta
conectada, con vecindad de ocho píxeles, a la línea basal recuperada. Los pies de
calibración y el trazado continuo son conexiones independientes a esa basal;
los glifos de texto aislados no pertenecen a ellas. No se eliminan componentes
por su tamaño, posición de etiqueta conocida ni número de deflexiones esperado.
Una anotación que toque realmente el trazado no se puede separar con este método
y conserva su efecto en el resultado. La escala se obtiene de la intensidad integrada de las
líneas gruesas. La anchura de un pulso se mide entre los centros de sus bordes
verticales, no entre los extremos exteriores de la pluma. Para el extremo de
una muestra, el radio de la pluma se estima de la calibración rasterizada y se
descuenta del borde visible. No se importa ni se reproduce la anchura de pluma
del renderer. Son decisiones de medición de la imagen, no correcciones del ECG.

El informe incluye todos los residuos por fila, errores de consola, SHA-256 de
bundle/script/protocolo/imágenes, densidad PNG y resultados de tres corrupciones
de imagen. El decisor rechaza valores no finitos, filas ausentes y métricas
incompletas; cuatro controles adicionales verifican ese rechazo. Código de
salida cero exige la matriz completa, sin errores y con los controles negativos
rechazados. Dos controles de aislamiento adicionales añaden un glifo gris
desconectado (las medidas deben permanecer exactamente iguales) y una deflexión
extra conectada a la basal (el juez debe rechazarla, no descartarla como texto).
Si falta Chromium, se cierra el servidor y se conserva el fallo.

## Resultados adversos conservados durante la construcción

Las rondas locales iniciales se conservaron fuera del checkout, en
`ECG-QA/pixel-metrology-round1` a `pixel-metrology-round10`. No mostraron un
defecto probado del producto: revelaron limitaciones del instrumento.

- El detector binario por color/oscuro perdía líneas subpíxel al cruzar la
  cuadrícula, especialmente en móvil; se sustituyó por separación óptica.
- Medir el ancho exterior de la tinta daba excesos de 2,95–3,95 píxeles en PNG;
  se recuperaron los centros de los bordes verticales.
- El extremo exterior de la pluma daba 2,098 píxeles de exceso en una fila del
  impulso; se descontó su radio observado en la calibración de esa imagen.
- Una comprobación inicial de la caja de captura permitía solo un píxel físico,
  aunque Playwright redondea primero en CSS. Se corrigió la comprobación de la
  caja; no se amplió el criterio geométrico de dos píxeles.

La ronda 11 completó las ocho configuraciones sin cambios de producto: máximo
absoluto observado de 1,337 píxeles en pantalla y 1,000 en PNG (redondeados hacia
arriba). Es una comprobación técnica de esta matriz expuesta durante el desarrollo
del instrumento; no constituye una reserva clínica, un ensayo ciego ni una
certificación general de toda imagen que produzca el simulador.

### Fallo Linux conservado y reproducción sobre sus píxeles

La primera ejecución Linux del PR 213 falló en la fila de aVR: un píxel de un
glifo, rasterizado por las fuentes de ese sistema, entró en la banda de medida
y produjo una quinta componente en X=44. El contraste óptico separaba tinta de
cuadrícula, pero no texto de señal. El [run 40386375139](https://github.com/DanielOpazoD/simuladorecg/actions/runs/40386375139)
y su artefacto `12681786389` conservan el fallo. La captura original tiene SHA-256
`54704749f402b47610a073bb6b695a57c851383f8095ce07ab14ff8503d8dcc6`.

Reevaluar esos mismos bytes con el juez anterior reproduce exactamente el fallo;
con la separación por conectividad se recuperan las doce filas y el error máximo
es 1,316 píxeles, redondeado hacia arriba. La captura no fue regenerada en Windows
para esa comprobación. La corrección afecta únicamente al instrumento, conserva
el criterio de dos píxeles y no cambia fuentes, muestras, renderer ni exportador.
La reproducción de un artefacto aislado no sustituye una nueva ejecución de toda
la matriz en Linux; el estado de esa ejecución se comunica por separado en CI.

## Ampliación previa: continuidad entre derivaciones (26-10-2026)

Sobre `0befbda`, antes de medir el candidato, se fijó una separación nominal de
1 mm entre columnas. La petición posterior «ambas cosas» exige además más
latidos: la interfaz empieza en 6×2, con 5 s por derivación; conserva el formato
compacto 3×4+1 y los formatos de casos importados. No se unen señales de distintas
derivaciones, se suavizan muestras ni se cambian las ventanas de cada formato.

El instrumento adicional recibe una señal constante de +0,5 mV. Recupera la
escala de la cuadrícula y los tramos largos de tinta desde capturas y descargas
PNG reales, sin importar geometría de producción. Exige seis filas de dos
tramos separados en 6×2; en 3×4+1, tres filas de cuatro tramos y una tira continua.
El hueco óptico admisible es **0,3–1,5 mm**, incluyendo pluma y discretización.
Se fija antes de ejecutar el candidato y no sustituye la tolerancia de 2 píxeles
del instrumento de calibración. La matriz adicional cubre ambos formatos en
1440 px/DPR 1 y 390 px/DPR 2, a 25 mm/s y 10 mm/mV, paleta de papel estándar.

Dos corrupciones de píxeles por formato deben rechazarse: unir dos derivaciones
con tinta y borrar un hueco de 5 mm. Se conservan sus métricas, todas las capturas
y PNG, también ante fallo; las muestras originales deben permanecer idénticas.
No prueba todos los formatos, estilos, valores de ganancia o velocidades, ni
percepción de continuidad o comprensión en un estudio con alumnos. Los criterios
de interfaz y la respuesta del usuario se conservan en la evidencia local de
esta ronda. Estas comprobaciones no elevan la plausibilidad clínica del modelo.
