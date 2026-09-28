# Repolarización secundaria: alcance vigente tras A02/A03

## Lo que representa el programa

La onda T secundaria conserva la dirección reducida derivada del QRS: vector
integrado en BRI/activación ventricular y componente terminal en BRD/BRD incompleto.
`tVector(c, beat, kernels)` es ahora el único vector T usado por el sintetizador;
el resultado de sus modificadores no vuelve a sustituirse después.

**El ST secundario NO está representado en esta versión.** La frase anterior
«permanece con el comportamiento histórico» era incorrecta: el bloque pre-PR43
fue retirado. No se debe interpretar la ausencia de esa contribución como
normalidad fisiológica, ni usar esta aplicación para criterios ST/QRS/Sgarbossa.
El ST de lesión primaria sigue existiendo como mecanismo distinto e intacto.
La limitación aparece también en los controles de ST/T, no sólo en este documento.

## Composición acotada de la onda T

| Condición | Regla de software |
|---|---|
| Conducción sin capa secundaria | Se conserva el camino previo de `tVector`. |
| BRI, BRD/BRD incompleto o fuente ventricular | Elegir dirección secundaria; aplicar después amplitud T y el modificador permitido. |
| Hipokalemia | Aplicar el factor educativo existente 0,4 a la T, sin tocar la U separada. |
| Hiperkalemia | Aplicar el factor existente 2,6; conservar la forma picuda y soporte temporal ya existentes. |
| Fase hiperaguda / evolutiva con lesión | Aplicar el factor existente dependiente de intensidad, cuando no coexista alteración de potasio. Intensidad cero no altera T. |
| Potasio alterado + fase isquémica activa + T secundaria | Rechazo explícito: esa composición no está representada. No ignorar un control ni sumar dos T completas. |
| Sobrecarga en activación secundaria | Modifica el QRS y, a través de él, la dirección secundaria; no se suma otra T de sobrecarga. |
| Eje T con activación secundaria | La dirección depende del QRS, no del control Eje T; se informa en la interfaz. |
| `tAmp = 0` | Elimina la contribución T; no elimina el ST primario ni la U. |

Los factores numéricos son aproximaciones docentes heredadas: **no son leyes
clínicas universales, no corresponden a concentraciones de potasio y no fueron
calibrados con nuevos pacientes**. Una fase evolutiva puede invertir o anular el
vector en este modelo; ello no valida la apariencia clínica de cada combinación.

Torsades conserva exactamente el ejemplo previamente integrado, incluida su
limitación rotatoria: no se afirma que su T provenga del vector QRS finalmente
rotado. WPW no adquiere repolarización secundaria nueva. No cambia el analizador,
QT automático, filtros, ruido, calendario de eventos ni derivaciones QRS.

## ST: candidato evaluado y NO promovido

Se probó localmente una contribución ST opuesta al QRS integrado, separada de la T
y de lesión primaria. El ensayo de ruido mostró más falsos positivos y más QRS
erróneos considerados utilizables. Se descartó antes de publicar el PR: no se
sustituyeron las fuentes congeladas ni el gate histórico para hacerlo pasar.
La recuperación numérica del ST secundario sigue pendiente de un perfil defendible,
revisión clínica humana y una evaluación que no reproduzca esa regresión.
Véase [registro de la decisión](repolarization-coherence.md).

## Fundamento y límite de la inferencia

La declaración AHA/ACCF/HRS distingue alteraciones primarias de repolarización de
las secundarias a cambios de activación; pueden coexistir. Describe discordancia
habitual respecto del QRS medio en BRI y de su componente terminal lento en BRD.
Ese fundamento respalda separar mecanismos, **no valida nuestras fórmulas ni
justifica una suma o un factor arbitrario**.

Rautaharju PM, Surawicz B, Gettes LS. JACC 2009;53:982–991.
[Texto primario](https://www.jacc.org/doi/10.1016/j.jacc.2008.12.014).
DOI: 10.1016/j.jacc.2008.12.014. Copublicado en Circulation,
DOI: 10.1161/CIRCULATIONAHA.108.191096.

No hay adjudicación clínica humana completada ni validación diagnóstica nueva.
