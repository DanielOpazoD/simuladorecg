# Verificación de ECG Lab 1.3

24 de septiembre de 2026. Esta entrega fortalece el comportamiento de las funciones existentes: coherencia del caso importado, configuración del ejemplo BRI con lesión, controles ST/T, frontera explícita de prematuridad y estado visual de pausa/calibres. Añade una base inicial de aceptación de fenotipos. Conserva 61 presets activos y cinco pendientes.

El [informe de v1.2](verificacion-v1.2.md) se preserva íntegro. Sus resultados externos y capturas no se atribuyen a una nueva ejecución de v1.3. Estas comprobaciones son de ingeniería; no establecen validez clínica del simulador ni rendimiento diagnóstico en pacientes.

## 1. Suite y reproducción

La suite contiene **293 pruebas en 11 archivos**. Los cuatro archivos añadidos cubren contratos del caso, amplitud, prematuridad y fenotipos. Permanecen las pruebas de motor, fidelidad, delineación independiente, discriminación, auditoría, cola del worker y regresión externa conocida.

**Resultado confirmado:** `npm run check` aprobó **293/293 pruebas en 11 archivos**, TypeScript sin errores y compilación de producción de Vite correcta. Tras los últimos ajustes de interfaz se repitieron TypeScript y la compilación; los cambios no afectan el motor probado.

```bash
npm ci
npm run check
node scripts/validate-detection.mjs --output docs/detection-regression-v1.3.json
```

`check` ejecuta `npm test` y después `npm run build`; este último incluye `tsc --noEmit` y Vite. El barrido de detección se ejecuta aparte y admite una ruta `--output` para conservar informes históricos. No requiere descargar ECG externos: los fixtures versionados incluyen procedencia y licencia.

Para revisar únicamente los nuevos contratos:

```bash
npx vitest run tests/case-contract.test.ts tests/amplitude-contract.test.ts tests/prematurity-contract.test.ts tests/phenotype-acceptance.test.ts
```

## 2. Contratos corregidos y evidencia

| Cambio | Comportamiento exigido | Evidencia y límite |
|---|---|---|
| Identidad del caso importado | Un preset declarado cuya fisiología no coincide pasa a `custom`; se depura su nombre automático sin modificar señal, semilla o vista ya normalizadas. No se infiere un preset por semejanza. | `case-contract.test.ts`; comparación de parámetros y muestras. No acredita un diagnóstico del caso personalizado. |
| BRI con lesión concordante | El selector aplica BRI, QRS 160 ms, eje −15° y Q septal ausente. La importación incompatible conserva sus parámetros y advierte. | Pruebas de transición/contexto del caso. Es configuración de un ejemplo docente; no implementación de criterios diagnósticos de Sgarbossa. |
| Amplitud y lesión ST/T | `tAmp = 0` anula toda T vectorial/local; la intensidad escala Wellens/de Winter respecto de 2 y «ST resuelto» desactiva aportes ST/T de lesión. | `amplitude-contract.test.ts`, sobre vectores y muestras, con respuesta proporcional y ventanas aisladas. U, ST secundario y QRS son independientes; no se exige una repolarización completa plana. |
| Representabilidad de eventos | Un solapamiento de soportes QRS, o una extrasístole programada cuyo QRS preceda al soporte T previo, produce un error explícito. | 11 pruebas en `prematurity-contract.test.ts`, incluidos límites, casos rechazados y admisión de los 61 presets por defecto en ventanas de 69,1 s. No se desplazan ni eliminan eventos. |
| Herramientas y electricidad | Una función sincroniza texto, iconos, atributos y disponibilidad de pausa/calibres. Las identidades eléctricas se comprueban por error absoluto y la vista no cambia ninguna de las ocho derivaciones independientes. | Pruebas eléctricas y de muestras; revisión real de herramientas en la sección 6. Las pruebas numéricas no sustituyen la observación del navegador. |

