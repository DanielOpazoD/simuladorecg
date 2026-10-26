# Identidad verificable de las fuentes

## Criterios fijados antes de corregir

Base: `fbad93d362e80d99d1a86ef1b20e42da76a6f184`.
El `dist/build-info.json` generado en Windows declara como identidad del motor
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
el SHA-256 de una entrada vacía. `path.relative` devuelve separadores Windows y
el filtro `startsWith('src/engine/')` no selecciona ningún archivo.

Antes de cambiar el cálculo se establecen estos criterios de ingeniería:

1. Los mismos nombres relativos y bytes producen las mismas huellas con rutas
   Windows o POSIX y con distinto orden de enumeración.
2. Cambiar un byte de una fuente del motor cambia ambas huellas; cambiar una
   fuente de interfaz cambia solo la huella general.
3. La ausencia de fuentes del motor es un error de build, nunca una identidad
   vacía aparentemente válida.
4. La compilación real incluye todas las fuentes del motor. Se contrasta la
   huella publicada con un cálculo independiente sobre esos archivos.
5. El cálculo no modifica el generador ni el analizador. Las huellas anteriores
   se conservan como evidencia histórica y no se reinterpretan como correctas.

Las rutas se ordenan tras convertir sus separadores a `/`. Los bytes conservan
sus finales de línea originales: dos checkouts con bytes diferentes deben tener
identidades diferentes. La huella del motor incluye todos sus archivos y no
afirma ser una identidad exclusiva del algoritmo de medida. La identidad general
incluye también el propio helper de build. Esto identifica fuentes, no certifica
plausibilidad clínica ni autenticidad de evaluadores.

## Resultado de la corrección

La compilación en Windows pasó tipos y build. Un recorrido independiente de las
66 fuentes de `src/engine` reprodujo la huella publicada:
`3efd23084e86b011b0ecc1f5711db865e8e447f637afc9be6fd60c2d2b7b660c`.
Las tres pruebas de `tests/build-source-identity.test.ts` cubren las dos
convenciones de rutas, cambios de bytes y entradas incompletas. No cambió ningún
archivo del motor ni del analizador para conseguir ese resultado.
