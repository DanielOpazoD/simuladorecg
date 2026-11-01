# Continuidad de lectura y poda del resultado manual

Esta iteración aplica el manifiesto al trabajo ya iniciado por el lector. No modifica el generador, el analizador ni los valores de los intervalos.

## Criterios fijados antes de cambiar

- Mostrar un hallazgo, alternar la cuadrícula y reseleccionar el mismo caso o vista conserva el calibre. Las acciones de lectura no solicitan otra señal.
- Un cambio real de muestras o de geometría retira la medición anterior. Un caso importado no se considera idéntico por compartir solamente el identificador.
- El papel ampliado mantiene tamaño y desplazamiento durante la espera. La publicación recupera la referencia de la derivación, considerando que la altura de las filas puede variar. Las respuestas retiradas no recuperan estados antiguos.
- Ocultar y mostrar conserva los píxeles, las medidas y la posición. La lupa y la comparación devuelven foco y contexto. La exportación PNG permanece idéntica.
- La poda del resultado manual no debe tapar ondas ni retirar la calibración o el acceso a los campos y al borrado.

## Cambio aceptado

Se separa ocultar de borrar. La selección repetida compara el caso completo; cambiar cuadrícula no invalida coordenadas. La hoja de espera usa el mismo zoom que el papel. El anclaje de lectura mantiene una derivación y un punto respecto de su línea de base; el navegador limita el desplazamiento a los bordes disponibles.

El resultado manual pasa antes de los campos, con derivación, Δt, ΔV y milímetros. Se eliminan las coordenadas duplicadas y la conversión indiscriminada del intervalo a frecuencia. Los valores almacenados siguen siendo numéricos; solo la presentación usa coma decimal. En 390 × 844, la fila completa, incluido «Limpiar», ocupa 44 px.

Al ocultar los campos cerca del final de una pantalla baja se conserva únicamente el espacio necesario para que la barra siga siendo alcanzable. Esa reserva se retira al mostrar de nuevo o regenerar el trazado.

## Verificaciones reproducibles

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run tests/paper-anchor.test.ts tests/trace-session.test.ts tests/workspace-navigation.test.ts tests/caliper-input.test.ts --maxWorkers=2
node tests/browser-reading-continuity.mjs <directorio-de-evidencia>
node tests/browser-reading-return.mjs <directorio-de-evidencia>
node tests/browser-compact-navigation.mjs <directorio-de-evidencia>
node tests/browser-reading-pixels.mjs <directorio-de-evidencia>
```

Los recorridos cubren 1440 × 900, 390 × 844 y 844 × 390. El recorrido de continuidad usa una medida de 322 ms, cuadrícula ida/vuelta, hallazgos, reselección, dos recálculos antes de respuesta, cambios de escala y muestras, y un caso importado modificado con el mismo identificador. Las pruebas del anclaje incluyen una fila que crece y el rechazo de una derivación/ventana ausente.

El recorrido de regreso compara muestras y píxeles exactos y verifica exportaciones PNG antes/después. El contraste visual independiente comprueba las muestras contra la imagen de la lupa en sinusal, BRI y anterior; sus controles alteran tiempo, voltaje y polaridad y deben fallar. La suite de navegación incluye modo oscuro, texto ampliado y pantalla estrecha.

Resultado final: TypeScript y build correctos; 63 pruebas unitarias, 6 recorridos de continuidad, 9 recorridos de regreso y 48 escenarios de navegación superados. En el contraste de imagen, las 3 imágenes originales se aceptan y las 9 alteraciones deliberadas se rechazan como corresponde. Los recorridos finales quedan en `continuity-accepted` y `return-accepted`.

## Resultados adversos conservados

- La primera prueba de recálculos consecutivos falló: enviaba el segundo evento a un selector que ya había sido desmontado. Se corrigió el instrumento buscando el control actual en cada cambio. Se conservaron los informes fallidos.
- La poda inicial provocó un fallo real en 844 × 390: al ocultar campos, la barra quedaba parcialmente fuera del contenedor y el siguiente clic desplazaba la página 15 px. Se corrigió conservando el espacio mínimo de acceso y se añadió una aserción de visibilidad inmediata, además de la comprobación de ida/vuelta.
- Un tooltip como único acceso a los milímetros no era suficiente para táctil. La versión final conserva los milímetros visibles y elimina la conversión secundaria a frecuencia.

Los informes, capturas, versiones fallidas y revisiones externas están en `../ECG-QA/continuity-20261031/` y `../ECG-QA/fable-review-20261031/`, fuera del repositorio. No contienen la credencial de API.

## Revisión externa y límites

Claude Fable 5.1 colaboró en dos revisiones del código y capturas. Sus observaciones se contrastaron localmente: por ejemplo, el supuesto calibre visible después de ocultarlo queda contradicho por las condiciones del renderer y los controles de píxeles. Sus recomendaciones no se aceptan automáticamente.

Coste estimado por tokens y tarifas consultadas: US$1,20131 en esta iteración, US$5,80123 acumulados con la revisión anterior; por debajo del máximo autorizado de US$100. La facturación definitiva corresponde al proveedor.

Estas pruebas se ejecutaron en Chromium automatizado, no en dispositivos físicos ni con VoiceOver/TalkBack. La medición principal sigue debajo del papel: en móvil, consultar el resultado de una derivación superior puede requerir desplazarse. La estabilidad ante rotar el dispositivo durante un recálculo no se afirma verificada. El build conserva el aviso previo de bundles mayores de 500 kB. Nada de esta revisión eleva las afirmaciones de plausibilidad clínica.
