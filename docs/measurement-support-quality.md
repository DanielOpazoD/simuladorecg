# Calidad específica y procedencia de las medidas

Segunda entrega autorizada, después del filtro monitor. El delineador `measure`
y sus candidatos numéricos permanecen intactos. `analyzeSamples` añade procedencia
por FC/PR/QRS/QT/eje y aplica un control de soporte específico para cada resumen.
No usa eventos, etiquetas, frecuencia configurada, SNR ni referencia limpia.

## Qué significa soporte

Cada intervalo identifica los candidatos que realmente contribuyeron a él y sus
extremos en segundos. FC utiliza parejas RR; PR solo latidos con P delineada;
QT solo latidos con finalT. Eje integra I/II; el delineador combina I/II/V1/V5.
Esas listas NO son cuatro mediciones independientes ni certeza por derivación.
Se presentan en un panel desplegable del diálogo de medidas. La auditoría del
modelo continúa después y puede retirar cifras; la procedencia queda rotulada
como salida de muestras PREVIA a esa auditoría.

El segundo umbral ya existente de PR20 se empareja uno a uno a40ms. El mismo
detector bajo otro umbral no es un detector independiente. Sin fondo elevado y
sensibilidad de detección no se penaliza ninguna medida, aunque sea irregular.
Entre los candidatos de CADA variable, almenos2 inestables y>=35% provocan review;
con>=3 candidatos y<2 estables se retira el resumen. Review conserva el número;
unavailable lo retira, conserva el original como rejected y no borra candidatos.
QT retirado retira también QTc/ejeT; PR retirado retira ejeP. No se promueve
ningún estado ni se sustituye una cifra por la referencia sintética.

## Desarrollo y prueba de no empeoramiento

Constantes de ingeniería explícitas, no probabilidades clínicas. En920 escenarios
expuestos, comparados contra la mejora de filtro inmediatamente anterior, no se
perdieron observaciones correctas según los márgenes del ensayo. QRS erróneos
usable166→158; QRS erróneos retenidos2443→2440. FC/QT no cambiaron su cobertura;
no se atribuye mejora a esas variables. Los números QRS/QT citados corresponden
a latidos emparejados bajo un estado global, no a pacientes independientes ni validación de
la mediana clínica. El evaluador mantiene las regresiones por estrato, no solo
agregados. Aún puede haber detecciones erróneas estables ante ambos umbrales.

## Aceptación

`measurement-support.test.ts`: poblaciones diferentes PR/QT, extremos reales,
estados selectivos, abstención sin sustitución, conservación de candidatos,
no-promoción, no-mutación, sensibilidad insuficiente sin penalización y texto UI.
Los61 defaults y8 LUDB conocidos conservan sus valores. Se mantiene la aserción
numérica previa eliminando únicamente el nuevo metadato support del comparador.
El evaluador histórico deHR verifica todos los candidatos y cifras retenidas
idénticos; las retiradas requieren estado unavailable y rejected exacto. Los
hashes del delineador/estadística/detector siguen congelados. No se redefinen
ruidos ni referencias para aprobar. CI de producción debe abrir la procedencia.

Sin nueva validación clínica, diagnóstico automático o modificación del generador.
