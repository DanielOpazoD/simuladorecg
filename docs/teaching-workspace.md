# Lectura en la misma página

Actualización del 1 de noviembre de 2026. La ventana Aula se retira: su editor de
anotaciones, ajustes de escala y latido, comparación secundaria y ejercicio de
revelar añadían decisiones para un público de clínicos generales. El contenido
útil se encuentra ahora bajo «Qué observar», en el recorrido habitual de lectura.
La lupa, las medidas, la comparación principal y la exportación existente continúan
en sus lugares. No se añade un segundo recorrido de herramientas.

## Criterios fijados antes del cambio

- Cero modificaciones de las muestras finales, eventos, analizador o parámetros
  por leer, recorrer o reproducir una ayuda. Comparar muestras y medidas del worker,
  imagen del papel y posición del ECG antes y después de las interacciones.
- Una explicación breve y, cuando aporta, una figura contextual. Sin pestañas de
  Aula, editor, selectores de escala, latido o vista ecográfica. Sin panel vacío de
  «no disponible» cuando un esquema no corresponde al caso.
- Las ayudas utilizan el caso y la señal aceptados juntos. Se destruyen al invalidar
  el registro, cambiar de caso o entrar en práctica oculta. Cambiar el tema no debe
  reiniciar el apoyo de lectura.
- AV: eventos explícitos P → QRS, en segundos desde el origen adquirido; PR mostrado
  en milisegundos. Nunca elegir el QRS más cercano. En bloqueo completo, ninguna
  diagonal, aunque P y QRS coincidan. No inferir localización anatómica ni clasificar
  un bloqueo 2:1 como Mobitz I o II.
- Wenckebach: mostrar un ciclo comprobable, con al menos tres PR crecientes,
  una P no conducida y la respuesta de la siguiente P con PR más corto. Si no cabe
  completo en los primeros diez segundos, no fabricar una demostración.
- La tira II contiene las muestras finales sin suavizado, normalización ni cambio
  de amplitud. Tira y escalera comparten un eje temporal a 50 mm/s y 10 mm/mV.
  Ventana elegida por eventos, bordes finitos y QRS final completo.
- Un juez separado lee las capturas PNG y recupera la escala de la grilla. Se
  contrastan las marcas con los eventos del worker. El encaje debe superar 90%
  con al menos seis marcas; los controles negativos de +40 ms y +10% de escala
  deben quedar bajo 50%. Se conservan imágenes, resultados y fallos anteriores.
- Eco: exclusivamente un esquema de contracción en los ejemplos agudos anterior,
  inferior derecho e inferior circunflejo compatibles. Una vista de dos cámaras,
  sin segmentos seleccionables ni valores de función ventricular. No inferir
  motilidad, FEVI o tiempo electromecánico a partir del ST o del trazado.
- Movimiento explícito, a un cuarto de velocidad y sin bucle. Pausar al salir de
  pantalla, abrir una ventana o cambiar de contexto. Movimiento reducido conserva
  el control manual y desactiva la reproducción. No hay autoplay.
- Escritorio y móvil: teclado, tema claro/oscuro y texto al 200%. La página puede
  crecer hacia abajo; solo la secuencia AV puede desplazarse horizontalmente para
  conservar su escala. Ninguna nueva ventana ni desplazamiento vertical anidado.

## Procedencia y límites

`av-reading.ts` fue desarrollado con Claude Fable y revisado localmente; Fable
participa además en el contraste técnico. La escalera explica el calendario de
activación del modelo, no una medición independiente del ECG ni un estudio
electrofisiológico. La ilustración mecánica reutiliza la geometría docente
existente y un retardo fijo de 80 ms; no simula una imagen ultrasónica.
Las fuentes y los límites se reúnen en el icono de información.

Los criterios anatómicos de los segmentos siguen
[ASE/EACVI 2015](https://asecho.org/wp-content/uploads/2016/02/2015_ChamberQuantificationREV.pdf).
La asociación orientativa entre ejemplos ECG y motilidad no prueba esa relación
en un paciente. El movimiento normal o anormal de esta ilustración no confirma
ni descarta una causa clínica.

La utilidad para aprender y la claridad para clínicos generales requieren
observación de usuarios. Las comprobaciones de código, eventos e imagen no la
demuestran. Tampoco sustituyen revisión clínica humana independiente, aún pendiente.

## Evidencia y compatibilidad

Los resultados de esta iteración se guardan fuera del repositorio en
`ECG-QA/inline-*20261101*`. Las versiones previas de Aula y sus pruebas retiradas
se conservan en `ECG-QA/retired-aula-20261101`; los fallos de rondas anteriores
permanecen en sus directorios de QA. Las funciones puras de exportación anotada
histórica conservan sus pruebas de compatibilidad, pero no se ofrecen como editor.
No se modifica la exportación limpia principal.
