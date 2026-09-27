# WPW: la onda delta obedece al control de amplitud QRS

Base de desarrollo local: `e8bb934d9b5b78e15a99d447e2ed61b2279df16c` (PR35).
Base de publicación: `81906c51385ae6f16e9ec35d7ff15f269164cde6` (PR36).
Durante la CI se integró PR37 en main: `c1afb79e4f65feb2b7df3c703e4e39ce113c0c4f`.
Se reconcilian ambos cambios, conservando íntegramente la auditoría del PR36
y la atenuación posterior del PR37. No se reutilizan los checks de la base antigua.

## Corrección acotada

La contribución inicial WPW de 45 ms se añadía después de los kernels QRS con
amplitud fija. Cambiar qrsAmp modificaba el resto del complejo, pero no la delta.
Se multiplica su vector completo por qrsAmp en la misma llamada a `scale`.
Una expresión de producto; ningún coeficiente morfológico nuevo.

Ganancia 1 conserva exactamente la señal anterior. No se alteran duración,
calendario eléctrico, T/ST primarios, filtros, analizador, presets ni versión.
Casos WPW personalizados con qrsAmp distinto de 1 sí cambian; sus medidas
estimadas pueden cambiar o quedar no disponibles al recibir otras muestras.
Esto no crea un modelo de vía accesoria, fusión de activaciones o AVRT; tampoco
resuelve por sí solo combinaciones con bajo voltaje/sobrecarga ventricular.

## Contratos de verificación

Siete pruebas nuevas sobre muestras, no sobre las cifras del analizador:
proporcionalidad en cuatro filtros; componente WPW diferencial; conservación
fuera de QRS y soporte FIR; determinismo e inversión de electrodos.
La reproducción local previa encontró cinco fallos con el código anterior y
ninguno después, usando Node 22.16 y transformación TS nativa (no Vitest).

Se amplía el validador pareado existente, sin un workflow nuevo: conserva el
baseline histórico PR33, los 244 presets/filtros predeterminados y los 20 casos
posteriores, y añade 20 casos WPW. Además mantiene los 20 casos posteriores
de bajo voltaje del PR37 con su baseline PR35. La tolerancia sigue siendo 1e-10 mV.
También se conserva la exigencia histórica de un fallo posterior >1 mV y se
requiere un fallo WPW previo >0,5 mV. Esto verifica que el test discrimine.
Los errores de proporcionalidad son matemáticos, no errores clínicos.

El recorrido de navegador existente cubre posterior y WPW en 1440x1000 y390x844:
control real de amplitud 1 -> 0,1 -> 1, cambio visible y recuperación exacta del
canvas completo. Mantiene además exportación/importación posterior con y sin
bajo voltaje, con restauración exacta. Usa el evento input, no prueba gestos
táctiles ni iPhone físico.
Browser plugin no disponible: se utiliza Playwright/Chromium ya establecido en CI.

## Cierre y alcance

Antes de fusionar se requieren CI completa, instalación limpia, Vitest, build,
benchmarks históricos y revisión de artefactos/capturas sobre producción compilada.
Después de fusionar se verifican las ejecuciones de main y el árbol fuente.
Las ejecuciones y resultados finales se registran en la conversación del PR.
No consumir holdout, desplegar el sitio ni modificar dependencias/licencia/versión.

## Bajo voltaje WPW: extensión sobre PR38

Base: `d86b193f3deb56649d325d07379206299748ab49`.
La delta seguía `qrsAmp`, pero omitía el factor existente de bajo voltaje que sí
recibía el QRS principal. Se cambia esa expresión por `qrsAmplitudeScale(c)`;
no se añade otro factor ni se redefine 0,38 como criterio clínico universal.
No se modifica la función compartida ni el patrón de sobrecarga ventricular.

En señal aislada a FC60, ganancia1 y filtrooff, el pico de II en los primeros45ms
es0,353223mV sin bajo voltaje. Antes era0,250665mV con bajo voltaje; ahora es
0,134225mV (=0,38 del original). El máximo residuo de proporcionalidad en20casos
(cinco ganancias/cuatro filtros) pasa de0,658749mV a4,45e-13mV. Son comparaciones
matemáticas del modelo; no son errores contra ECG de pacientes.

Se añaden seis pruebas: cinco fallan antes y seis aprueban después. Comprueban
atenuación multiderivación/cuatro filtros, P/ST/T fuera del QRS más soporte
antialias y coexistencia WPW+patrón posterior. La réplica local con transformación
TS/node:test da25/25 pruebas focales (13WPW+12posterior),56/56 adversarias,
244defaults y48controles personalizados noWPW completos sin cambios.

Se conserva íntegramente el validador histórico, sus baselines y umbrales; se
agrega un baseline separado PR38 y20casos de atenuación WPW. La prueba Playwright
existente extiende exportación JSON→importación con bajo voltaje→cambio visible→
reimportación normal→restauración exacta del canvas también aWPW. Sin workflow,
control, dependencia, persistencia o documento de resultados en producción nuevos.
La suite completa/build/navegador y artefactos deben verificarse enCI y después
del merge. Browser plugin no disponible; se reutiliza Playwright/Chromium deCI.

Fuera de alcance: simulación anatómica de vías accesorias, ajuste clínico de
voltajes, sobrecarga ventricular combinada, holdout y despliegue. El código del
analizador no cambia; sus medidas en los casos personalizados corregidos pueden
variar o abstenerse al cambiar las muestras. Los presets predeterminados y los
casos sin la combinación WPW+bajo voltaje mantienen su salida anterior.
