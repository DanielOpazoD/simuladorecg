# WPW: repolarización derivada de la activación representada

## Problema cerrado por este cambio

La onda delta cambiaba el QRS, pero la T seguía una dirección primaria independiente y no existía ST secundario. Ahora los latidos normales preexcitados generan ST y T desde la integral del QRS compacto **incluida su delta**. La interfaz desactiva el eje primario de T y conserva su valor para volver a conducción normal. No se limita a cambiar advertencias.

La integral usa las bases compactas realmente dibujadas, no solamente su sigma: cuadratura de Simpson con 2.000 pasos y área analítica del pulso seno de 45 ms, en las unidades de la fuente secundaria existente. ST = −0,20 × referencia; T opuesta con la normalización secundaria existente. Son elecciones ilustrativas, no parámetros clínicamente calibrados. El ST conserva el soporte C1 ya publicado. Ganancia T = 0 elimina T, no ST; la lesión primaria sigue siendo independiente.

Se comparten las primitivas ventriculares mediante un módulo sin dependencias circulares, manteniendo su orden aritmético. No cambian las bases, la delta, el calendario, la ganancia QRS, los filtros ni los latidos ventriculares/estimulados. El ECG completo sí cambia, incluso en el final del QRS donde comienza el ST suave. No se afirma identidad del QRS filtrado completo cuando ST se superpone.

## Regresión funcional resuelta, no silenciada

El nuevo ST-T expuso 12 casos de doble conteo bajo voltaje/ruido a 73 y 120/min. El detector ahora confirma una onda terminal repetida solamente cuando tres complejos distintos ya aportaron ondas descartadas por su regla estricta, con el mismo contorno y demora. Protege contornos QRS repetidos; nunca recibe diagnóstico, eventos ni verdad del generador. No desplaza candidatos ni modifica muestras. Los 12 casos recuperan frecuencia correcta y utilizable. Las pruebas negativas impiden transferir evidencia con dos anclas, duplicados, demora distinta, polaridad contraria o QRS del mismo contorno.

## Evidencia y límites de aceptación

- Predicción independiente aplicada al código histórico, sin importar/copiar módulos candidatos: `validate-wpw-source.mjs` y `wpw-repolarization-prediction.mjs`. Incluye trazas completas no-WPW exactas y comparación de primitivas ventriculares. Se conserva también la comparación histórica b744 de 244 escenarios y 14.640.000 muestras.
- Prueba independiente adicional por integración de 20.000 puntos, doce derivaciones, duración/eje, ganancia, electrolitos y filtros. El laboratorio de activación se compara con el ECG adquirido sumando explícitamente el nuevo ST.
- Los 152 registros LUDB ya expuestos conservan **toda** la medición publicada: números, candidatos, límites, confianza y poblaciones. Es regresión exacta, no un nuevo conjunto de validación. Los 200 registros LUDB ya se han expuesto; no se reutilizan como nuevos.
- Matriz histórica de 920 escenarios ruidosos: morfología sin cambios; 73.440 comparaciones. Un estrato pierde confianza QRS utilizable porque se eliminan tres falsos candidatos, no porque se pierdan números o empeoren límites: hiperpotasemia/em/12 dB/diagnóstico, ventana 300 s, FP 7→4; QRS 112 ms y sus 11 límites emparejados idénticos. Dispersión 14→16,4 ms al cambiar la población, conservando el límite original de 16 ms. `check-released-noise.mjs` retiene el fallo estricto y admite únicamente esta clase de consecuencia con evidencia numérica intacta; sus pruebas rechazan cambios de cifras, pérdidas de QRS o abstenciones.
- Suplemento WPW de 184 escenarios con los mismos ruidos: FP agregados 791→780, FN 49→50. El FN adicional ocurre en filtro agresivo, cuyas medidas ya están fuera de alcance. Dos nuevas frecuencias crudas incorrectas con confianza utilizable ocurren en monitor; la política publicada del trabajador las mantiene en revisión. No se cambia esa política. En adquisición sin filtro/diagnóstica no se pierden QRS ni aparecen nuevas frecuencias informadas como utilizables e incorrectas.
- Se preserva un resultado desfavorable adicional: en WPW/baseline wander/300 s/−6 dB/sin filtro, QRS global pasa de revisión a utilizable; la mediana permanece 132 ms frente a 135 ms sintéticos, MAE de los límites 9,44→6,11 ms y p95 27→13 ms, pero aún existe un límite de latido con error de 29 ms. La confianza global no es confianza por latido. El informe conserva este hecho; no se presenta como eliminación de todos los errores de delineación.
- El suplemento es caracterización de un cambio intencional de fuente y prueba del dominio actual de medición. No pretende que la antigua forma T sea verdad clínica ni que todo resultado crudo haya mejorado. Se archivan todos los errores, estados y casos adversos.
- Navegador real: trabajador, controles, muestras JSON y PNG en 1440/390 px; comprueba ST con T cero, ganancia T, eje primario inactivo y respuesta al eje QRS. Las imágenes se inspeccionan antes de fusionar.

## Evidencia anterior inmutable

La evaluación prospectiva del final T/QT y su excepción autorizada pertenecen al producto `d208370f883b9f1d3a22c34db62d97daacb279c6`. Se reproducen desde ese código, incluido su protocolo original y su decisión de publicación. El algoritmo nuevo se evalúa aparte contra ese producto en los 152 registros y en ruido. No se alteran los hashes originales ni se presenta una nueva implementación como si fuera la que pasó aquella evaluación. La migración histórica ST también conserva sus dos versiones de código.

## Alcance clínico

Es un modelo ilustrativo de repolarización secundaria, no anatomía de vías accesorias, AVRT, memoria cardíaca ni calibración de riesgo. No reproduce todas las morfologías de preexcitación. La integración opuesta en doce derivaciones es una propiedad matemática de esta representación; no una ley universal ni una herramienta de localización.

Referencias primarias para el alcance y la variabilidad de la preexcitación:

- Eisenberger et al. *A new approach to confirming or excluding ventricular pre-excitation on a 12-lead ECG*. Europace 2010;12:119–123. https://academic.oup.com/europace/article/12/1/119/543641
- Estudio electrofisiológico original de patrones de preexcitación y localización de vías accesorias (1987). https://pubmed.ncbi.nlm.nih.gov/3578049/

Estas referencias no validan las constantes de amplitud ni el detector de este simulador.
