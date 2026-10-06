# A15 + A16 — teclado, móvil y compatibilidad de los flujos existentes

Base: `12518c53818867667da7ffe6bb8226ff473f7e29` (PR50). No cambia motor,
lectores, muestras, filtros, medidas, límites A05, revisiones A10 ni copias A11.

## Cambios de interacción

- Accesos por teclado a simulador, parámetros y A/B, visibles al recibir foco.
- Pestañas: un punto de entrada con Tab; flechas izquierda/derecha y Home/End
  activan las vistas/paneles existentes. No interceptar esas teclas en formularios.
- Catálogo móvil: fuera de pantalla también significa fuera del teclado/árbol
  accesible (`inert`, `aria-hidden`). Abierto tiene nombre, rol de diálogo,
  fondo inerte, foco contenido y cierre por Escape o botón. Seleccionar un caso
  devuelve el foco al título; cerrar sin seleccionar lo devuelve a Casos.
- Formularios que los renderizadores existentes reemplazan conservan foco por
  ID/clave estable. Se restaura sólo cuando el nodo enfocado desapareció y el
  navegador dejó foco en body; no se sobreescribe una navegación deliberada.
- Diálogo de modelo/exportación/medidas nombrado por su título. Se mantiene la
  contención de foco nativa de los diálogos. Tablas anchas con región enfocables
  y encabezados de columna; no se inventan descripciones diagnósticas del canvas.
- Botones principales de 44 px, campos móviles de 16 px, controles con ajuste
  de línea y métricas de lectura en dos columnas. Gráficos/tablas pueden conservar
  desplazamiento horizontal porque requieren esa geometría. No comprimir la
  regla física ni alterar escalas/muestras para conseguir que el contenido quepa.
- Foco visible, movimiento reducido y borde de alto contraste sin cambiar el
  sistema de coordenadas de los calibres. La pregunta docente impide abrir el
  catálogo oculto y no recupera las copias descartadas.

`src/bootstrap.ts` inicia el mismo main y después instala la capa DOM. El único
estado nuevo es de foco y presentación del catálogo; no hay un segundo store ni
router. El observer de contenido no observa los atributos que él mismo escribe;
la apertura del catálogo se observa aparte. No hay dependencias de producción.

## Prueba en tres motores, sobre exactamente el mismo build

El job `accessibility` depende de `verify` y descarga su artefacto. NO reconstruye
la app ni repite LUDB/PTB-XL/ruido en cada navegador. Mantiene los gates anteriores.
Playwright aislado ejecuta el mismo recorrido corto en Chromium, WebKit y Firefox,
a 1440 y 390 px; añade reflow a 320 y 720 CSS px con el lector y A/B poblados.
Se cotejan identidad de build, doce canales, medidas no modificadas por anotación,
intervalos por muestra, teclado/puntero, navegación con anotaciones, CSV/PNG/JSON,
limpieza al cerrar y ausencia de tráfico de datos a terceros en ese recorrido.

Comando después de instalar las dependencias de desarrollo y Playwright:

```
npm ci
npm test
npm run build
npm install --no-save --package-lock=false --legacy-peer-deps playwright@1.63.0
npx playwright install --with-deps chromium webkit firefox
# Servir dist en http://127.0.0.1:5173/ (vite preview)
ECG_TEST_URL=http://127.0.0.1:5173/ node tests/browser-accessibility.mjs
```

El flag `--legacy-peer-deps` evita el fallo de resolución de npm con el peer
opcional de Vitest 4, sin cambiar `package.json` ni `package-lock.json`.
En macOS basta `npx playwright install chromium webkit firefox`; `--with-deps`
instala además los paquetes de sistema necesarios en Linux.

Las evidencias y versiones de cada motor se escriben en `accessibility-results.json`
y se archivan por SHA. Cualquier fallo real detiene el job; no `continue-on-error`.
No exigir PNG binariamente idénticos ENTRE motores: sí verificar muestras/unidades.
El resultado efectivo está en el artefacto, no se presupone por existir el script.

## Referencias y límites de la afirmación

Criterios usados como guía: WCAG 2.2 1.4.10 (reflow), 2.1.1 (teclado),
2.4.3/2.4.7/2.4.11 (orden/foco visible/no oculto), 2.5.7 (alternativa al arrastre),
2.5.8 (tamaño mínimo), 4.1.2 (nombre/rol/valor). El objetivo propio de botones de
44 px es más conservador que el mínimo AA de 24 px; no confundir criterios.

- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://playwright.dev/docs/browsers
- https://playwright.dev/docs/emulation

WebKit de Playwright en Linux NO es Safari físico. Firefox de Playwright usa su
build instrumentado. Un viewport o toque emulado no es un dispositivo real.
320/720 CSS px examinan reflow: no se presentan como zoom nativo 200/400%.
No hay certificación WCAG global, auditoría de lector de pantalla ni evaluación
clínica en este PR. Las referencias no convierten pruebas DOM en revisión humana.

## Comprobación humana pendiente (no marcar realizada por CI)

Registrar build, modelo de iPhone, versión iOS/Safari, fecha y persona revisora.
Probar abrir archivos con Files, descarga/recuperación de anotaciones, teclado
externo, VoiceOver (diálogo/campos/tablas), rotación, pellizco/zoom al 200%, zoom
nativo de escritorio 200/400%, barras dinámicas, área segura y gesto de calibre.
Recorrer lector → A/B → lector sin perder anotaciones; cerrar y reabrir sin ellas.
Comprobar foco no cubierto por teclado virtual y que no se diagnostiquen trazados
mediante nombres accesibles automáticos. Registrar errores antes de afirmar soporte.
