# Repolarización regional — revisión v1.4

## Qué cambia y qué no

La base es `38c0cd31b5836c96c82556d756e8150cfde99c64`. Los cuatro perfiles ya existentes inferior CD/Cx, anterior y lateral reciben una modificación de T regional al seleccionar fase hiperaguda o evolutiva. Se conserva el ST de lesión, QRS, eventos, QT, filtros y detector. Los 61 presets por defecto siguen en sus configuraciones anteriores; el cambio se observa al elegir esas dos fases. No se agregan diagnósticos, derivaciones, controles ni trazados grabados.

El ámbito es latido normal, conducción normal y ausencia de sobrecarga o alteración electrolítica. Bloqueos, estimulación, ectopia ventricular y patrones especiales mantienen la aproximación previa. Esto no implica que la isquemia no pueda coexistir con ellos; simplemente no se les extrapola el perfil nuevo.

## Modelo y origen de los parámetros

Se separan T basal vectorial y corrección regional. Son perfiles reducidos en las ocho derivaciones independientes; NO representan campos anatómicos calibrados, múltiples dipolos fisiológicos ni propagación celular. III/aVR/aVL/aVF se calculan de I/II después del procesamiento. La guía aportada por el usuario (§9.1 S2/S4 de Revision_ECG_SCA_Simulador.md) orienta territorio, anchura y asimetría. Los pesos son decisiones de ingeniería iniciales, no estimaciones obtenidas de pacientes.

El lóbulo regional es `sin(pi*u)^1.4`, con valor y pendiente nulos en ambos extremos. Ensancha el componente a media altura dentro del soporte T existente; no alarga el QT programado ni el potencial de acción. En hiperaguda se suma una contribución regional de escala 0,55 mV por peso. En evolutiva se retira gradualmente parte de la T basal local y se suma un lóbulo opuesto de escala 0,70 mV por peso. Son amplitudes de contribución, no voltajes finales garantizados en cada derivación.

La mezcla de T escala linealmente entre intensidad 0 y 2 y se mantiene en el perfil de referencia por encima de 2, como el efecto de fase previo. El ST conserva su respuesta al control de intensidad. Amplitud T escala todos sus componentes; 0 elimina la T pero no ST, U ni ruido. Fase ST resuelto y lesión cero recuperan la repolarización basal. No se asignan minutos de evolución, flujo TIMI ni necrosis.

Los pesos y su alcance están centralizados en `src/engine/regional-repolarization.ts`; `signal.ts` los suma antes de filtrado. Sumar vectores con idéntica proyección no aumentaría el rango espacial del modelo: `D(a+b)=Da+Db`. Por ello la corrección reducida se declara explícitamente, sin venderla como modelo anatómico.

## Cómo se verifica

`tests/regional-repolarization.test.ts` verifica cero/resuelto, proporcionalidad de amplitud e intensidad, QRS y eventos conservados, identidades eléctricas, filtros/inversión, localización, extremos suaves y exclusión de causas secundarias. `scripts/validate-repolarization.mjs` compara 32 casos idénticos con v1.3 (4 perfiles × 4 fases × 2 filtros) y 61 defaults, congelando archivos del analizador.

Las métricas reciben muestras y ventanas explícitas: ST en J/J+60, amplitud/área/ancho a media altura/simetría en ventana T y relación al QRS pico a pico. Las ventanas sintéticas usan eventos conocidos: no son delineación independiente. La ventana T contiene la señal completa, incluida contribución ST; no se interpreta como T celular aislada. Amplitud cero, ventana insuficiente o denominador diminuto producen abstención donde corresponde. Se prueban funciones con ondas analíticas a 250/500/1000 Hz.

La inspección visual y la comparación con datos externos se registran separadamente. Ningún resultado de tests implica precisión diagnóstica ni fidelidad clínica poblacional. La fuente externa STAFF III tiene electrodos de extremidades Mason–Likar y oclusión por balón electiva; su comparación es exploratoria. Véase `staff-selection-v1.4.md`.

## Referencias y límites

- Guía del usuario: `docs/referencias/Revision_ECG_SCA_Simulador.md`, §1.4, §6.2 y §9.1. Sus valores (*) no se convierten en constantes universales.
- Meyers et al. 2025: https://pubmed.ncbi.nlm.nih.gov/40892623/ . Área relativa y simetría orientan la evaluación; aquí NO se implementa su puntuación HATW ni se reivindica su sensibilidad/especificidad.
- STAFF III: https://physionet.org/content/staffiii/1.0.0/ . No equivalente a todos los SCA espontáneos.
- PTB-XL+: https://physionet.org/content/ptb-xl-plus/1.0.1/ . Posible ampliación futura; no se afirma haberlo calibrado en esta revisión.

Pendiente: ajuste contra mayor diversidad independiente, revisión de lectores, fuentes regionales anatómicas, gradientes de Wellens/de Winter y efectos de isquemia sobre QRS. El detector conserva sus límites anteriores. El aspecto más ancho o regional no demuestra por sí solo mejor correspondencia con un ECG humano.
