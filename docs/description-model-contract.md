# Una sola política de intervalos para tarjetas y descripción

La descripción podía informar QTc donde la tarjeta indicaba «No aplica»: VVI
377 ms, DDD 388 ms y TV 519 ms en los ejemplos originales. Leía el QT propio de
los complejos ventriculares y lo convertía en QTc aunque el contrato de las
tarjetas exige latidos normales con duración generada. En Wenckebach ocurría lo
contrario: la tarjeta mostraba PR 160–280 ms y la descripción «PR no medible».

`src/ui/model-intervals.ts` reúne el contrato existente de las tarjetas; ambas
presentaciones usan esa política. Conserva la mediana superior y el orden de
las operaciones, separa los latidos conducidos de los ectópicos y reconoce PR
variable o progresivo. La descripción y la presentación de 30 segundos retiran
el QTc sin soporte y muestran el rango PR disponible. No es una medición desde
muestras, no cambia el detector ni se usa para validación clínica.

El valor empleado sigue siendo el QT realizado, incluso si el generador aplicó
un límite numérico. La prueba con FC 60, QRS 240 ms y QTc solicitado 260 ms
comprueba QT 360 ms, el aviso de `qtModelLimits` sobre el mínimo de 120 ms tras
el QRS y QTc mostrado 360 ms; no sustituye el resultado por la petición.

La descripción también atribuía todo ST alterado con QRS ancho a causas
secundarias, incluido el ejemplo de BRI con lesión primaria concordante. La
nota ahora explica que el ancho por sí solo no adjudica la causa. Se conservan
los valores y las derivaciones del ST; no se añade un clasificador de isquemia.

## Juez y verificación

- `tests/description-model-contract.test.ts`: 13 casos; QTc no aplicable en
  VVI/DDD/TV/idioventricular/RIVA/escape ventricular, PR progresivo en Wenckebach
  y variable en ESA, límite numérico QT, registro sin eventos, controles BRI
  aislado/BRI con lesión y control negativo con QRS estrecho. Diez de los doce
  casos iniciales fallaban antes del cambio; la ESA se añadió después.
- Las pruebas usan metadatos de eventos como verdad explícita del modelo,
  adquisición ideal, filtro apagado, 10 s y salida a 500 Hz. Los controles de
  preservación comparan las doce derivaciones y los eventos antes/después de
  generar la descripción; ninguna fuente del motor cambia.
- Comparación emparejada de las tarjetas antiguas y nuevas sobre los mismos
  objetos `Signal`: igualdad exacta en los 63 presets activos. Se conservan las
  huellas y los informes históricos.
- Pruebas focalizadas: descripción, tarjetas, hoja OMI y límites QT; TypeScript
  sin errores. La verificación de navegador corresponde al producto compilado
  de la rama integrada y se registra con ese artefacto.

```bash
npx vitest run tests/description-model-contract.test.ts tests/description-consistency.test.ts tests/metric-cards.test.ts tests/omi-sheet.test.ts tests/qt-model-limits.test.ts --maxWorkers=1
npx tsc --noEmit
```
