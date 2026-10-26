# Matriz vigente de alcance por fase

> v1.5: ocho ejemplos ventriculares usan fuentes diferenciadas; véase el [contrato actual](ventricular-source-v1.5.md). No implica validación clínica ni cambios en los ritmos disponibles.

Producto 1.5.0; la fecha o etiqueta de versión no acredita validación clínica. La [matriz generada de los 63 presets activos](estado-presets.md) identifica la configuración predeterminada; esta tabla aclara las fases y combinaciones. La procedencia del caso actual se consulta con `modelProvenance(c)` y se apoya en `realisticModelFor(c)`, la misma selección del motor. La estrategia histórica del catálogo no determina si el caso usa núcleos o una población aprendida.

| Familia | Aguda | Hiperaguda | Evolutiva | ST resuelto (`chronic`) |
|---|---|---|---|---|
| Inferior: predominio III / predominio II (`inferior_rca`, `inferior_lcx`) | Base NORM + cambio ventricular emparejado STAFF III (RCA/LCx), si la selección efectiva admite el modelo aprendido; núcleos en las demás combinaciones | La misma base + estado hiperagudo aprendido de STAFF III; no se añade la corrección T regional de los núcleos | Núcleos + corrección T regional dentro de su dominio reducido | Infarto inferior antiguo aprendido de pacientes reales (PTB-XL, IMI), si la combinación lo admite; en núcleos se retira la lesión sin Q |
| Anterior (`anterior`) | Base NORM + cambio ventricular emparejado STAFF III (LAD), si la selección efectiva admite el modelo aprendido; núcleos en las demás combinaciones | La misma base + estado hiperagudo aprendido de STAFF III; no se añade la corrección T regional de los núcleos | Núcleos + corrección T regional dentro de su dominio reducido | Infarto anteroseptal antiguo aprendido (PTB-XL, ASMI), si la combinación lo admite; en núcleos, ST resuelto sin Q ni reperfusión demostrada |
| Lateral (`lateral`) | ST vectorial y morfología basal conservada | Base vectorial + corrección T por derivación | Base vectorial + corrección T regional | ST resuelto por operación paramétrica, sin cicatriz ni ondas Q aprendidas; no demuestra reperfusión |
| Wellens / de Winter / posterior | Correcciones locales específicas ya existentes | No utilizan los nuevos perfiles regionales | No utilizan los nuevos perfiles regionales | No extender conclusiones de calibración temporal a estos patrones |
| BRI / BRD / sobrecargas / electrolitos / latidos ventriculares o estimulados | Población aprendida o núcleos según la combinación efectiva; no se extiende STAFF III a QRS ancho o sobrecarga | Excluidos de los perfiles T regionales de los núcleos | Excluidos de los perfiles T regionales de los núcleos | No valida proporcionalidad secundaria ni recuperación tisular |

STAFF III aporta un cambio de las fases ventriculares (QRS, ST, T y post-T), no solo un desplazamiento aislado del ST. Procede de oclusiones provocadas con balón; «aguda» e «hiperaguda» no son un reloj del infarto espontáneo. En el código, `learnedIschemiaArtery` identifica territorio/fase y `realisticModelFor` decide si la combinación puede utilizarlo. Una etiqueta de lesión por sí sola no demuestra esa procedencia.

## Dominio exacto de la corrección T regional

En la rama de núcleos se exige `beat.kind === "normal"`, `conduction === "normal"`, `overload === "none"`, `electrolyte === "none"` y uno de los cuatro territorios de la tabla. Dentro de ese dominio solo actúa en `hyperacute`/`evolving`, con `st > 0`, `tAmp !== 0` y dentro del soporte temporal de T. Los latidos conducidos de la rama aprendida se sintetizan antes y no recorren esa corrección. Este dominio se prueba en `tests/regional-repolarization.test.ts`. No hay diagnóstico de arteria a partir de las derivaciones.

Las correcciones se añaden en I, II y V1–V6; III/aVR/aVL/aVF se derivan después. No se presenta esta combinación como un modelo multidipolar anatómico. QRS, calendario de eventos y QT programado no cambian con la intervención regional; la anchura a media altura puede cambiar dentro del mismo soporte.

## Separar implementación, prueba y aspiración

- Implementado: ST secundario aproximado acoplado a QRS en BRI/BRD/fuentes ventriculares regulares y a QRS más delta en WPW; cuatro perfiles heurísticos; amplitud/forma local en dos fases; adquisición invertida con explicación específica; avisos WPW/BRI/estimulación; comparación obligatoria de fuentes y muestras; escala común del caso.
- Probado: rasgos de fixtures sintéticos, regresiones de muestras, correspondencia de la procedencia efectiva y geometría de archivos exportados. LUDB es un subconjunto conocido de delimitación QRS. STAFF III aporta coeficientes aprendidos y evaluaciones exploratorias publicadas en `fidelidad.md`; no es una revisión clínica independiente del simulador.
- Pendiente: calibración regional poblacional, revisión clínica humana independiente, propagación anatómica, calibración cuantitativa del ST secundario y proporcionalidad de QRS ancho, derivaciones adicionales y sensado/demanda de AAI/DDD. VVI dispone de demanda idealizada y una variante sin captura total sin escape; no valida dispositivos, fusión ni fallos intermitentes.

La guía clínica original contiene valores ajustables y propuestas futuras; no todos son contratos implementados. Ver `enfoque-clinico.md` y `referencias/README.md`. Una limitación del modelo no se enseña como imposibilidad fisiológica.
