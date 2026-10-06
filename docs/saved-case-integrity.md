# Casos guardados: preservar antes de escribir

Un elemento corrupto hacía que savedCases devolviera una lista vacía; guardar
podía entonces sobrescribir todos los casos previos. Al alcanzar 30, se eliminaba
silenciosamente el último. Además, la selección leía de nuevo índices de una lista
que otra pestaña podía haber reordenado después de mostrar el diálogo.

Ahora se muestran los elementos recuperables, se explica el problema y se bloquea
la escritura si la colección no puede leerse íntegramente. Una colección completa
admite actualizar un nombre existente, pero añadir otro exige exportar/gestionar
el límite, sin expulsión silenciosa. Seleccionar usa un clon de la lista mostrada.
La lectura no escribe, limpia ni elimina los bytes originales.

Pruebas discriminativas: siete fallos antes de corregir; JSON inválido, colección
parcial, exceso de capacidad, almacenamiento inaccesible y lista llena. Se prueba
además identidad de selección, aislamiento del clon y aviso escapado. No modifica
fisiología ni promete transacciones entre pestañas que guardan simultáneamente.
