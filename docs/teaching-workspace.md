# Aula ECG: criterios fijados antes de implementar

Base: main `105d4f2` (2026-10-26). Objetivo: observar, anotar, comparar y relacionar el ECG final con una representación anatómica y mecánica docente. La señal y el analizador no se modifican.

## Entregas iterativas

1. Selección de un mismo latido en las doce derivaciones, ventanas QRS/ST/repolarización y anotaciones personales en segundos/mV. Referencias del modelo diferenciadas de medidas de muestras.
2. Comparación a escala común con el basal contrafactual existente o estados guardados, cursor común, superposición y diferencia únicamente cuando los registros son compatibles. Sin inventar tiempo clínico entre estados.
3. Eco y anatomía ilustrativos: vistas estándar, movimiento regional, selección vinculada, pausa/cámara lenta. Sin inferir eco a partir del ST ni ofrecer FEVI clínica.
4. Marcar antes de revelar; devolución descriptiva sin certificación de competencia. Exportación PNG anotada calibrada y sesión de anotaciones vinculada al registro exacto.

## Jueces y umbrales previos

- Cero modificaciones de muestras, eventos o parámetros por uso de ayudas, anotaciones, reproducción o exportación; hashes externos antes/después.
- Tiempo y voltaje anclados a muestras, error máximo temporal 0,5 muestra por cuantización y error numérico de medida 1e-9 mV en fixtures analíticos independientes. No sustitución silenciosa de ventanas inválidas.
- Selección del mismo índice de evento entre derivaciones. No cuadros de ST medible cuando PR/J no están disponibles, son no finitos o se solapan con el latido vecino.
- Comparación: frecuencia, longitud y calendario de eventos comprobados antes de permitir sustracción. Estados con distinto calendario pueden visualizarse a escala común, nunca presentarse como delta causal.
- Notas personales: límites finitos, texto escapado, rechazo de sesiones ajenas, máximo 50 notas. Anotaciones fuera de la lámina exportable producen explicación, no pérdida silenciosa.
- PNG: verificación geométrica independiente de grilla, tiempos, voltaje y cajas, con controles negativos de desplazamiento/escala. Conservar exportación limpia existente.
- Eco: 16 segmentos de motilidad; no puntuación del casquete apical. Sin FEVI/WMSI numéricos, sin ruido ecográfico decorativo. El cambio de ST no prescribe motilidad. Contextos no cubiertos explícitos. Movimiento reducido, pausa y destrucción de animación comprobados.
- No filtración de respuestas en la práctica existente. En el ejercicio de Aula, revelar es una acción explícita y no modifica lo marcado por el usuario.
- Navegador: escritorio, 390 y 320 px, tema claro/oscuro, texto al 200%, teclado, cierre/reapertura, sin errores de consola. El papel puede desplazarse horizontalmente; controles y explicaciones no.
- Suite existente, TypeScript y build sin regresiones. Resultados adversos se preservan fuera del repositorio en `ECG-QA/teaching-iterations-20261026`.

## Profundidad y perspectivas

Material original: muestras finales y eventos del worker, geometría del papel, referencia pública inspeccionada y recomendaciones ASE/EACVI. Métodos: pruebas analíticas, control negativo, navegador real y medición de imagen independiente. Revisión técnica separada de implementación; revisión clínica humana independiente aún no disponible.

Prompt operativo: «Implementa iterativamente las ayudas autorizadas para que cada marca tenga una procedencia y cada interacción conserve la señal. Usa métodos independientes para comprobar mediciones, geometría y contratos causales. Acepta únicamente funciones que pasen esos controles; conserva fallos y no eleves plausibilidad clínica sin revisión humana independiente».

La implementación visual es original. La referencia es inspiración funcional, no fuente de código ni de activos reutilizados. El eco es un esquema docente y no un simulador de formación de imagen ultrasónica.
