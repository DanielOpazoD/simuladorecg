# Densidad física del PNG

El exportador conserva IHDR, IDAT y demás bloques originales e inserta un único
pHYs, antes de IDAT, con densidad X/Y idéntica y unidad metro. A 300 dpi son
11811 píxeles/m, con el redondeo entero requerido por el formato. Repetir la
operación no duplica el bloque ni vuelve a comprimir la imagen.

El entero PNG de cuatro bytes está limitado a 2^31−1 (no al máximo uint32).

Se rechazan densidades no finitas/no positivas/no representables, firma parcial,
cabecera ausente/duplicada, bloques truncados, imagen sin IDAT/IEND y basura tras
IEND. No es un decodificador completo ni un verificador de todos los CRC/DEFLATE.
El origen previsto es canvas.toBlob. El error llega al aviso de exportación.

La densidad embebida no obliga a un visor/impresora a respetar el tamaño: imprimir
al 100% y verificar el pulso de calibración. No supone calibración clínica.

Referencia: W3C PNG Third Edition, firma, orden de bloques y pHYs:
https://www.w3.org/TR/png-3/#11pHYs
