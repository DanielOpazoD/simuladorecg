# Comparación con el basal sintético del mismo caso

«ECG previo» es un contrafactual generado, no un registro previo adquirido de un
paciente real. Retira la lesión aguda conservando los parámetros, la semilla y la
familia de síntesis del caso original. La fase crónica no admite este contraste:
puede seleccionar otra población de infarto antiguo.

## Corrección

`lesionBaseline` conserva la configuración basal. El worker utiliza
`synthesizeLesionBaseline` para generar sus muestras con la misma familia que el
caso original. Antes, una lesión sobre núcleos podía pasar a NORM o CLBBB aprendido
al retirar `ischemia`, sustituyendo la morfología que pretendía conservar.
En Sgarbossa, el error de comparación alcanzaba 1,5565 mV en el QRS temprano;
en lateral, 0,7969 mV (adquisición ideal, filtro apagado, ventana 20–60 ms).

La selección también se aplica al calendario de FA: los núcleos conservan el CV
representativo y la ruta aprendida usa el CV del paciente. Mantener solo la forma
de onda dejaba cambiar RR y QT en la comparación de FA con lesión sobre núcleos.
El valor por defecto de `generateEvents` sigue utilizando la ruta de su caso.

La misma duración, filtro, adquisición y semilla conservan el mismo ruido en
ambos miembros del contraste. Esto no resuelve la dependencia histórica del ruido
respecto a la duración total solicitada: es una cuestión separada de adquisición.

## Qué puede cambiar

No se afirma que una lesión real conserve todo QRS. El delta aprendido de STAFF
III puede contener cambios QRS–ST–T. El patrón posterior paramétrico incluye una
corrección R explícita en V1–V3. Ambas intervenciones forman parte del modelo; no
deben eliminarse para cumplir una invariancia ficticia. Las pruebas de QRS temprano
comparan únicamente ventanas y derivaciones ajenas a la intervención declarada.

`differenceSignal` exige igual frecuencia de muestreo, duración y derivaciones.
Una señal ausente o truncada produce un error, en lugar de rellenarse con ceros.
La sustracción no identifica por sí misma isquemia ni valida una etiología.

## Verificación

`tests/causal-comparison.test.ts` protege la familia, el calendario AF y la
salida real del worker, además de rechazar entradas incompatibles. Incluye
Sgarbossa, lateral, posterior, de Winter, anterior e inferior, controles sin
lesión y fase crónica. `tests/omi-lenses.test.ts` conserva las lentes existentes.

El hash revisado de `worker.ts` cambia exclusivamente por el uso del helper y por
la eliminación de una descarga basal innecesaria. La llamada a `analyzeSamples`
y la política de calidad de adquisición permanecen idénticas. Los archivos del
analizador congelado y sus huellas no cambian.

Este contrato es de coherencia del generador. La validación clínica independiente
y la interpretación de cada fenotipo siguen pendientes.