La comprobación de prematuridad ocurre después de asignar repolarización y antes de generar muestras. El cálculo del soporte T se comparte con la síntesis. Es una **política conservadora del motor aditivo**, no una estimación del período refractario efectivo, riesgo arrítmico o imposibilidad clínica. Aceptar un latido posterior al inicio de T tampoco demuestra que su interacción con la repolarización sea fisiológicamente fiel. No se excluye toda ectopia anterior al final QT ni se tratan P o espigas independientes como QRS.

El motor y la interfaz conservan el rechazo visible: sin nueva señal válida no se ofrecen medidas ni exportación del ECG anterior bajo parámetros nuevos. El [modelo](modelo.md) describe los mecanismos; el [enfoque clínico](enfoque-clinico.md) fija las inferencias que esta evidencia permite y las que permanecen abiertas.

## 3. Aceptación inicial de fenotipos y hashes

`phenotype-acceptance.test.ts` contiene **85 pruebas**:

- **61 comunes**, una por preset activo, para comprobar muestras finitas, longitudes y equivalencia de I/II/V1–V6 al cambiar únicamente la vista.
- **24 específicas**, doce presets con filtro apagado y diagnóstico: sinusal, BRD, BRI, WPW, ESV, inferior, Wellens A/B, de Winter y estimulación AAI/VVI/DDD.

Las específicas verifican rasgos observables como polaridad, orden de deflexiones, progresión R, discordancia, reciprocidad, formas ST/T y espigas visibles. Usan eventos del generador para situar ventanas, pero extraen los valores de las muestras y no llaman al analizador ni a sus resultados de auditoría. Por ello son contratos del generador, **no delineación independiente ni validación clínica de 61 fenotipos**. Umbrales, ventanas, casos cubiertos y límites pendientes se detallan en [aceptacion-fenotipos.md](aceptacion-fenotipos.md).

Las pruebas de Einthoven ahora exigen `abs(III − (II − I)) < 1e−9`; la comparación anterior sin valor absoluto podía admitir errores negativos. La tolerancia es de consistencia algebraica interna, no de exactitud instrumental.

**60 de los 61 hashes de señal por defecto permanecen intactos.** La única excepción es bajo voltaje: al escalar toda T, su componente Z pasa de −0,07 a −0,0375 con `tAmp = 0,15`. La diferencia máxima observada en V2 es aproximadamente **0,0405434 mV**. En las extremidades es menor de **1e−15 mV**, por redondeo; aun así cambia el hash histórico de DII. No se afirma un cambio de QRS. Ambos hashes, la comparación con el generador de referencia y el fundamento de actualizar esa única expectativa están publicados en el documento de aceptación.

## 4. Barrido de 313 configuraciones

[detection-regression-v1.3.json](detection-regression-v1.3.json) conserva las 61 configuraciones por defecto y 252 variantes de frecuencia, semilla y acoplamiento. El resultado distingue **283 configuraciones comparadas** y **30 fuera del alcance del motor**. Las 61 por defecto se admiten.

| Grupo de variantes afectado | Configuraciones | Comparadas | Fuera de alcance |
|---|---:|---:|---:|
| ESV | 60 | 51 | 9 |
| Bigeminismo | 60 | 48 | 12 |
| Duplas | 60 | 51 | 9 |
| Resto, incluidos los 61 defaults | 133 | 133 | 0 |
| **Total** | **313** | **283** | **30** |

Las 30 exclusiones corresponden a `premature-before-t`. Se conserva cada configuración y motivo en el informe. No son omisiones del detector, aciertos ni escenarios eliminados del denominador original. Otros errores inesperados interrumpen el script en lugar de convertirse en exclusiones.

Para las 283 admitidas, el analizador actual y el compilado de v1.1 reciben exactamente las mismas muestras de v1.3. La referencia es el commit `ad5a53261a7ac170297b32e7709ec158c2ed45c4`, preservado en `tests/reference/baseline-v1.1.mjs`. Se evalúan eventos interiores entre 0,3 y 9,7 s mediante asociación única dentro del soporte QRS ampliado 30 ms. Este margen sirve para asociar complejos, no para aceptar precisión de sus límites.

