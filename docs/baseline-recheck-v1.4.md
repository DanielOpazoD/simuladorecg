# Reejecución inicial de v1.3

Se volvió a ejecutar la base `38c0cd3` antes de tocar el generador. GitHub Actions (Node 22 y 22.16.0) y el entorno local (Node 22.16.0) obtuvieron 292/293. Único fallo: hash binario DII de `hyperk`.

- Esperado histórico: `6981ccd64fe5c6a3baacdfa54945d9642b7c301f84dd22d937f77c3da1bfe64c`.
- Obtenido: `efb48fe66c3bc4d4f92e561264b211cb66799a248396d880423919b2d811c1a1`.
- El generador v1.3 y `tests/reference/baseline-v1.1.mjs` producen el mismo hash obtenido y las mismas muestras en las doce derivaciones (máxima diferencia 0 en el entorno comprobado).

Se actualiza exclusivamente esa expectativa, conservando esta discrepancia y la referencia compilada. No se modifica el generador para obtener el hash. No se atribuye con certeza la causa a redondeo ni a una versión del runtime: sin las muestras históricas que generaron el valor esperado no puede establecerse. Una regresión adicional compara todos los canales contra la referencia conservada.

El anterior informe de 293/293 permanece histórico; no se reutiliza como resultado de esta ejecución. Las pruebas de métricas usan señales analíticas independientes. Las mediciones sintéticas usan ventanas del generador y por tanto NO son delineación independiente.
