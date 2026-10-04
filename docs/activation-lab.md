# Laboratorio de activación QRS

## Contrato del bloque

Abre **Activación QRS** en las herramientas del simulador. El laboratorio toma
una copia del caso y los eventos ventriculares generados en sus primeros diez
segundos. No genera un latido ficticio a partir de la etiqueta diagnóstica: AAI
conserva sus latidos conducidos, una EV conserva su tipo y un escape ventricular
no se convierte en conducción normal. El selector permite explorar cada evento.

A es la copia capturada. B comienza sin cambios y permite seis ejemplos de
conducción para un latido conducido, o selección automática/cuatro fuentes
ventriculares para un evento no conducido. Las fuentes son los perfiles
ilustrativos existentes, no localizaciones anatómicas nuevas. Los cambios de
conducción utilizan `changeCase()` y muestran sus cambios coordinados de QRS y
eje. No se modifica el catálogo ni se introducen coeficientes fisiológicos.

## Duración y modelo de B en el mismo experimento

**QRS solicitado B** y **Modelo de activación B** reutilizan `changeCase()` y el
modelo regional de BRD existente. No hay otro generador ni coeficientes nuevos.
A permanece capturado; variar QRS/modelo conserva el instante absoluto del cursor
hasta el final del rango compartido. Cambiar conducción/fuente recupera sus
parámetros coordinados y los del caso capturado. **Restablecer B = A** descarta
los ajustes, incluso después de una entrada inválida, sin cerrar el diálogo.

Ejemplo: abrir BRD, mantener su conducción/eje, elegir el modelo regional y
comparar 150 frente a 190 ms. La interfaz distingue **QRS solicitado** del
**QRS efectivo del modelo**: una fuente ventricular puede imponer su mínimo.
El estado es por evento, no solo por caso: una EV dentro de un caso regional usa
su propia fuente. Los soportes septal/VI/VD proceden del módulo regional existente;
son parámetros de ingeniería y no tiempos de activación anatómicos medidos.
Fuera del dominio se conserva la solicitud, se muestra **Regional no aplicado**
y se identifica la plantilla utilizada. La etiqueta de conducción no diagnostica
un QRS cuya duración se haya modificado.

Una entrada vacía, no finita o fuera de 60–240 ms invalida y retira inmediatamente
el experimento: no se puede aplicar ni exportar la vista anterior. No se redondea
ni limita silenciosamente el valor. SVG identifica el modelo aplicado de A/B;
JSON añade `timing` con solicitud, modo realmente aplicado, motivo y soportes.
El formato del caso permanece v1 y el nuevo metadato del experimento es aditivo.
Aplicar pasa por el worker existente; el QRS aislado no calcula un nuevo QT ni
asegura que todas las combinaciones de repolarización estén admitidas.

Aceptación adicional: ocho pruebas del modelo cubren inmutabilidad, transiciones,
restablecimiento, entradas inválidas, procedencia, el reloj inicial fijo con
control negativo de plantilla, fallback y la distinción entre EV/conducción.
El recorrido de navegador ya existente verifica edición, cursor, SVG/JSON,
invalidación, reset, aplicación real y cancelación en la misma matriz de motores.
No se crean workflows, dependencias ni capas nuevas. Los resultados concretos
pertenecen al commit evaluado; esta descripción no equivale a CI aprobado.

## Aplicación transaccional: primero validar, después sustituir

**Aplicar B** ya no cambia el caso ni anuncia éxito antes de recibir el resultado
completo del motor. `SignalController.evaluate()` utiliza la misma cola y worker,
pero entrega el resultado al intento del laboratorio, no a la sesión principal.
A, sus muestras, medidas y herramientas permanecen vigentes durante la espera.
Una respuesta válida se publica por el mismo camino de generación habitual,
sin sintetizar por segunda vez. El origen de exploración permanece intacto.

Mientras se valida, el experimento queda bloqueado y un estado visible informa
qué ocurre; Cerrar y Escape siguen disponibles. Cancelar retira el identificador
y detiene el worker si estaba calculando esa alternativa. Una selección posterior
prevalece sobre cualquier respuesta tardía. No se crea un worker paralelo.

Si B queda fuera del dominio del ECG completo o se agota el reintento de
transporte, el motivo permanece dentro del laboratorio. No se invalida A ni se
publica la respuesta fallida. Los controles se recuperan para corregir B,
restablecer o cerrar. La previsualización de QRS no se convierte en una promesa de
validez de P/ST/T: el motor conserva todos sus límites y mensajes anteriores.

Aceptación: se amplían las pruebas existentes del transporte y el modelo; el
recorrido de producción retiene una respuesta real del worker para comprobar
la espera, commit único y cancelación, sin fabricar señales. También reproduce
un rechazo real de síntesis completa y un fallo de transporte acotado, y exige
preservación del caso exportado, píxeles del trazado y medidas. Se utiliza la
matriz de navegadores existente; no se añaden dependencias ni workflows.

## Qué representa la imagen

`activation-model.ts` suma los componentes temporales de `qrsKernels()` usando
`qrsKernelValue()`, igual que `signal.ts`, incluido el soporte regional. Se muestrea el
QRS aislado con intervalos de como máximo 1 ms, incluyendo ambos extremos. La
proyección a las doce derivaciones usa el registro físico existente y conserva
las identidades de Einthoven y Goldberger.

