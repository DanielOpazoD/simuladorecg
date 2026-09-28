# A11 + navegación acotada A15: comparación con fuentes externas

Base de trabajo: `3bf3a86c75b64d13d7825d981773f7ea711856ae` (PR49 integrado).

## Flujo

Abrir señal → verificar archivo/ventana → «Copiar tramo como A» o «Copiar tramo como B».
El comparador recibe una copia exacta de las doce derivaciones de la ventana de
10 s seleccionada, su control técnico, las medidas ya calculadas (o `null`), la
huella del registro completo, el intervalo absoluto de origen y el build de captura.

Navegar al comparador oculta el diálogo del lector, sin destruir su archivo ni sus
anotaciones/borrador/historia. «Abrir / volver al lector» lo recupera. Cerrar y borrar
el lector elimina su sesión, NO una copia que el usuario ya fijó en A/B. «Borrar
copias A/B», iniciar práctica o recargar descarta las copias del comparador.
No hay persistencia nueva ni subida de datos. El mismo ECG puede seguir siendo
un dato biomédico sensible; su huella no autentica al archivo ni al observador.

A queda fijada. B puede seguir el simulador o ser una copia externa fija.
Una B externa NO cambia por editar el simulador, ni por un error de su worker,
ni por abrir otro archivo; se reemplaza sólo por una transferencia explícita.
«Usar simulador en B» retoma el resultado vigente, o espera uno válido.

## Contrato de datos

La variante sintética conserva `case`, `truth` y eventos. La variante externa
nunca se convierte a `Signal` completo ni recibe estos campos. No se llama a un
analizador desde el comparador y no se importan anotaciones clínicas como entradas
de detección. Las lecturas manuales se mantienen en el lector; no sustituyen las
estimaciones ni se usan como orígenes automáticos.

Las copias conservan Float64/mV y frecuencia de origen. Se exige el MISMO Hz en A/B
en esta primera versión. Un conflicto conserva ambas copias, pero bloquea gráfico,
diferencias y exportación comparativa. No se remuestrea, interpola, normaliza por
amplitud ni aplica deformación temporal. Los 100–1000 Hz admitidos por el lector
no se convierten en un nuevo dominio de precisión analítica.

Orígenes: tiempo relativo al tramo (2 s), QRS del generador sólo entre dos fuentes
sintéticas (1,2 s), o dos índices manuales enteros dentro de cada tramo (2 s).
Origen manual significa selección del operador, NO límite clínico validado.
Fuera del tramo se informa cobertura; no se rellenan muestras ausentes con cero.

## Medidas y exportación

Las estimaciones siguen ligadas a los tramos de 10 s, no se recalculan al alinear
o ampliar el gráfico. B−A sólo se presenta con valores utilizables, ventanas relativas
equivalentes y, para dos externas, el mismo hash conocido del código del analizador.
Se retiene la resta en pares mixtos porque los procedimientos de auditoría difieren.
No se completa una ausencia con un tiempo programado. RMS/sesgo/máximo son sólo
descriptores de muestras, no scores diagnósticos ni prueba de evolución.

Dos sintéticas conservan el formato previo `ecg-lab-comparison` v1.
Cualquier par externo utiliza v2, con `sourceKind`, muestras originales, procedencia,
captura, control técnico, origen de alineación relativo y absoluto. El fingerprint
identifica el REGISTRO COMPLETO; `recordWindow` identifica el tramo que se copió.
No se lo presenta como fingerprint exclusivo del tramo. No se exportan nombres de
archivo, comentarios ni supuestas identidades de pacientes. v2 no es un caso individual
ni un sidecar manual importable. PNG tiene ejes compartidos, no papel calibrado de impresión.

## Fronteras y verificación

No se cambia el motor, el analizador, presets, filtros, A05/A10/A17, protocolos,
dependencias, licencias ni el pendiente ST #48. El bootstrap del lector pasa de
index.html a main.ts sólo para conectar callbacks tipados y navegación; no se crea
un router, un bus global ni un store adicional.

Las pruebas focales comparan las doce derivaciones, aislamiento de copias, índices,
dominios, identidad, falta de truth y retención de deltas. Los registros LUDB
1–4 son desarrollo YA EXPUESTO. No se usa un nuevo holdout.

El recorrido añadido a fidelidad prueba los tres pares, ida/vuelta al lector,
anotaciones conservadas, fallo del generador con B externa, ventanas, orígenes
manuales, cobertura incompleta, escala, 250 Hz sin análisis, recuperación, privacidad
y práctica ciega. Debe ejecutarse sobre build en 1440×1000 y 390×844.
Los resultados efectivamente ejecutados, artefactos y su inspección se registran
en el PR después de existir. Este documento no acredita CI ni revisión humana anticipada.
