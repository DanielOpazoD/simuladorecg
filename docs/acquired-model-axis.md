# Eje del modelo y referencia de una adquisición invertida

Con inversión de brazos, las muestras cumplían I → −I y aVF → aVF, pero la
tarjeta, descripción y flecha hexaxial conservaban el ángulo basal. En el caso
sinusal reproducido, las áreas de salida cambiaban de unos 50° a 130° mientras
la descripción seguía diciendo «50° (normal)».

`src/ui/acquired-model-axis.ts` separa dos datos: el eje basal de `signal.truth`
y la referencia frontal del registro tras la transformación conocida. La
reflexión de las coordenadas I/aVF da `180° − ejeBasal`, normalizado al círculo.
No se vuelve a ejecutar ni modificar el analizador. No se sustituyen muestras,
metadatos de eventos ni parámetros guardados.

La tarjeta avisa «adquisición invertida». La descripción y la presentación de
30 segundos dicen «eje del registro» e identifican la inversión, sin llamarla
desviación fisiológica. El diálogo del eje explica la adquisición y muestra
por separado el eje basal del modelo antes de dibujar la referencia del
registro. La etiqueta accesible del SVG también identifica los brazos
invertidos. No se interpreta esta transformación como un giro del corazón.

Un eje nulo sigue siendo no determinable, sin producir una flecha de 180°.
Cabrera solo cambia la presentación: no aplica la reflexión de adquisición.
Los casos sin inversión conservan sus valores y textos anteriores exactamente.
La tabla del analizador conserva sus medidas desde muestras y su referencia
propia; no se le aplica una segunda transformación de eje.

## Juez y límites

`tests/acquired-model-axis.test.ts` contiene quince casos. Trece fallaban antes
del cambio; los controles verticales/sin inversión ya conservaban el ángulo.

- Ocho ángulos de referencia, incluidos 0°, ±90° y 180°, comparan tarjeta,
  descripción y SVG contra resultados analíticos conocidos.
- Cuatro ECG sinusales con ejes −60°, 0°, 50° y 90°, semilla del catálogo,
  variabilidad 0, adquisición ideal, filtro apagado, 10 s a 500 Hz: se integran
  I/aVF de los QRS normales completos entre 0,5 y 8 s, con nivel PR local de las
  tres muestras anteriores. La reflexión de sus áreas debe coincidir en
  1e-9 grados (álgebra), y el ángulo del modelo mostrado debe quedar a menos de
  3° de las áreas remuestreadas (precisión del contrato aprendido, no clínica).
- Se conserva `signal.truth.axis` y cada evento. Los controles de texto separan
  el registro invertido del eje fisiológico, no imputan ángulos nulos y mantienen
  Cabrera fuera de esta transformación.

Verificación focalizada: seis archivos y setenta pruebas correctas, más
TypeScript sin errores. En comparación emparejada contra el cambio previo de
intervalos, las tarjetas, descripción completa y diálogo/SVG sin inversión se
conservan exactamente en los 63 presets activos.

```bash
npx vitest run tests/acquired-model-axis.test.ts tests/description-model-contract.test.ts tests/description-consistency.test.ts tests/metric-cards.test.ts tests/omi-sheet.test.ts tests/acquisition-context.test.ts --maxWorkers=1
npx tsc --noEmit
```

Esta es una corrección de presentación de la transformación configurada; no
detecta inversión desconocida ni demuestra validez clínica del eje.
