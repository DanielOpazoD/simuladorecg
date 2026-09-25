# STAFF III — selección prospectiva del banco pequeño

Fuente: STAFF III 1.0.0, hoja Blad1, metadatos oficiales; licencia ODC Attribution 1.0. Martínez et al., Computing in Cardiology 2017, doi:10.22489/CinC.2017.266-133. Página: https://physionet.org/content/staffiii/1.0.0/ .

Se seleccionan por orden numérico los primeros tres pacientes elegibles por arteria, exclusivamente a partir de metadatos y antes de examinar las señales. Primeros dos: desarrollo; tercero: reserva sin descargar. Requisitos: sin IAM previo, BC1 disponible, primera inflación >=120 s, sin inversión de electrodos marcada, sin registros de inflación ambiguos y sin inyección anotada entre +40 y +80 s. Se excluyen IDs 1,4,5,6,89 por advertencia de electrodos en la hoja; archivos 7c,11c,39d,53c,64b,39c,29c,31c,77c,27c por anotaciones complementarias o inciertas descritas por la fuente.

Desarrollo: LAD 9/14; RCA 10/12; LCX 3/30. Reserva: LAD 24; RCA 19; LCX 37. No se consulta la señal de reserva. Ventanas predefinidas: BC1 en segundos 20–30 y primera inflación D0+50 a D0+60. El script verifica SHA-256 del .dat completo contra SHA256SUMS antes de guardar extractos calibrados. Todo fallo de descarga/verificación aborta, no elimina silenciosamente pacientes.

Límites: 6 pacientes, angioplastia electiva, derivaciones de miembros Mason–Likar; inyecciones no siempre anotadas. No es un banco representativo de SCA, no valida oclusión, y LCX no equivale a un patrón lateral puro. La comparación morfológica requiere comprobar límites y calidad, manteniendo todos los pacientes y las abstenciones. Adquirir el banco no equivale a calibrar ni validar el generador. No se añaden ECG reales al producto.
