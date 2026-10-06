# Referencia tabular de amplitud QRS, separada de la escala de medianas

## Defecto y aprendizaje
El conflicto de escala de los median beats 12SL impide comparar sus amplitudes con el generador. No debe repararse dividiendo por 1000 a partir de una coincidencia estadística. Sin embargo, las tablas armonizadas ya adquiridas tienen unidades documentadas y constituyen otra fuente descriptiva aprovechable.

## Mecanismo y dominio
Se añade al informe un resumen QRS pico-pico por derivación y grupo NORM/MI/STTC desde la tabla 12SL. Solo se presentan mV si el mapeo revisado identifica esa columna como mV, declara conversión identidad y contiene el SHA256 de la descripción de variables. No se cambia el protocolo de adquisición congelado. La cohorte incluye todos los IDs seleccionados del grupo, incluso sin mediana decodificada: no se selecciona por disponibilidad del trazado.

Fuente primaria: [PTB-XL+ 1.0.1, ECG Features](https://physionet.org/content/ptb-xl-plus/1.0.1/), que documenta amplitudes armonizadas en mV. El documento también describe las medianas; la discrepancia observada con sus encabezados sigue sin resolución. No se presenta la tabla como certificación de las unidades del archivo de ondas.

## Predicción e invariantes
El resumen tabular permanece disponible con la escala de las medianas en conflicto; el bloqueo de amplitudes de esas ondas permanece intacto. QRS cero se conserva como valor; negativos, ausencias y no finitos se cuentan como no disponibles. Los cuartiles son descriptivos de una cohorte seleccionada, no intervalos de normalidad ni objetivos de ajuste. No cambian muestras, parámetros, umbrales, adquisición ni pacientes seleccionados.

## Refutación y aceptación
Pruebas funcionales: unidades ausentes/incorrectas, conversión no identidad, procedencia ausente, datos inválidos, ausencia de medianas y grupos sin miembros. Todas fallaron antes de implementar la función. El CLI incorpora el cuarto archivo a la huella de entradas. El trabajo CI PTB-XL+ genera el informe desde su adquisición verificada; se requiere inspeccionar ese artefacto antes de dar por verificada la ejecución con datos externos. Revisión clínica independiente pendiente.
