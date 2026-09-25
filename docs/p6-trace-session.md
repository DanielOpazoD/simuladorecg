# P6 · Sesión del trazado, sin cambios de señal

`TraceSession` (`src/ui/trace-session.ts`) es un controlador de estado sin DOM,
worker ni cálculos electrocardiográficos. Conserva juntos señal/medición, vigencia
de petición, pausa, modo de calibres, tiempo de reproducción y latido seleccionado.
`main.ts` conserva el cableado de UI, debounce, audio, persistencia y quiz; no se
presenta esta extracción como descomposición completa de main.

## Contrato de vigencia

| Transición | Resultado |
|---|---|
| Cambio fisiológico, incluso antes de terminar el debounce | Señal y medidas retiradas; petición anterior inválida; pausa/calibres retirados; PNG no disponible. |
| Resultado cuyo ID coincide con la petición esperada | Señal y medición auditada se aceptan juntas; selección acotada; herramientas sin estado residual. |
| Resultado o error atrasado, duplicado o de petición retirada | No modifica la sesión ni restaura muestras/medidas/errores antiguos. |
| Error vigente del modelo | Sesión no disponible, sin medidas ni exportación antiguas. |
| Nueva configuración correcta tras error | Solo su resultado vigente recupera el trazado y el PNG. |
| Cambio de vista | Conserva muestras/medidas, retira pausa/calibres incompatibles; no solicita nueva fisiología. |

`SignalController` devuelve el ID existente del protocolo y lo transmite a ambos
callbacks. La cola sigue siendo una petición activa más la última pendiente.
No se modifica `src/engine/protocol.ts`, el worker ni su mensaje. `postMessage`
entrega resultados de forma asíncrona; la UI registra el ID al retornar `request`.
La invalidez durante el debounce ya no depende de consultar una variable de timer
al llegar el resultado. También se descartan errores antiguos en ese intervalo.

La auditoría de muestras sigue siendo una etapa explícita en main, posterior al
analizador e inmediatamente anterior a aceptar el resultado vigente. La sesión
no obtiene los parámetros del caso para fabricar medidas. Conserva las muestras
por referencia: no copia, filtra ni normaliza el ECG.

## Presentación

Canvas, layout, instancia Monitor y coordenadas de arrastre siguen en la capa de
representación. `resetTracePresentation()` retira esos recursos cuando deja de
ser válido su resultado. Los botones leen la sesión; la autorización del PNG no
depende del texto o visibilidad de un elemento DOM. El reloj conserva el límite
de paso de 100 ms existente en main; no pretende ser un monitor de adquisición
infinita ni corrige el buffer finito previo.

## Aceptación y alcance de las pruebas

`tests/trace-session.test.ts`: 11 pruebas, con controles negativos de identidad,
debounce, respuesta repetida, resultados y errores antiguos, cambio estando
congelado, error vigente/recuperación, calibres, selección y reloj. Una integra la
cola real con un Worker simulado. Las pruebas sin DOM ejecutadas en Node verifican
estado, no rendimiento del navegador. La señal sinusal real usada como dato se
conserva exactamente en I, II, III, aVR/aVL/aVF y V1–V6; no es validación del detector.

`tests/browser-fidelity.mjs` agrega dos recorridos de producción: mover FC estando
congelado y comprobar retirada inmediata de medidas/PNG durante debounce;
importar dupla a 250 lpm con acoplamiento 0,30, observar error real del worker y
PNG deshabilitado, luego recuperar con sinusal. No se inyectan resultados ni
mensajes falsos en el producto. Los recorridos P1/P2 y metrología siguen activos.

CI mantiene los 61 defaults con igualdad exacta de muestras y las identidades
eléctricas a <1e−9 mV; calendario y código del analizador conservados. Los márgenes
son invariantes de ingeniería, no tolerancias de exactitud clínica.

No se añade reinicio automático de un worker averiado: el mensaje de recarga
previo continúa. La recuperación probada es de errores de parámetros/modelo con
el worker operativo. No se modifican generador, analizador, presets, derivaciones,
ni se acredita despliegue privado o una nueva validación humana.

## Corrección tras revisar las capturas de producción

La primera pasada de P6 recuperaba muestras y PNG, pero el aviso temporal del
error previo aún podía durar 3,5 s. Invalidar un caso retira ahora ese aviso y
su temporizador. Un aviso nuevo cancela el temporizador anterior para que no
lo oculte anticipadamente. El recorrido de recuperación exige también ausencia
del texto del error previo; no espera su expiración ni modifica la captura.
