# Descripción educativa y recorrido lento

La explicación visible añade hasta dos frases originales en español para relacionar
la lectura del registro actual con un mecanismo y orientar la observación. No
reemplaza las medidas ni el texto estructurado usado por las exportaciones.

`educational-reading.ts` utiliza el estado actual, los eventos y el mismo contrato
de intervalos que las tarjetas. Para anunciar progresión del PR exige un ciclo
completo de eventos entre P no conducidas; el nombre Wenckebach por sí solo no basta.
No localiza el bloqueo AV. En 2:1 conserva la incertidumbre de clasificación.
Una espícula no se presenta como garantía de captura y un QRS ancho no adjudica
la causa del ST–T. En práctica sin responder, la explicación sigue oculta.

El recorrido de la lupa utiliza `acceptedBeatIntervals`, igual que las marcas
automáticas. Requiere QRS y QT completos dentro de la ventana, sin otro QRS
superpuesto. El PR solo se incluye si está aceptado. Los límites multiderivación
son estimaciones; si requieren revisión, la ayuda conserva ese estado.

El delineador no aporta final de P ni inicio de T: la ayuda distingue PR, QRS y
ST–T, sin inventar una frontera entre P y segmento PR ni entre ST y T. El cursor
se reproduce a un cuarto de velocidad, sin bucle, o se mueve con el control de
tiempo. No cambia muestras, intervalos, calibración ni geometría del trazado.
Medir, cerrar o dejar la página pausa la reproducción. Con movimiento reducido
se mantiene el recorrido manual. Los avisos de conexión/polaridad tienen prioridad.

## Procedencia y límites

Redacción propia desarrollada con Fable y revisión técnica local. Inspiración
docente: [The Heart in Twelve Leads](https://therealryc.github.io/heart-in-twelve-leads/),
capítulos 06, 09, 10, 13 y 14. No se copia su motor ni sus textos. La guía
[ACC/AHA/HRS 2018](https://www.ahajournals.org/doi/10.1161/CIR.0000000000000628)
respalda la limitación de clasificación del bloqueo 2:1. Las fuentes de criterios
de las medidas siguen reunidas en la información técnica existente.

Estas ayudas describen los eventos disponibles y conceptos docentes; no añaden
propagación celular, reconstrucción anatómica o un diagnóstico independiente.
La revisión de Fable no equivale a revisión clínica humana independiente.

## Verificación

Pruebas unitarias: copia breve, condiciones de aplicabilidad, controles negativos
de PR, ausencia de intervalos, ventanas incompletas y no mutación de la señal.
Pruebas de navegador: reproducción/pausa, cursor y controles negativos de escala
y tiempo, calibres conservados, geometría y muestras intactas, movimiento reducido,
conexión invertida y práctica oculta. Se añaden a la CI, junto a las regresiones
de lupa, calibres, retorno y el oráculo de píxeles independiente del renderer.

## Escalera AV en la lectura

Los siete ejemplos de bloqueo AV incorporan una tira II con su escalera debajo
de la explicación, en la misma página. No hay ventana Aula, selector de latido,
ajustes de escala ni editor de anotaciones. El apoyo es estático: permite seguir
la secuencia sin tener que configurar nada. Las muestras y la escalera comparten
eje temporal a 50 mm/s y 10 mm/mV. En móvil se desplaza únicamente la figura,
conservando la escala. El ECG principal no cambia.

Wenckebach requiere tres PR crecientes, una P no conducida y el siguiente PR
reiniciado más corto, dentro de los primeros diez segundos adquiridos. Los demás
ejemplos muestran varios eventos desde el comienzo del registro. La figura no
se monta si no puede verificarse la secuencia. La práctica oculta elimina también
su contenido y los metadatos de la ayuda; no se ocultan solo con CSS.

`av-ladder.ts` utiliza asociaciones explícitas P → QRS del calendario completo:
`tiempo de P + PR = tiempo ventricular`, con la tolerancia de 1e−9 s del contrato
de eventos. No elige el QRS más cercano. Los tiempos están en segundos desde el
inicio adquirido y el PR se presenta en milisegundos. En bloqueo completo no
traza asociaciones, aunque coincidan una P y un QRS. Una P que cae fuera del
encuadre o del comienzo del registro no se convierte en una P bloqueada.

A, AV y V son carriles esquemáticos. La pendiente muestra el PR total del modelo;
la barra identifica una P sin respuesta ventricular. No representa el sitio
anatómico del bloqueo, tiempos AH/HV ni una medición obtenida de las ondas.
Se rechazan calendarios incompatibles, espigas, asociaciones ausentes y muestras
incompletas. No se alteran el generador, el analizador ni las exportaciones; la
escalera permanece como apoyo de pantalla. Tampoco permite clasificar un 2:1 como
Mobitz I o II ni añade validación clínica independiente.

La verificación cubre cada ejemplo AV, controles ajenos al dominio, asociaciones
desplazadas y bordes del registro. El navegador comprueba alineación, práctica,
retorno, unidades y conservación del registro completo, las medidas y el papel.
Un juez separado recupera la escala de la grilla desde capturas PNG y contrasta
los ticks con los eventos del worker, con controles negativos de tiempo y escala.
La revisión técnica de Fable se conserva con sus hallazgos y correcciones;
no reemplaza la revisión clínica humana independiente.

## Relación eléctrica y mecánica

Solo algunos ejemplos agudos de isquemia muestran un esquema de contracción en
la misma página. Una vista de dos cámaras y un control de reproducción bastan;
no se incluyen segmentos numerados, vistas múltiples ni medidas de función.
La animación reutiliza el modelo ilustrativo existente: no reconstruye motilidad
desde las amplitudes del ECG. Comienza únicamente al pulsar «Ver movimiento» y
se pausa al abrir una ventana o dejar de verla. Con movimiento reducido queda
disponible el recorrido manual. Sus límites y fuentes están en información.
