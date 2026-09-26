# Recuperación acotada del motor web

## Contrato

`SignalController` mantiene una petición activa y la más reciente pendiente.
El ID y la copia de parámetros/semilla/duración quedan fijos para el reintento.
Un fallo de infraestructura (`error`, `messageerror`, constructor, envío o ausencia
de respuesta) termina el worker anterior y permite UN reintento de esa petición.
Si existe un caso pendiente más reciente, se procesa ese caso, no estados
intermedios del control. Respuestas, errores y temporizadores del worker retirado
no pueden publicar datos, quitar la ocupación del nuevo worker ni agotar su cupo.

El watchdog es de 30 s por intento, configurable al construir el controlador.
Es un límite de ejecución, no fisiológico ni una promesa de rendimiento. Los
navegadores pueden demorar timers en segundo plano. El segundo fallo informa
error y no genera más workers automáticamente. Una nueva acción del usuario
puede iniciar otra petición. `dispose()` cancela timers, handlers y worker.

Los errores de dominio que el worker devuelve como `{id,error}` NO se reintentan.
No se corrigen parámetros para conseguir un resultado. Un fallo en reposo tampoco
invalida muestras que ya fueron recibidas. No hay backend, red ni fallback al hilo
principal; la señal y sus medidas se entregan sin modificación.

La construcción y `postMessage` pueden lanzar antes de que la UI registre el ID.
En ese caso el error terminal se entrega en una microtarea y se vuelve a comprobar
su vigencia: evita dejar la sesión cargando indefinidamente o retirar otro caso.

## Aceptación

`worker-recovery.test.ts`: 16 casos cubren fallo, cola, respuestas antiguas,
reintento único, timeout, agotamiento, nueva acción, errores de dominio, errores
de deserialización/construcción/envío, disposal e invariancia exacta de una señal
real de 12 derivaciones. Nueve de los primeros doce fallaban en la base.

`browser-worker-recovery.mjs` usa `dist` y fuerza fallos de envío; después de
recuperar, el cálculo procede del worker REAL compilado, no de una respuesta
simulada. Comprueba carga, medidas, PNG deshabilitado tras agotar el reintento,
recuperación por nueva acción, consola y viewport móvil emulado. El watchdog y
los callbacks `error/messageerror` se verifican con tiempo/fallos controlados en
las pruebas unitarias, no como fallos físicos observados en un teléfono.

## Referencia técnica

WHATWG HTML, Workers: https://html.spec.whatwg.org/multipage/workers.html .
MDN, Using Web Workers: https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Using_web_workers .
`terminate()` cancela el worker; no permite que publique una respuesta final.
No cambia generador, filtros, delineador ni calibración clínica.
