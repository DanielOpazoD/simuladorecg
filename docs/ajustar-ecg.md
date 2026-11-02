# Ajustar ECG: criterios previos

Iteración del 1 de noviembre de 2026, sobre el árbol de trabajo que ya incorpora
la lectura educativa. La señal, el analizador y la exportación se conservan.

## Alcance y aceptación

- Un único panel «Ajustar ECG» contiene FC, PR, eje QRS, duración QRS, conducción
  intraventricular y QTc. Sin ritmo, ST, ondas ni otras variables en ese panel.
  Los ajustes menos frecuentes permanecen en el desplegable secundario existente;
  los seis campos no se duplican allí.
- Cada campo actúa mediante `changeCase` y el mismo pipeline de generación. Los
  límites, opciones y aplicabilidad se comparten con los controles existentes.
  La frecuencia conserva su significado contextual (auricular, escape o estímulos);
  nunca se etiqueta como FC ventricular una frecuencia que no lo sea.
- Un cambio de conducción actualiza QRS, eje y, cuando corresponda, PR según la
  transición existente. Deslizador y entrada numérica muestran el mismo objetivo;
  una entrada inválida no genera ni modifica el caso. Las medidas automáticas
  permanecen como estimaciones independientes en Medidas.
- Se comprobó antes de integrar que los antiguos pasos de 5 redondeaban el
  deslizador respecto al objetivo inicial (p. ej., PR 144 → 145, QRS 84 → 85 y
  QTc 397 → 395). Los seis campos usan ahora pasos enteros de 1, dentro de los
  mismos límites, para representar exactamente los objetivos existentes. No se
  redondea ni modifica el caso al abrir el panel.
- Los objetivos fraccionarios de casos importados se representan sin forzar un
  paso entero. La entrada inválida nunca genera: al salir del campo se restaura
  el objetivo aceptado, sin reclamar el foco; Enter permite consultar validación.
- La auditoría causal detectó QRS/QTc sin efecto en registros enteramente
  ventriculares aprendidos. Se ocultan esos dos ajustes usando el ámbito real del
  modelo, sin ocultar sus medidas. En una fuente histórica explícita siguen
  disponibles porque allí sí modifican las muestras. No se altera el generador.
- Excepción verificada: VVI a demanda con actividad intrínseca genera escape
  ventricular histórico. Allí QRS/QTc sí actúan sobre el escape y siguen disponibles
  con ese nombre, aunque los complejos estimulados utilicen otra población. No se
  generaliza «estimulación» a una única fuente ni se ocultan por el nombre del ritmo.
- Los controles sin efecto se ocultan y conservan sus valores. El panel completo
  desaparece si no hay controles aplicables o la práctica tiene respuesta oculta.
- En escritorio amplio el panel queda a la derecha; su breakpoint debe conservar
  para el papel al menos el espacio del escritorio habitual de 1440 px. En anchos
  menores va debajo del papel. No se cambia formato, ganancia, velocidad o muestras
  para hacer sitio. En el formato inicial y zoom 100%, las doce derivaciones deben
  seguir completas en escritorio.
- La cabecera, las medidas resumen y el inicio del ECG mantienen su posición en
  escritorio habitual. El panel admite texto ampliado y teclado sin recortar ni
  reducir áreas pulsables de 44 px. No se añade Guardar/Aplicar/Restablecer paralelo.
- Cambiar parámetros retira mediciones del registro anterior y mantiene las
  preferencias de lectura compatibles. Restablecer vuelve al origen existente;
  abrir herramientas y cambiar presentación sin cambiar datos conserva el trabajo.

## Verificación proporcional

Antes/después al mismo viewport: capturas, geometría del papel, muestras y medidas
del worker y PNG exportado sin edición. Intervenciones nativas en los seis campos,
comparadas con la transición existente, más controles sin efecto y entrada inválida.
Resultados por familia: sinusal, bloqueos AV, auriculares, fuente ventricular,
estimulación y ausencia de complejos organizados. Revisar carrera de cambios,
práctica oculta, restablecer, lupa, comparación y exportación.

No se modifica la proyección del renderer. Si la integración exige hacerlo,
se amplía primero el criterio a metrología independiente y controles de error.
Se conservan capturas y resultados adversos en `ECG-QA/quick-adjust-20261101`.
Las pruebas técnicas y la revisión de Fable no demuestran utilidad educativa ni
validación clínica humana independiente.
