# Coherencia de las afirmaciones clínicas: criterio de revisión

Protocolo fijado el 2026-10-26 antes de modificar los documentos auditados.
Referencia de código: `fbad93d362e80d99d1a86ef1b20e42da76a6f184`.
La revisión no modifica señales ni eleva la plausibilidad clínica del modelo.

## Criterios de aceptación previos

1. El índice dirige al contrato vigente de cada mecanismo. Un documento
   reemplazado se identifica como histórico en su encabezado y remite a su
   sucesor; no se presenta como descripción del código actual.
2. Se conservan sin reescribir los resultados adversos, cifras, fuentes y
   decisiones históricas. Un cambio de implementación posterior no convierte
   una evaluación fallida en aprobada.
3. Toda descripción vigente separa implementación, evidencia técnica y
   evidencia clínica. La presencia de ST–T secundario, el aprendizaje de
   coeficientes y una regresión aprobada no acreditan calibración poblacional,
   criterios diagnósticos ni revisión humana.
4. El alcance se verifica contra la selección efectiva del motor y sus
   contratos. La base de núcleos y las poblaciones aprendidas no se describen
   como si todos sus controles tuvieran el mismo efecto.
5. Los enlaces locales modificados deben resolver. La revisión se limita a
   documentación: las muestras, el analizador y los resultados históricos
   mantienen sus bytes.

## Método

Inspeccionar el índice, la matriz de alcance, la descripción acumulativa del
modelo y las notas de repolarización; contrastar afirmaciones con
`src/engine/secondary-repolarization.ts`, la selección de la base aprendida y
los contratos de fuente existentes. Registrar las contradicciones encontradas
y la corrección de navegación o alcance, sin ajustar parámetros del motor.

La verificación de enlaces y del diff es una comprobación documental. No
sustituye los ensayos sobre muestras ni las lecturas clínicas independientes
del [paquete de revisión](clinical-review-packet.md).

## Resultados

La inspección encontró y corrigió estos problemas de alcance:

| Hallazgo | Corrección | Evidencia de contraste |
| --- | --- | --- |
| El índice y el título A02/A03 presentaban ST secundario ausente como estado vigente. | Mover el antecedente a historia y dirigir a las implementaciones ST/WPW posteriores. | `secondary-repolarization.ts`, `secondary-st-resolution.md`, `wpw-repolarization-resolution.md`. |
| La referencia externa ST–T y el informe de introducción de ST podían leerse como si sus exclusiones siguieran siendo las del producto. | Añadir notas de alcance temporal; mantener íntegros sus resultados y candidatos rechazados. | Los cuerpos anteriores, incluidas cifras y decisiones adversas, se conservan exactamente. |
| La descripción acumulativa atribuía a todo el producto reglas de la rama de núcleos: T independiente, retirada de lesión crónica y parámetros propios. | Distinguir poblaciones secundarias aprendidas, IMI/ASMI y complejos con duración propia. Cambiar «calibraciones propias» por parámetros ilustrativos en el dominio correspondiente. | `realistic/scope.ts`, `realistic/engine.ts`, `model-provenance.ts`. |
| La sección de filtros seguía describiendo monitor causal con guarda de 100 ms y prometía conservación global del prefijo. | Identificar monitor de fase cero, guarda de 4 s y dependencia de longitud del ruido aún pendiente. | `signal.ts`, `monitor-phase-revision.md`, `causal-comparison.md`. |
| La descripción de ampliación podía atribuir al zoom ST el J estimado de «Ondas». | Separar explícitamente delineación observada y final QRS conocido del modelo. | `ui/st-zoom.ts`, `visual-metrology.md`. |

Verificación documental: los enlaces locales de los seis documentos revisados
resuelven; el cuerpo original de las tres notas históricas conserva sus bytes
normalizando únicamente los finales de línea. `git diff --check -- docs` no
detecta errores de espacios. No se añadieron pruebas que solo comparasen la
redacción con otra copia de esa redacción. Los ensayos de causalidad y píxeles
tienen sus criterios y evidencia separados.

Se mantienen pendientes calibración poblacional, lecturas clínicas independientes
y adjudicación. Esta revisión no cambia las constantes ilustrativas ni convierte
un resultado adverso conservado en una aprobación.
