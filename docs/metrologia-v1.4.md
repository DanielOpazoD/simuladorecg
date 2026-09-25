# Metrología visual del candidato v1.4

La ampliación toma un dominio vertical común a todas las derivaciones y latidos de la señal inmutable. Se centra en cero, incluye el máximo absoluto con margen y se cachea por identidad de señal. Seleccionar otro latido o derivación no recalcula el dominio. Generar un caso nuevo sí puede cambiarlo, y se rotula el rango en mV; no se confunde este zoom con milímetros físicos de pantalla. La altura SVG aumenta de 250 a 300 unidades para conservar legibilidad.

La interfaz dice «paso de muestreo 2 ms», no exactitud de medida. El detector y los límites medidos no se alteran. Tres pruebas comprueban dominio común, valores extremos de otra derivación y rechazo de muestras no finitas.

## Verificación Chromium

El navegador local no permitió abrir la aplicación (`ERR_BLOCKED_BY_ADMINISTRATOR`). Se verificó en GitHub Actions con Chromium 153.0.8010.12, Node 22.16.0 y Playwright 1.63.0; no se presenta el intento local como éxito.

Flujos: carga → primer trazado; inferior/anterior/lateral → hiperaguda/evolutiva; cambio de derivación II/V3/V5 y siguiente latido; monitor congelado → bradicardia; calibres → monitor → papel; exportación PNG desde el diálogo real. Se comprobaron identidad de página, contenido, ausencia de overlay, errores de página y consola. El recorrido terminó sin errores ni advertencias en la ejecución 36090865037.

Viewports 1440×1000 y 390×844. El móvil es emulación, no equipo real. En pantalla estrecha se conserva el desplazamiento horizontal de la ampliación ya existente; la captura inicial no muestra simultáneamente todo el latido. No se atribuye auditoría completa de accesibilidad, audio, todos los formatos ni rendimiento físico.

## PNG

La exportación real contiene pHYs 11811×11811 píxeles/metro, unidad metro, equivalente al redondeo de 300 dpi. Se midieron además los píxeles de 12 PNG producidos por el renderizador, codificados y decodificados: tres velocidades (12,5/25/50 mm/s) por cuatro ganancias (2,5/5/10/20 mm/mV), formato 3×4.

El pulso representa 1 mV y 200 ms. Mayor error observado: ancho 0,473 px, alto 0,280 px; distancia de grilla gruesa 59 px frente a 59,055 px esperados. Tolerancias prefijadas: <2 px para pulso y <1 px para grilla. El layout solo localiza dónde buscar el pulso; el ancho y alto se extraen de los píxeles, no se leen de su fórmula interna. Esta prueba no certifica una impresora, una regla de pantalla física ni la geometría de todos los formatos.

## Build

`build-info.json` incluye commit, estado de archivos relevantes, hash de fuentes y assets públicos, versión del paquete y revisión del candidato. Un build desde archivo sin Git indica commit desconocido. Un PR puede ejecutarse en el commit de combinación temporal de GitHub; éste se distingue del SHA de su rama. Ninguno de estos datos demuestra por sí mismo que una URL pública/privada esté sirviendo el build.
