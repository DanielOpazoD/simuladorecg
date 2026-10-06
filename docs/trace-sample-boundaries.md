# El trazado conserva las muestras terminales y sus extremos

El índice superior combinaba length−1 con un bucle exclusivo: la última muestra
adquirida nunca se dibujaba. Un pico terminal podía desaparecer. La reducción
por píxel tampoco conservaba necesariamente los extremos temporales del bloque.

Se extrae una función pequeña para seleccionar índices reales, con ventana
semiabierta [inicio, final), primero/último y mínimo/máximo por bloque en orden.
No se interpola ni se modifica el ECG. El papel usa la misma razón de píxeles
para dimensionar el canvas y reducir muestras, incluso en pantallas >2×.

Tres pruebas sobre el renderizador real fallaban ante un pico en la última
muestra; pasan con la corrección a 1×/2×/3×. Casos analíticos cubren extremos,
orden, ventanas fraccionarias, registro agotado y resolución suficiente. Las
muestras clínicas no se validan por esta metrología de representación.
