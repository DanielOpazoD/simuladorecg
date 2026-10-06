# Reutilización del análisis auxiliar durante navegación

Cambiar de latido o derivación recalculaba sugerencias de final T para todos los
latidos, aunque señal y medición aceptadas no cambiaban. La interfaz ahora conserva
ese resultado por identidad de ambos objetos con claves débiles. Un nuevo registro
o una nueva medición invalida la reutilización. Los resultados se congelan para
que la navegación no pueda modificar las sugerencias compartidas.

El contrato coincide con TraceSession y detailScale: resultados aceptados inmutables;
los cambios de presentación no alteran muestras ni mediciones. No se almacena una
copia permanente ni se modifica suggestTEnds, sus umbrales o la evaluación externa.

Verificación: resultados y HTML exactos antes/después en todos los latidos del
caso normal; claves nuevas por señal/medición y congelación de datos. Microbenchmark
local Node24.19.0, cinco bloques de300 renders tras calentamiento: mediana antes
111,0 ms y después27,8 ms (~75 % menos en ese trabajo). No mide la adquisición,
FPS reales, dispositivos móviles ni latencia clínica. El coste de reconstruir el
SVG permanece; no se afirma una mejora proporcional de toda la aplicación.
