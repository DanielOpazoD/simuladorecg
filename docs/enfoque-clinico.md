# Enfoque clínico y contratos de fidelidad

## Propósito y alcance de esta entrega

ECG Lab debe enseñar a reconocer patrones que aumentan la sospecha de oclusión coronaria, además de conocer los umbrales clásicos de elevación del ST. La lectura exige integrar distribución territorial, reciprocidad, proporcionalidad respecto del QRS, morfología, contexto basal y cambios temporales. Ninguno de esos elementos aislado demuestra una arteria ocluida.

Este documento incorpora el espíritu de [Revision_ECG_SCA_Simulador.md](referencias/Revision_ECG_SCA_Simulador.md), aportado por el usuario, después de una lectura completa y una verificación selectiva de las afirmaciones adoptadas. **No ratifica sus 106 referencias ni convierte todas sus tablas en requisitos del generador.** Delimita cinco correcciones del funcionamiento actual y una primera aceptación de fenotipos. Los contratos siguientes son requisitos de esta entrega; los resultados efectivamente obtenidos deben constar en el informe de verificación.

## Interpretación que debe sostener el proyecto

**Observar antes de inferir.** «ST descendido en V2–V3», «T bifásica» y «ST concordante con el QRS» describen señales. «Sugiere isquemia», «compatible con reperfusión» o «plantea oclusión» son inferencias. El diagnóstico, la urgencia y la anatomía requieren datos clínicos adicionales. La identidad de un preset es una configuración del modelo, no una adjudicación angiográfica.

