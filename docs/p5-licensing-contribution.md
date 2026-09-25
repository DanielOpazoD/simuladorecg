# P5 · Derechos y contribución: estado explícito

Se implementaron aviso raíz, metadato npm, inventario de terceros y guía de
contribución. **La elección de una licencia abierta queda pendiente del titular.**
No se deduce MIT/Apache/GPL de la autorización para ejecutar P5 ni de la licencia
de otros repositorios. Este PR no concede derechos nuevos ni relicencia LUDB,
STAFF, tipografías, artículos o la revisión clínica aportada.

`tests/licensing-contract.test.mjs` comprueba la coherencia de ese estado,
la presencia de la guía y los hashes de la licencia LUDB y del documento original.
No es una auditoría jurídica automática. Al elegir licencia, reemplazar aviso,
metadatos y tests en un PR que cite la autorización explícita.

No hay cambios en src/, motor, analizador, parámetros del catálogo ni fixtures.
La aceptación conserva exactamente I, II y V1–V6 de los 61 defaults mediante el
comparador de CI y las identidades algebraicas a 1e−9 mV. No se fijan nuevos
umbrales clínicos, ni se añade una dependencia.
