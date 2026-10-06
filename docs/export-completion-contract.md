# Exportación: finalización y errores observables

El manejador asíncrono de PNG retornaba antes de terminar toBlob. Un resultado
nulo no daba explicación y una excepción al escribir DPI podía quedar como
rechazo no controlado. La exportación ahora espera codificación y metadatos,
conservando el clon de papel y las muestras originales.

Solo se anuncia éxito después de preparar y entregar el archivo al mecanismo de
descarga. Fallos de dibujo, codificación nula o metadatos producen aviso y permiten
reintentar/exportar JSON. No se afirma persistencia en una ubicación del disco.

Pruebas con callback retenido, codificación nula y fallos explícitos, además de
los contratos previos de escala300 dpi, ocultamiento docente e inmutabilidad.
No cambia el formato PNG ni los valores fisiológicos.