**La ausencia de criterios STEMI no excluye oclusión.** El consenso ACC de dolor torácico reconoce patrones adicionales y distingue los equivalentes de STEMI de otros hallazgos isquémicos. Esa distinción impide convertir cualquier T invertida o elevación de aVR en una misma orden terapéutica. [ACC, 2022, tabla 2 y sección 5.2](https://pmc.ncbi.nlm.nih.gov/articles/PMC10691881/).

**OMI/NOMI es una perspectiva fisiopatológica útil, con definiciones de estudio variables.** Esta documentación no declara que haya reemplazado formalmente STEMI/NSTE-ACS: las guías ESC 2023 y ACC/AHA 2025 mantienen esas categorías operativas. La ESC contempla evaluación invasiva inmediata para SCA sin elevación persistente del ST con características de muy alto riesgo; la decisión no depende exclusivamente de milímetros. [ESC, 2023](https://academic.oup.com/eurheartj/article/44/38/3720/7243210), [ACC/AHA, 2025](https://www.jacc.org/doi/10.1016/j.jacc.2024.11.009).

**La coherencia importa más que superar un umbral dibujado.** Una T prominente debe interpretarse junto con QRS, anchura y distribución; los cambios secundarios de BRI o estimulación exigen otra lectura. La definición universal de 2026 conserva los criterios de ST e incluye patrones adicionales y sus límites. Esto orienta la revisión clínica, sin afirmar que el programa implemente un clasificador de infarto. [Quinta Definición Universal de IAM, sección 13](https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag101/8766309).

**Territorio no equivale a arteria exacta.** Las relaciones entre derivaciones deben resultar coherentes, pero las variaciones anatómicas impiden convertir III > II en una identidad infalible de coronaria derecha. Una validación angiográfica independiente encontró menor rendimiento de las reglas de localización que sus publicaciones originales. [Eerdekens et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28485279/).

## Cinco correcciones: principio, contrato y aceptación

Las tolerancias numéricas que usen estas pruebas son decisiones de ingeniería documentadas. No representan sensibilidad diagnóstica, límites biológicos universales ni certificación clínica.

| Corrección y principio | Contrato de implementación | Prueba de aceptación |
|---|---|---|
| **1. Identidad del caso importado.** La etiqueta debe corresponder a la configuración que realmente genera la señal. | Comparar el preset declarado con los parámetros fisiológicos importados. Una discordancia se identifica como caso personalizado, con nombre automático depurado. Conservar señal, semilla y vista. | Importar casos compatibles e incompatibles; comprobar identidad y nombre, igualdad de parámetros fisiológicos y muestras antes/después. Cambiar una etiqueta no debe corregir el ECG por detrás. |
| **2. Contexto de Sgarbossa.** La concordancia se interpreta sobre una conducción definida. | Seleccionar el ejemplo Sgarbossa configura BRI, anchura, eje y componente septal coherentes con ese ejemplo. Una importación incompatible produce aviso, sin reescribir silenciosamente su fisiología. | Verificar el estado producido por el selector y un QRS ancho compatible con su propósito. Importar la combinación incompatible y comprobar aviso más conservación de parámetros. No declarar cumplimiento de un criterio proporcional sin medirlo. |
| **3. Controles de amplitud con efecto completo.** La interacción debe corresponder a lo anunciado. | `tAmp=0` anula todos los componentes de T, incluido Z y correcciones locales. `st/2` escala las contribuciones regionales de Wellens y de Winter; «ST resuelto» apaga la contribución de lesión. QRS, U y ST secundario mantienen su responsabilidad propia. Explicar el alcance en el control existente. | Comparar componentes y muestras en las ocho derivaciones independientes, con amplitud nula e intermedia y con fase resuelta. Comprobar ausencia de T residual y de correcciones fijas. Aislar el análisis de T para no confundirla con U o ST secundario. |
| **4. Límite explícito del motor ante superposición.** No fabricar un trazado aparentemente válido cuando el modelo deja de ser suficiente. | Informar un error de fuera de alcance ante QRS superpuestos o una activación prematura anterior al inicio de T previa, según la política conservadora de esta versión. No recortar el acoplamiento ni eliminar latidos silenciosamente. | Ejercitar ambos límites y casos vecinos admitidos; verificar un error reconocible, parámetros intactos y ausencia de resultados parciales presentados como válidos. La prueba certifica esta política del motor, no un período refractario efectivo. |
| **5. Pausa, calibres y calibración coherentes.** El usuario debe medir el fragmento y la escala que está viendo. | Centralizar el estado de pausa y calibres; mantener consistencia entre controles, representación y unidades. Comprobar valores eléctricos absolutos y las ocho derivaciones independientes, además de las identidades de extremidades. | Repetir la secuencia de pausa/medición/reanudación y cambios de vista pertinentes; verificar correspondencia temporal y espacial. Contrastar distancias y voltajes esperados, sin aceptar solo correlación de forma o snapshots. |

El punto 4 merece especial precisión: **un prematuro temprano no es clínicamente imposible porque este motor lo rechace**. El programa todavía no representa adecuadamente ciertas interacciones entre activación y recuperación. Su límite no puede enseñarse como una ley electrofisiológica.

En el punto 3, retirar el componente de lesión es una operación paramétrica. No demuestra reperfusión epicárdica, recuperación microvascular, ausencia de necrosis ni un tiempo transcurrido. La etiqueta existente «ST resuelto» y su advertencia de que no produce cicatriz ni Q patológicas deben conservar esa claridad.

## Aceptación inicial de los fenotipos existentes

La primera batería debe describir **qué rasgos se verifican en las muestras** de cada familia actual: orden y polaridad de componentes, anchuras, distribución de ST/T, relaciones entre derivaciones y respuesta a los controles corregidos. Cada expectativa tendrá caso, semilla, filtro, unidades, ventana y tolerancia. Debe distinguir una condición necesaria de un ejemplo típico: la reciprocidad inferior elegida puede ser requisito de ese preset, sin afirmarse obligatoria en todos los infartos inferiores.

La evaluación conserva tres responsabilidades:

1. **Generador:** produce componentes y relaciones eléctricos acordes con su contrato.
2. **Analizador:** estima a partir de muestras; su error no se oculta sustituyendo estimaciones por parámetros del generador.
3. **Representación:** dibuja y permite medir esas mismas muestras con calibración y tiempo correctos.

Un test del generador no valida el analizador, y una imagen convincente no valida ninguno de los dos. Las expectativas deben incluir controles que detecten una etiqueta falsa, un componente que no desaparece o una escala incorrecta. La revisión humana de plausibilidad clínica permanece pendiente hasta realizarse y documentarse; el número de pruebas aprobadas no la sustituye. LUDB aporta evidencia externa de delimitación QRS en el alcance ya publicado, no validación de isquemia ni resultados angiográficos.

## Matices clínicos adoptados

**aVR elevado con descenso difuso no identifica por sí solo el tronco.** En Knotts, 57 de 133 pacientes tuvieron angiografía; entre los estudiados, el 23% presentaba enfermedad de tronco o equivalente. La selección impide usar ese porcentaje como probabilidad universal. Se conserva la descripción de patrón y su necesidad de contexto. [Knotts et al., 2013](https://pubmed.ncbi.nlm.nih.gov/23312698/).

**Wellens no equivale siempre a oclusión total persistente en ese instante.** En la serie de 1989, los 180 pacientes tenían estrechamiento de DA, pero 33 presentaban oclusión completa en una angiografía realizada, en promedio, días después del dolor. La diferencia temporal también limita cualquier inferencia sobre el flujo al obtener el ECG. [de Zwaan et al., 1989](https://pubmed.ncbi.nlm.nih.gov/2784024/). La morfología puede observarse tras alivio de la isquemia; no debe etiquetarse como un estado angiográfico demostrado. [ACC, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC10691881/).

**BRI o marcapasos no invalidan toda interpretación de isquemia.** La relación con QRS importa. El criterio modificado de discordancia incluye ST elevado al menos 1 mm y proporcionalidad respecto de S; usando S negativa, la razón es ≤ −0,25. Esa convención debe explicitarse si se verifica el ejemplo. Un resultado negativo no excluye oclusión, y configurar BRI no implica calcular Sgarbossa automáticamente. [Smith et al., 2012](https://pubmed.ncbi.nlm.nih.gov/22939607/), [ACC, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC10691881/).

## Afirmaciones del adjunto que no se incorporan como reglas

- **Sensibilidad STEMI de 30–45% como constante.** El 41% de Meyers procede de 808 pacientes seleccionados retrospectivamente y de una definición compuesta de OMI, que admite situaciones distintas de TIMI 0 al obtener el ECG. Se conserva la conclusión cualitativa de que el umbral puede omitir oclusiones; no se extrapola su rendimiento. [Meyers et al., 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8065286/).
- **Dipolo con fidelidad clínica de 80–90%.** No se aporta una métrica, población y validación que sustenten ese número. Tampoco sumar fuentes proyectadas con una misma matriz resuelve automáticamente la limitación espacial del dipolo.
- **Reciprocidad «siempre», T/QRS como diagnóstico universal o cualquier cambio dinámico como idéntica urgencia.** Son simplificaciones excesivas. La ESC distingue cambios dinámicos de cambios recurrentes sugestivos de isquemia en su estratificación. [ESC, 2023, sección 5.2](https://academic.oup.com/eurheartj/article/44/38/3720/7243210).
- **Cronología determinista T→ST→Q, arteria deducida sin incertidumbre, porcentaje de miocardio perdido o aceptación por parecer real.** Requieren modelos y validación adicionales. No son garantías de esta versión.

## Implementación parcial y aspiraciones conservadas

La T ya incorpora correcciones regionales heurísticas para inferior (dos perfiles), anterior y lateral en fases hiperaguda/evolutiva, exclusivamente en el dominio descrito en la [matriz vigente](alcance-actual.md). No equivale a calibración anatómica ni poblacional. Acoplar despolarización a lesión, calibrar fases frente a registros seriados y ampliar validación independiente continúan pendientes. Etiquetas honestas, controles completos, límites explícitos y medición consistente siguen siendo contratos vigentes. No incorpora nuevos módulos, diagnósticos automáticos, puntuaciones, derivaciones, escenarios terapéuticos ni una simulación de reperfusión continua.
