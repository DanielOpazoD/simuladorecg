# Matriz vigente de alcance por fase

> v1.5: ocho ejemplos ventriculares usan fuentes diferenciadas; véase el [contrato actual](ventricular-source-v1.5.md). No implica validación clínica ni cambios en los ritmos disponibles.

Producto 1.4.0; la fecha o etiqueta de versión no acredita validación clínica. Esta matriz complementa `estado-presets.md` sin cambiar los parámetros ni la estrategia base del catálogo. Los coeficientes regionales y sus límites están en `src/engine/regional-repolarization.ts:6–38`.

| Familia | Aguda | Hiperaguda | Evolutiva | ST resuelto (`chronic`) |
|---|---|---|---|---|
| Inferior: predominio III / predominio II (`inferior_rca`, `inferior_lcx`) | ST vectorial y morfología basal conservada | Base vectorial + corrección T por derivación | Base vectorial + corrección T regional | Se retira la contribución de lesión; no cicatriz ni Q de necrosis |
| Anterior (`anterior`) | ST vectorial y morfología basal conservada | Base vectorial + corrección T por derivación | Base vectorial + corrección T regional | Igual límite: operación paramétrica, no reperfusión demostrada |
| Lateral (`lateral`) | ST vectorial y morfología basal conservada | Base vectorial + corrección T por derivación | Base vectorial + corrección T regional | Igual límite |
| Wellens / de Winter / posterior | Correcciones locales específicas ya existentes | No utilizan los nuevos perfiles regionales | No utilizan los nuevos perfiles regionales | No extender conclusiones de calibración temporal a estos patrones |
| BRI / BRD / sobrecargas / electrolitos / latidos ventriculares o estimulados | Modelo previo según familia | Excluidos de los nuevos perfiles regionales | Excluidos de los nuevos perfiles regionales | No valida proporcionalidad secundaria ni recuperación tisular |

## Dominio exacto de la corrección T regional

Se exige `beat.kind === "normal"`, `conduction === "normal"`, `overload === "none"`, `electrolyte === "none"` y uno de los cuatro territorios de la tabla. Dentro de ese dominio solo actúa en `hyperacute`/`evolving`, con `st > 0`, `tAmp !== 0` y dentro del soporte temporal de T. Este dominio se prueba en `tests/regional-repolarization.test.ts`. No hay diagnóstico de arteria a partir de las derivaciones.

Las correcciones se añaden en I, II y V1–V6; III/aVR/aVL/aVF se derivan después. No se presenta esta combinación como un modelo multidipolar anatómico. QRS, calendario de eventos y QT programado no cambian con la intervención regional; la anchura a media altura puede cambiar dentro del mismo soporte.

## Separar implementación, prueba y aspiración

- Implementado: cuatro perfiles heurísticos; amplitud/forma local en dos fases; adquisición invertida con explicación específica; avisos WPW/BRI/estimulación; comparación obligatoria de fuentes y muestras; escala común del caso.
- Probado: rasgos de fixtures sintéticos, regresiones de muestras y geometría de archivos exportados. LUDB es un subconjunto conocido de delimitación QRS; STAFF es exploración, no verdad adjudicada.
- Pendiente: calibración regional poblacional, revisión clínica humana independiente, propagación anatómica, repolarización secundaria de WPW, proporcionalidad calibrada de QRS ancho, derivaciones adicionales y sensado/demanda de marcapasos.

La guía clínica original contiene valores ajustables y propuestas futuras; no todos son contratos implementados. Ver `enfoque-clinico.md` y `referencias/README.md`. Una limitación del modelo no se enseña como imposibilidad fisiológica.
