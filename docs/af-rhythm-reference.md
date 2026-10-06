# FA: referencia independiente antes de calibrar

## Pregunta y contrato
¿La respuesta ventricular estocástica tiene una distribución defendible, o solo parece irregular? Se incorpora una adquisición reproducible y comparación de intervalos; no se ajusta la señal a un paciente ni se cambia un coeficiente del motor para lograr aprobación. Una prueba de software verde no demuestra equivalencia fisiológica.

## Evidencia y selección previa
[MIT-BIH AFDB 1.0.0](https://physionet.org/content/afdb/1.0.0/) distingue anotaciones de ritmo manuales y QRS automáticos de las anotaciones `qrsc` corregidas manualmente. Se seleccionan todos los registros que tienen estas últimas: 05091 y 07859, antes de calcular resultados. Los tipos de latido no están diferenciados, por lo que se mide RR, no NN. Se verifica cada archivo contra el manifiesto SHA256 de la versión y se utiliza WFDB 4.3.1, no un decodificador propio.

Atribución: Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R intervals. Computers in Cardiology 10:227–230 (1983). Fuente distribuida bajo [Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/). El repositorio no redistribuye señales ECG ni anotaciones crudas; CI archiva estadísticas y procedencia.

## Resultado inicial y límites
Las ventanas de 60 s se anclan al inicio de cada episodio AF y quedan completamente dentro de él. No se completan bordes ni se atraviesan cambios de ritmo. La duración es la del encabezado, no «10 horas» redondeadas. El registro 05091 contiene ocho episodios, ninguno alcanza una ventana completa; se informa su exclusión. El 07859 aporta 613 ventanas, que siguen siendo **un solo registro**, no 613 pacientes independientes.

En 07859 el CV RR por ventana tiene mediana 0,121 (percentiles 5–95: 0,101–0,163). A frecuencia base equiparada de 100,65 lpm, el generador histórico con semillas 1–100 tiene mediana CV 0,364 (0,318–0,398). Un 5,15% mediano de intervalos sintéticos coincide exactamente con los extremos impuestos por clipping. Esto caracteriza una deuda del modelo, no prueba que toda FA deba adoptar el CV de ese registro. El comparador no aplica un umbral clínico de aprobado/reprobado ni modifica parámetros.

[Hennig et al. 2006](https://pubmed.ncbi.nlm.nih.gov/19669444/) estudian colas exponenciales y componentes temporales correlacionados; [Scarsoglio et al. 2019](https://doi.org/10.1016/j.cmpb.2019.04.009) utilizan una distribución normal modificada exponencialmente para simulación. Son fundamento para estudiar una alternativa, no autorización para copiar una distribución universal. Antes de sustituir el algoritmo: separar desarrollo/evaluación, justificar dependencia temporal y frecuencia, y comprobar escenarios lentos y rápidos. La morfología de ondas f no se valida con anotaciones de tiempos.

## Refutación y aceptación
Siete pruebas independientes verifican límites de episodios, ventana final, intervalos ausentes, orden y estadísticas conocidas. El comparador falla si ningún registro aporta ventanas; reporta los que faltan. CI preserva hashes, versión del decodificador y commit. Reproducción: ejecutar `af-rhythm-reference.py SALIDA`, seguido de `compare-af-rhythm.mjs SALIDA/af-rhythm-reference.json SALIDA/comparison.json`.

CI detectó que el gate de pico T prohibía cualquier nueva carpeta de benchmarks. Se conserva la congelación histórica y se excluye únicamente el nuevo directorio independiente `benchmarks/af-rhythm`, verificado por su propio flujo. Una prueba ejecuta Git en un repositorio efímero y demuestra que modificar protocolos históricos o añadir cualquier otra carpeta sigue fallando. No se modifica el analizador congelado ni sus cohortes.
