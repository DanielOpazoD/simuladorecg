# Contratos de intervención electrofisiológica

Este protocolo refuerza los ritmos, controles y modelos existentes. Comprueba la
coherencia del generador al intervenir sobre un mismo caso; no valida mecanismos
celulares, diagnósticos ni precisión del analizador. Los eventos sitúan las
ventanas de auditoría y las aserciones se contrastan con las muestras resultantes.
Un calendario utilizado como referencia interna no es una anotación independiente.

## Qué representa cada relación

| Intervención actual | Representación y respuesta esperada | Invariantes y control negativo | Evidencia automática |
| --- | --- | --- | --- |
| PR en ritmo sinusal conducido | El calendario conserva P y desplaza su QRS por el cambio de PR. La base aprendida estira PQ; los núcleos desplazan el complejo ventricular. | P temprana aislada, duración QRS y QT adaptado se conservan a igual ritmo. La señal completa debe cambiar: un control inerte falla. | `tests/electrophysiology-interventions.test.ts`: PR 240→320 ms, tres semillas, ambas familias. |
| Wenckebach 4:3 | El calendario aplica retrasos AV progresivos y una P no conducida. No se calcula la conducción de un nodo AV celular. | Una P bloqueada permanece en las muestras y no adquiere QRS. P=0 elimina su componente sin modificar el calendario. | Nueva prueba de P bloqueada sobre ambas familias; `tests/engine.test.ts` conserva la progresión PR, RR y pausa. |
| Bloqueo AV completo, escape de unión o ventricular | Dos relojes independientes, con morfología del escape según el modelo seleccionado. | Cambiar frecuencia auricular no cambia eventos ni muestras ventriculares aisladas. Al restaurar P, la diferencia auricular debe verse. No se afirma que la suma P+QRS permanezca idéntica. | Nueva prueba emparejada de `complete` y `complete_v` con P=0/P>0, ambas familias. |
| Ganancia QRS con ST–T secundaria | Las clases aprendidas de rama/HVI escalan su repolarización con QRS. En los núcleos, ST/T siguen la fuente QRS según su contrato. | ST/QRS previsto se conserva; T=0 no obliga a eliminar el ST secundario de los núcleos. Una clase con T primaria constituye el control negativo. | `tests/realistic-signal.test.ts` (BRI/BRD/BRDi/HVI y HBAI); `tests/secondary-st-resolution.test.ts`; `tests/repolarization-coherence.test.ts`. Se reutilizan estas pruebas, sin duplicar sus oráculos. |
| QTc en un latido conducido | Se transforma QT según la historia RR adaptada y se estira la repolarización. | Calendario, historia RR y QRS temprano se conservan; la repolarización muestreada debe responder. | Nueva prueba QTc 400→520 ms a 60 lpm, ambas familias. |
| Historia RR | Aproximación de ingeniería con memoria: igual RR actual no exige igual QT si difiere la historia. | La respuesta inicial es gradual y las dos historias convergen bajo un reloj posterior común. Cambiar un parámetro del caso inicia un registro nuevo, no continúa un paciente previo. | Nueva prueba de dos historias que terminan en el mismo instante y comparten 240 s posteriores; `tests/fidelity.test.ts` y `tests/qt-history-initialization.test.ts` conservan adaptación e inicialización. |
| QT solicitado y realizado | El modelo conducido limita el soporte a QRS+120 ms y el QT a 900 ms. Los latidos ectópicos aprendidos conservan duraciones propias. | Un límite numérico se comunica como tal. No debe atribuirse recorte de QTc a un latido de duración propia. | `tests/qt-model-limits.test.ts` y nuevo control negativo VVI aprendido en `tests/electrophysiology-interventions.test.ts`. |
| Combinación fuera de dominio | El motor aditivo rechaza interacciones que no representa; no calcula fusión ni refractariedad celular. | No mueve ni elimina eventos para producir una imagen plausible. Una P independiente o la superposición ordinaria P/T no adquieren una prohibición fisiológica nueva. | `tests/prematurity-contract.test.ts`, `tests/wpw-antegrade-clock.test.ts` y contratos de alcance existentes. |

## Condiciones y tolerancias

- Las pruebas nuevas usan adquisición ideal, filtro apagado y variabilidad del
  reloj nula. La base aprendida conserva su modulación respiratoria y variación
  de forma entre latidos. Los contratos de adquisición y filtro son pruebas
  separadas; no se usa un cambio de ruido para explicar un efecto fisiológico.
- `learnedBase: false` se declara solamente en la rama de prueba de los núcleos;
  no se interpreta como una caída automática del producto ni como equivalente
  de una población aprendida.
- Las tres semillas del ensayo PR son 13, 53 y 12066. Comprueban consistencia de
  la intervención y no estiman una distribución clínica ni una tasa de error.
- La P temprana se compara en una ventana de −20 a +40 ms desde su evento, con
  un ciclo de 1,5 s y PR de 240/320 ms. Ambos PR conservan la duración P, la
  ventana precede al traspaso PQ y el ciclo deja fuera la cola del latido previo.
  Al acortar el ciclo, mover el PR previo puede mover su Ta/post-T sobre la P
  siguiente: esa superposición legítima no permite exigir igualdad local exacta.
- Para auditar P se sustrae la señal del mismo caso con amplitud P cero. Se
  exige una respuesta mayor de 0,005 mV y un residuo entre intervenciones menor
  de `1e-10` mV en esa ventana. Es una tolerancia aritmética de una operación
  ideal, no precisión de lectura clínica. El límite de respuesta solo impide
  aprobar una ventana vacía o un componente eliminado.
- El QRS temprano del ensayo QTc deja 50 ms antes de J para excluir el traspaso
  QRS/ST y el soporte centrado de ±40 ms del antialias. Se exige estabilidad
  aritmética en esa ventana, no identidad de todo el QRS al modificar su vecino.
- La independencia ventricular con P=0 exige muestras finitas exactamente iguales
  en todas las derivaciones; P restaurada debe mostrar una diferencia mayor de
  0,03 mV. El calendario se verifica por separado y conserva todos sus eventos.
- El ensayo de historia no compara QT con una segunda copia de su fórmula.
  Contrasta dos antecedentes a igual RR final, exige una separación inicial
  mayor de 50 ms, cambios inmediatos menores de 2 ms y convergencia por debajo
  de 1 ms tras 240 s comunes. Son criterios del modelo de ingeniería actual.
- Los límites numéricos de QT, los umbrales de respuesta de estas pruebas y los
  límites de superposición no se presentan como límites biológicos.

## Ejecución y aceptación

```sh
node node_modules/vitest/vitest.mjs run tests/electrophysiology-interventions.test.ts tests/engine.test.ts tests/realistic-signal.test.ts tests/secondary-st-resolution.test.ts tests/repolarization-coherence.test.ts tests/qt-model-limits.test.ts tests/qt-history-initialization.test.ts tests/fidelity.test.ts tests/prematurity-contract.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

Se acepta esta capa cuando los contratos nuevos y los referenciados pasan y el
analizador congelado conserva su código. Un cambio intencional de mecanismo debe
actualizar el contrato y justificar su nueva evidencia; no basta regenerar una
huella de muestras o ampliar una tolerancia hasta que pase.

La revisión de fenotipos con pacientes externos y lectores clínicos independientes
sigue siendo un estado distinto. Estas comprobaciones no la sustituyen y no
convierten un preset en un síndrome clínicamente validado.
