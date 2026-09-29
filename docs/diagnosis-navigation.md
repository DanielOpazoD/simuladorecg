# Patrones y variantes en la hoja

La biblioteca pasa de 61 filas activas a 40 entradas activas, sin eliminar ninguno de los
61 presets. Los cinco pendientes continúan deshabilitados. Quince entradas tienen de dos
a cuatro variantes y el resto permanece individual.

FA, flutter y los cuatro ritmos sinusales comparten una entrada cada uno. Las variantes
se seleccionan sobre el ECG, debajo del título, no en una segunda lista lateral. Se aplica
la misma organización a ectopia ventricular, ritmos idioventriculares, TV, escapes de BAV
completo, BRD, hemibloqueos, bifascicular, lesión inferior, Wellens, VD, marcapasos y QT.
Son agrupaciones de navegación: no implican equivalencia clínica ni inventan diagnósticos.
En particular Mobitz I/II, BAV 2:1/alto grado, BRI/lesión concordante e hipo/hiperpotasemia
conservan entradas independientes. Los límites de TV polimórfica, marcapasos y ST siguen visibles.

## Contrato

- Cada selección carga el preset canónico con `fromPreset` y conserva la vista actual.
  Cambiar de variante restablece parámetros a su ejemplo original, tal como indica la interfaz.
- La búsqueda filtra ejemplos ANTES de agrupar. «FA lenta» abre esa variante; en la hoja
  permanecen disponibles las tres. Los IDs exactos sirven también para buscar casos.
- Sin búsqueda, volver a la entrada activa conserva la variante elegida. Las pestañas de
  una entrada siempre muestran los mismos hermanos, con independencia del filtro lateral.
- Un caso personalizado no se clasifica por similitud. Al editar la fisiología se retiran
  el título agrupado y sus pestañas. La adquisición con brazos invertidos conserva su título
  específico. Durante una pregunta se elimina la navegación de variantes del DOM.
- Flechas/Home/End sólo mueven foco. Enter/espacio activan el caso: recorrer pestañas no
  provoca generaciones. El foco se conserva tras renderizar, con un solo acceso de Tab.
- No cambia motor, analizador, presets, datos, escalas, adquisiciones, exportaciones ni
  comparación/revisión de archivos externos. No añade almacenamiento, router ni dependencia.

Referencia de interacción: W3C APG Tabs, activación manual cuando el panel no es instantáneo:
https://www.w3.org/WAI/ARIA/apg/patterns/tabs/

## Pruebas

Los tests de catálogo previos siguen íntegros; la nueva matriz exige cobertura exacta de
los 66 IDs, unicidad, categorías, variantes, búsqueda y no mutación. Los recorridos anteriores
se adaptan sólo para seleccionar los mismos ejemplos a través de la búsqueda visible; no
se crean botones ocultos para automatización ni se retiran aserciones numéricas.

Un recorrido adicional exige las 36 variantes agrupadas, foco/teclado, búsqueda específica,
restauración del ECG completo y A fijada, identidad del caso exportado, ausencia de
pestañas engañosas en caso personalizado/práctica y reflow de móvil. Se ejecuta sobre el build
verificado en Chromium, WebKit y Firefox. Es prueba de software, no adjudicación clínica,
certificación de accesibilidad, prueba física en iPhone ni prueba de lector de pantalla.
