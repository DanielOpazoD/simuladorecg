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