La vista oblicua XYZ y los planos XY, XZ e YZ pertenecen al **marco sintético del
modelo**, no a un campo anatómico calibrado ni a una adquisición de VCG. Se
excluyen P, ST, T, espigas, filtros, ruido, antialias de adquisición e inversión
de electrodos. Por tanto, estas curvas no son una extracción del ECG de papel.

Las dos alternativas comparten rango de amplitud y tiempo absoluto desde el
inicio del QRS; no se estira una duración para igualarla a la otra. Un cursor a
120 ms puede mostrar que el QRS conducido de 90 ms terminó mientras el ejemplo de
BRD de 150 ms sigue activo. La reproducción es lenta y explícita: dos segundos
para recorrer el intervalo completo. No se inicia automáticamente.

El pico y la longitud del bucle se calculan sobre la **suma temporal muestreada**,
no sobre el polígono de coeficientes. El eje integra esas muestras por trapecios
antes de proyectar a I/II. No tiene por qué ser idéntico al contrato histórico
ponderado sólo por sigma: los soportes finitos y el taper importan. No se altera
ni se renombra ese contrato histórico. Las unidades de la integral son
coordenadas del modelo × ms; sólo la proyección a derivaciones se expresa en mV.
Un eje con magnitud frontal despreciable se declara indefinido.

## Dominio admitido y límites explícitos

- FV/asistolia o ausencia de eventos: no se inventa un QRS organizado.
- TV polimórfica: su rotación depende del tiempo absoluto; no se sustituye por
  un bucle estático.
- QRS posterior: incluye una corrección local por derivación sin XYZ único; no
  se oculta esa contribución.
- WPW conducido: incluye delta adicional; se declara aún no representable aquí.

La vista previa es de QRS. Al aplicar una alternativa, el motor existente vuelve
a validar y sintetizar el ECG completo. La repolarización de ciertas
combinaciones sigue fuera de alcance y puede ser rechazada por ese motor.

## Estado, accesibilidad y exportación

Cerrar/Escape descarta el experimento. Aplicar B es explícito y sólo recibe un
caso clonado si el caso de origen sigue vigente. La aplicación principal utiliza
su flujo normal de generación por worker, conserva el origen de exploración y
cierra el laboratorio al invalidar la señal. El laboratorio se deshabilita
mientras la señal no está disponible y en preguntas sin respuesta del modo
práctica. La animación se detiene al cerrar o al ocultar la pestaña.

El diálogo nativo contiene el foco; Escape lo devuelve al botón de apertura. El
selector de latido conserva el foco al reconstruirse. El cursor admite teclado,
lectura numérica instantánea y estilos con movimiento reducido. A usa línea
discontinua y B continua, además del color. La interfaz utiliza las variables de
tema del programa y reorganiza sus controles para pantallas pequeñas.

SVG conserva los cuatro planos, las doce derivaciones, escalas, leyendas y el
cursor elegido, sin archivos externos. JSON conserva casos, muestras, tiempos,
escalas y procedencia real del build, con `clinicalValidation: false`. Del evento
original sólo se conserva tiempo/tipo/RR: **no se presenta su QT como verdad de
la alternativa**. Sin procedencia inyectada por Vite, la identidad sigue siendo
`unknown` y `dirty: true`; no se inventa un commit limpio.

## Archivos y separación de responsabilidades

- `src/ui/activation-model.ts`: experimento puro, dominio y muestreo de la fuente.
- `src/render/activation.ts`: geometría SVG y cursor a partir de ese experimento.
- `src/ui/activation-lab.ts` y `.css`: diálogo, estado temporal y acciones.
- `src/main.ts`: apertura, exclusión en práctica y aplicación por el flujo existente.
- `tests/activation-model.test.ts`: contratos numéricos, eventos, escala,
  inmutabilidad, procedencia temporal y dominios excluidos.
- `tests/browser-activation.mjs`: recorrido sobre `dist`, worker real y descargas.

No cambia `src/engine/`, `src/presets/`, dependencias, protocolos externos ni
snapshots. El helper compartido del catálogo espera a que su controlador
responsive actualice `inert`; ya no elimina ese atributo desde el test para
forzar interactividad. No se relajan umbrales ni se omiten verificaciones.

## Aceptación antes de integrar

En un checkout limpio con las dependencias fijadas:

```bash
npm ci
npm run check
# Después del build y con vite preview en http://127.0.0.1:5173/:
node scripts/verify-production.mjs
node tests/browser-activation.mjs
ECG_ACTIVATION_ENGINES=all node tests/browser-activation.mjs
```

El workflow de fidelidad ejecuta el recorrido Chromium sobre el build verificado
y la matriz de Chromium/Firefox/WebKit sobre los mismos bytes. La suite comprueba
cancelar sin cambios, aplicar con regeneración, fuentes, AAI, cursor, exportación,
exclusiones, aislamiento de práctica y ausencia de desbordamiento. Esos comandos
son **criterios de aceptación**, no una afirmación de que ya se hayan ejecutado
en cualquier entorno que contenga este documento. La evidencia de ejecución debe
adjuntar commit, entorno y limitaciones. Ninguna comprobación sintética o visual
certifica validez clínica.
