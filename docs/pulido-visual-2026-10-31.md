# Pulido visual y continuidad de lectura

El catálogo, la cabecera, las herramientas y las ventanas de Lupa, Medidas y Comparar comparten tipografía, colores y estados. La selección del catálogo ajusta su fondo al nombre con márgenes equilibrados, conservando toda la celda pulsable. Las variantes usan un subrayado y las herramientas activas un fondo compacto. Los controles conservan nombres accesibles y foco de teclado independiente.

La vista inicial de escritorio usa el formato existente 3×4 con tira continua de II y ajusta uniformemente la hoja al espacio disponible. El zoom sigue siendo deliberado; importaciones, cambios de caso y redimensionados no imponen otro formato. La cuadrícula fina clara es más discreta, sin modificar las divisiones principales. La exportación conserva su escala física.

Los valores PR, QRS y QT quedan junto a sus intervalos, con bandas alineadas por fila. Se elige un latido con intervalos aceptados completos dentro de la columna; no se inventan extremos ni se modifican las medidas del analizador. En escalas muy pequeñas se conserva el formato de etiqueta que evita invadir las ondas.

Las acciones de lectura conservan la medición manual y la posición; muestras o geometría nuevas invalidan las coordenadas anteriores. El detalle y los resultados iniciales adversos están en [Continuidad de lectura](continuidad-lectura-2026-10-31.md).

## Verificaciones

Antes de publicar la PR, se completaron TypeScript, build y los siguientes recorridos en Chromium local:

- 48 escenarios de navegación compacta, incluidos móvil, tema oscuro y texto ampliado.
- 9 recorridos elegir → leer → medir → comparar → volver, con muestras, posición y PNG conservados durante la lectura.
- 42 comprobaciones de formatos y ajuste de escritorio, con calibración raster y controles negativos.
- 12 contrastes independientes de imagen: sinusal, BRI y anterior, con alteraciones deliberadas de tiempo, voltaje y polaridad.
- 20 combinaciones de patrón/pantalla que verifican tamaño y posición del papel, medidas visibles, etiquetas sin superposición y ausencia de tinta bajo los valores.
- 6 verificaciones de márgenes, centrado, nombres largos y foco de teclado del selector en claro y oscuro.

Los dos primeros recorridos existentes permanecen en CI; se añaden también `browser-reading-continuity.mjs` y `browser-desktop-overview.mjs`. Los artefactos de CI conservan los resultados aunque haya fallos.

## Resultados adversos y límites

La primera ejecución de CI falló porque la prueba de comparación todavía exigía el rótulo visible de Información y fuentes. Se actualizó para comprobar el nombre accesible del icono, apertura y devolución del foco. El oráculo de calibración de comparación consulta ahora el formato elegido en vez de asumir siempre dos columnas.

Al repetir el recorrido se detectó un fallo real: iniciar práctica con el mismo caso ya visible evitaba reiniciar las ayudas por la optimización de reselección. La optimización se limita ahora a lectura fuera de práctica. La prueba fuerza una pregunta anterior sobre el caso anterior existente y exige ocultar comparación e intervalos y retirar la medición manual. El resultado adverso local se conserva en `../ECG-QA/pr-visual-20261031/comparison-icon/`; la ejecución fallida de CI también mantiene sus artefactos.

La comparación de imagen inicial exigía cero cambios en una máscara binaria de tinta al aclarar el fondo. Detectó 21 píxeles entre 460.638: el suavizado de bordes cruzó el umbral con diferencias de uno a tres niveles RGB. El resultado original se conserva. La comprobación complementaria limita esas diferencias a tres niveles por canal y menos del 0,01 % de los píxeles; las pruebas independientes contra muestras mantuvieron sus criterios. La imagen oscura quedó idéntica.

Otra expectativa histórica exigía que 3×4+1 siempre tuviera mayor escala que 6×2 a 1024 px. Con la cabecera compacta ambos formatos casi llenan el ancho; sus anchuras físicas difieren (275 y 273 mm). Se reprodujo el resultado con los estilos anteriores. El test usa ahora el límite físico 273/275 con tolerancia de redondeo de 0,001; conserva la ganancia mínima del 10 % en pantallas mayores y las comprobaciones de calibración y controles negativos.

La evidencia detallada está en `../ECG-QA/visual-refinement-20261031/`, incluidos ambos resultados adversos y las capturas finales. Claude Fable 5.1 produjo seis cambios de código concretos para la última iteración; se revisaron antes de aplicarlos y se verificaron localmente. Su participación no equivale a revisión clínica independiente.

Las pruebas locales no afirman compatibilidad verificada con Safari ni con dispositivos físicos. Persiste la advertencia conocida de Vite sobre paquetes mayores de 500 kB. No cambian el generador, el analizador ni las afirmaciones de plausibilidad clínica.
