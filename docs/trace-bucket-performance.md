# Reducción del coste de dibujar las mismas muestras

Se conserva exactamente la secuencia de índices del reductor de PR80: primer
punto, extremos en orden temporal y último punto, sin duplicados. Se elimina
Set/arrays/sort por cada bloque de píxeles. No cambia la señal, interpolación,
ventana, escala, muestreo ni precisión. La salida se compara con la versión
congelada en 324 combinaciones de longitud, mesetas, extremos y ventanas.

Medición local orientativa, Node 24.19.0: 7 rondas alternando orden tras calentar,
2000 llamadas/ronda, 5000 muestras a 500 Hz y 80 píxeles/s. Medianas:
338.54 ms antes; 44.89 ms después (86.7% menos tiempo del reductor).
No mide FPS de navegador, tiempo total de render ni rendimiento de un dispositivo
físico. No se impone un umbral de tiempo frágil en CI: CI exige equivalencia.
