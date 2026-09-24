> Documento histórico de v1.1. Para los resultados actuales, consulta [verificacion.md](verificacion.md).

# Verificación de ECG Lab 1.1

24 de septiembre de 2026. Señal sintética; no se utilizaron registros de pacientes. Estas pruebas establecen propiedades del software y referencias internas, no validez clínica.

## Resultado y alcance

127 pruebas automatizadas en cuatro archivos, comprobación de TypeScript/producción y revisión interactiva en navegador de escritorio. El catálogo continúa con 61 presets activos y cinco pendientes.

| Área | Comprobación |
|---|---|
| Electricidad y tiempo | Identidades de miembros, RA/LA, ejes, calendario AV, ectopia, determinismo y prefijo de duración |
| Delineación independiente | Formas lineales por tramos sin generador; PR/QRS/QT conocidos, T bifásica, U, muesca, inversión, offsets, ruido y disociación |
| Muestreo | Mismos límites a 250/500/1000 Hz; FIR centrado y supresión a 260 Hz |
| Fisiología | Memoria QT, intervalo prematuro, QT aislado a 40–72/min y QT largo de 744 ms; ST en J; P pequeña y bifásica en V1 |
| Auditoría | No reemplaza medidas por valores del modelo; retira conteos o límites discordantes y propaga su invalidez |
| Interfaz/arquitectura | Transiciones puras de controles, papel simultáneo/secuencial y coalescencia de peticiones del worker |
| Regresión | 61 snapshots de señal; se actualizaron tras modificar morfología/filtros y comprobar los criterios anteriores |

Comandos reproducibles:

```bash
npm ci
npm test
npm run build
node scripts/fidelity-report.mjs
```

## Comparación con la versión anterior

Base: commit `1317742fe340e9748575bc7cc2c5e22032580f44`. Se compiló esa fuente por separado y se ejecutaron ambos motores con idéntico caso, semilla, duración y filtro. El informe completo es [fidelity-before-after.json](fidelity-before-after.json).

### Señales analíticas independientes, 500 Hz

Estos casos NO utilizan las ondas, eventos ni referencias del generador.

| Caso / variable | Valor conocido | v1.0 | v1.1 |
|---|---:|---:|---:|
| QRS lineal | 90 ms | 72 ms | **94 ms** |
| PR | 160 ms | 166 ms | **158 ms** |
| QT con T positiva | 400 ms | 388 ms | **400 ms** |
| QT con T bifásica | 480 ms | 310 ms | **480 ms** |
| QT con U separada | 400 ms | 388 ms | **400 ms** |
| Ruido continuo sin complejos | Sin FC estimable | 141,8 lpm | **No estimable** |

La cobertura se exige junto a la exactitud: al menos siete latidos interiores y error QRS ≤12 ms en los fixtures limpios. También se comprueban inicio/final QRS dentro de 10 ms, QT dentro de 18 ms y estabilidad entre frecuencias de muestreo. Una respuesta siempre nula no supera estos tests.

### QT sobre el propio modelo

Señal limpia, variabilidad cero, diagnóstico y diez segundos. La referencia es el soporte matemático de T; no un final anotado por un clínico.

| FC / QTc configurado | QT referencia | QT v1.0 | QT v1.1 | Error v1.1 |
|---|---:|---:|---:|---:|
| 40/min / 410 ms | 469,3 ms | 444 ms | **472 ms** | +2,7 ms |
| 60/min / 410 ms | 410,0 ms | 386 ms | **406 ms** | −4,0 ms |
| 72/min / 410 ms | 385,8 ms | 364 ms | **378 ms** | −7,8 ms |
| 40/min / 650 ms | 744,1 ms | No estimable | **736 ms** | −8,1 ms |

El PR de estos casos se mide en 154 ms frente a 160 ms, y el QRS en 94 ms frente a 90 ms. Persisten sesgos pequeños. La memoria QT modifica la respuesta a RR variable; no debe confundirse con la corrección retrospectiva QTc usando RR mediano.

### Punto J

Inferior, II, diagnóstico, sin ruido, referido al PR local del mismo latido:

| Instante | v1.0 | v1.1 |
|---|---:|---:|
| J | −0,019 mV | **+0,168 mV** |
| J+60 ms | +0,167 mV | **+0,167 mV** |

El cambio corrige la transición inicial y conserva el plateau. La prueba automatizada exige elevación en J y diferencia diagnóstico/off <15 µV en J+60 para este caso. No extrapola ese límite a todas las combinaciones.

## Cobertura y medidas retiradas

El barrido de diez segundos de los 61 presets deja disponibles 54 FC, 36 PR, 45 QRS y 31 QT. La ausencia de PR/QT es esperada en varios ritmos; otras ausencias corresponden a fallos conocidos del detector. Los números son cobertura de esta semilla/ventana, no tasas de precisión ni porcentajes de casos clínicamente validados.

[fidelity-report.json](fidelity-report.json) conserva, por preset, referencia, medidas originales, medidas presentadas, valores retirados y motivos. Ejemplos:

- Hiperpotasemia y escape ventricular lento: el detector puede contar T/P como QRS. Se retira la frecuencia discordante y los intervalos dependientes.
- WPW, AAI y VVI: pueden confundirse delta/espiga y límites de QRS. Se retiran los intervalos cuando la discrepancia supera la tolerancia interna.
- Flutter y FA: la actividad auricular o la superposición puede impedir límites fiables aunque la FC siga siendo estimable.

Esta auditoría usa la referencia conocida del simulador únicamente para rechazar resultados; el medidor de muestras continúa siendo independiente. No es una técnica validada para ECG de pacientes.

## Revisión interactiva

Comprobaciones realizadas sobre la interfaz real de escritorio:

- Carga sin error de aplicación, catálogo sinusal/BRD y actualización de medidas.
- Navegación entre latidos y cambio de derivación II→V1 en la ampliación.
- Selector simultáneo/secuencial y conservación de las escalas.
- Diálogo con medidas y referencia en la misma ventana, dispersión y tabla de límites.
- Monitor y estado «CONGELADO», con reanudación disponible.
- Calibres por arrastre: se observó Δt 828 ms, ΔV 0,14 mV y frecuencia equivalente 72/min.
- Práctica: ampliación oculta y exportación desactivada antes de responder.
- Exportación PNG: archivo real descargado de 3425×1819 px; metadatos 299,9994 dpi. La notificación automática de descarga del navegador expiró, pero el archivo sincronizado y el aviso de exportación confirmaron su generación.

La revisión del código también corrigió la coherencia tras un error de generación: una configuración nueva invalida el trazado, los calibres y las medidas anteriores hasta recibir su señal. El PNG y el diálogo de medidas exigen datos vigentes. No se inyectó un fallo del worker en la sesión de navegador.

Las capturas en `browser-captures/` son del navegador real. Las imágenes en `trazados/` son renderizados directos de Canvas. El smoke opcional `tests/browser-smoke.mjs` no fue ejecutado en esta sesión.

## Pendiente antes de afirmar alta fidelidad clínica

Revisión de trazados por lectores independientes; corpus con anotaciones de consenso y diversidad de pacientes; validación de morfologías, voltajes y finales de onda; mejor separación de QRS, T y espigas; fisiología AV/refractariedad; y verificación en móviles, lector de pantalla, audio y hardware representativo. No se demostró 60 fps sostenido. El monitor sigue reproduciendo un buffer finito.