**Ninguna configuración comparada aumenta falsos positivos u omisiones frente a esa referencia.** Esto no significa ausencia de errores: persisten **12 omisiones en las variantes de duplas**; las variantes rápidas de TV e hiperpotasemia aún acumulan falsos positivos. El analizador no recibe una nueva calibración en esta entrega. El cambio de alcance impide presentar el resultado como una comparación de 313 detecciones satisfactorias o una nueva mejoría respecto de v1.2.

## 5. Evidencia externa e histórica

No se volvió a ejecutar el benchmark completo de los ocho registros LUDB en esta iteración. `external.test.mjs`, que comprueba los cuatro registros de desarrollo conocidos, permanece en la suite automatizada. Esa regresión se distingue de una nueva evaluación externa reservada.

Los registros 1–4 fueron utilizados para desarrollo; 101–104 fueron control tras la congelación de v1.2 y **ya están expuestos**. Los ocho constituyen un banco de regresión conocido, sin nueva reserva independiente. La señal, anotaciones, calibración, hashes y licencia se conservan en [tests/reference/ludb/README.md](../tests/reference/ludb/README.md).

Los informes `analysis-validation-all.json`, `analysis-paired-comparison.json`, `fidelity-report.json`, `detection-regression.json`, `analysis-freeze.json` y `analysis-post-freeze-review.json` mantienen sus resultados y contexto de **v1.2**. En aquel control el MAE de duración QRS pasó de 19,9 a 21,6 ms, con mayor cobertura: no demostró mejora universal de precisión. El [informe histórico íntegro](verificacion-v1.2.md) incluye denominadores, comparación de los mismos latidos y fallos. No se atribuyen esas cifras a v1.3.

La protección de espigas conserva el fallo conocido a 250 Hz; las comprobaciones nativas a 500 Hz no lo resuelven. LUDB no aporta validación externa de QT/T–U en este protocolo, y ocho registros no establecen fidelidad poblacional de las morfologías sintéticas.

## 6. Revisión real de navegador

Se ejecutaron recorridos reales de escritorio sobre la vista previa local de v1.3:

- Monitor → Congelar → Bradicardia: botón «Congelar», rótulo «REPRODUCCIÓN» y frecuencia de 45 lpm.
- Papel → Calibres → Monitor → Papel: `aria-pressed` termina en `false` y el calibre queda desactivado.
- Desde sinusal, seleccionar «BRI con lesión concordante»: conducción BRI y QRS de 160 ms.
- Wellens A: intensidad 0 y 8 visibles; T nula desactiva el control de intensidad y reactivarla lo habilita; «ST resuelto» lo desactiva. El nombre accesible del indicador conserva su etiqueta y el texto muestra el valor actual.
- Dupla, 250 lpm y acoplamiento 0,30: aviso por superposición QRS, trazado retirado, medidas no disponibles y herramientas desactivadas. PNG deshabilitado; JSON/importación conservan acceso. Restablecer recupera el caso sinusal.
- Importación real de JSON que conserva `presetId=sinus` y nombre sinusal, pero cambia `rhythm=vf`: título personalizado, ausencia de hallazgos sinusales y selector en fibrilación ventricular. La generación de FV se conserva.

Las capturas de esta entrega se guardan en `docs/browser-captures/v1.3-*.jpg`. Estos recorridos no constituyen una evaluación de dispositivo móvil real, accesibilidad asistida, audio, rendimiento ni todos los controles.

`tests/browser-smoke.mjs` **no se ejecutó como script independiente**. Las capturas de v1.1/v1.2 mantienen sus fechas y alcance. `docs/trazados/` contiene renderizados directos del Canvas del producto, no capturas de navegador ni una lectura clínica adjudicada.

La aceptación de esta entrega mantiene tres niveles separados: contrato de señal del generador, rendimiento del analizador y presentación real. Quedan pendientes lectura clínica independiente, diversidad de referencia, calibración regional y evolución temporal más fiel. Las aspiraciones futuras del [enfoque clínico](enfoque-clinico.md) no se presentan como funciones implementadas.
