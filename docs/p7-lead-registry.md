# P7 · Registro de las doce derivaciones existentes

`src/engine/lead-registry.ts` es la fuente de nombres físicos, orden estándar,
orden/signo de Cabrera, grupo de ganancia, origen independiente/derivado y filas
Dower. `types.ts` reexporta sus nombres/tipos; el catálogo y los casos JSON no cambian.
El registro no añade V4R ni V7–V9 ni convierte una corrección local en una proyección
anatómica calibrada. Las fórmulas eléctricas conservan su orden de operaciones.

## Contrato de aceptación

- Muestras, eventos, parámetros y semillas intactos. La comparación histórica
  de CI conserva exactamente los 61 presets predeterminados en doce derivaciones.
- Matriz de proyección contrastada con constantes independientes del registro;
  identidades de Einthoven/Goldberger con error absoluto <1e-9 mV, no precisión clínica.
- Cinco formatos, dos órdenes, grupo precordial con ganancia distinta. Renderizar
  no muta las muestras. Cabrera muestra −aVR; no invierte aVR almacenada.
- Los controles obtienen la lista por la reexportación de LEADS; no hay controles nuevos.

Las listas de I/II/V1/V5 del analizador y las derivaciones diana de un fenotipo
permanecen explícitas: son selecciones de análisis/morfología, no catálogos
alternativos de canales. Los oráculos de pruebas conservan listas independientes
para poder detectar errores en el propio registro. No se cambian detector ni filtros.
