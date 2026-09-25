# P1 · Fisiología basal y adquisición invertida

El preset identifica parámetros fisiológicos, no demuestra que sus hallazgos
observacionales sigan vigentes después de una transformación de adquisición.

## Contrato

Con inversión de brazos activa, `caseContext` advierte y `caseReading` reemplaza
el título y los hallazgos basales por las transformaciones implementadas:
I → −I, II ↔ III, aVR ↔ aVL; aVF y V1–V6 no cambian. No se reinterpreta el
ECG ni se infiere otra lesión. El nombre almacenado, preset, parámetros, semilla
y vista se conservan. Sin inversión, la lectura previa permanece intacta.
La UI, el nombre accesible del canvas y el título del PNG usan esa lectura.

## Aceptación

`tests/acquisition-context.test.ts`: cinco casos, incluidos inferior con filtros
apagado y diagnóstico; comparación de las doce señales antes/después de
importar (igualdad exacta) y transformaciones de electrodos con error < 1e−9 mV.
ST a J+60 usa PR local, definido en el test. El margen de 0,02 mV discrimina este
fixture; no es criterio de isquemia. La prueba protege signos y orden II/III,
texto mostrado, URL y nombre personal. Cabrera no se confunde con inversión.
`tests/browser-fidelity.mjs` comprueba la importación JSON real y el texto visible.

## Límites

No es detección automática de electrodos mal puestos ni un clasificador.
Las advertencias se ocultan durante el quiz sin respuesta como las demás pistas.
Otros artefactos y filtros no quedan certificados por esta corrección.
No cambia ninguna implementación del generador, analizador ni auditoría.
