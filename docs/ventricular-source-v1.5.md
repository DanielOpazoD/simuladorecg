# PR1 de auditoría profunda · Fuente ventricular separada del ritmo

## Alcance

v1.5.0 separa el origen sintético de activación de `Beat.kind`. No añade ritmos,
selectores, detector, campos anatómicos ni un mecanismo de reentrada. Los cuatro
perfiles son ejemplos de ingeniería; **ninguno está calibrado clínicamente**.

| Fuente | Ejemplo automático | Eje del perfil | Contrato de muestras (I/V1/V6) |
|---|---|---:|---|
| rv_apical_pacing | VVI/DDD y base histórica de TV polimórfica | −65° | +/−/+ |
| ventricular_escape | Idioventricular, RIVA y escape ventricular en BAV completo | +20° | +/bifásico con integral negativa/+ |
| representative_pvc | EV, bigeminismo, trigeminismo y duplas | +75° | +/−/+; eje inferior |
| representative_vt | TV monomórfica | −110° | −/+/−; eje superior |

Los signos describen la integral en la ventana de aceptación, no cada deflexión.
El nombre del perfil **no significa que todo escape, EV o TV tenga ese origen**.
La opción de caso `ventricularSource` admite `auto` (por defecto) o cualquiera de
los cuatro identificadores. Una fuente explícita puede utilizarse con distintos
ritmos; los latidos conducidos normales ignoran ese ajuste. El eje configurado
`axis` continúa aplicándose a latidos conducidos; el perfil posee el eje de los
latidos de origen ventricular. No se ofrece un nuevo control de UI.

## Cambios intencionales y compatibilidad

Cambian ocho presets predeterminados: pvc, bigeminy, trigeminy, couplet,
idioventricular, aivr, vt y complete_v. Los otros 53 conservan exactamente sus
muestras. Los calendarios auriculares, ventriculares, espigas, PR, QRS programado,
QT y memoria RR permanecen idénticos para TODOS los presets.

Schema JSON v1 admite el campo opcional; una importación sin él elige `auto`.
Eso puede cambiar las ondas de un antiguo caso ventricular al ejecutarlo con
v1.5. Para reconstruir la morfología histórica de v1.4 se especifica
`ventricularSource: "rv_apical_pacing"`. La comparación de CI exige igualdad
exacta de los 61 presets históricos con esa selección; el cambio de fuente
importado se marca como caso personalizado, sin atribuirle la explicación de un
preset diferente. Un identificador no reconocido se rechaza explícitamente.

## Coherencia y límites

Se reutiliza el modelo de repolarización secundaria ya existente, orientándolo
al marco del perfil elegido. Mantener el eje anterior de T con un QRS cambiado
habría introducido una incoherencia. NO es la mejora de proporcionalidad ST/QRS
propuesta para otro PR: se conserva su advertencia. `lesionVector()` (ST primario),
los filtros y todo el analizador permanecen sin cambios. La geometría temporal
de la T/QT tampoco cambia. La TV polimórfica conserva su aproximación histórica.

El mínimo de 150 ms es un límite de los cuatro ejemplos escogidos, NO un mínimo
universal de toda activación ventricular clínica. El escape elegido es solo una
variante paramétrica, no localización anatómica. No se añaden sensado/demanda,
captura/fusión ni refractariedad. La UI recibe un aviso explícito de fuente
ilustrativa y de repolarización secundaria no calibrada.

## Aceptación, independientes del analizador

`tests/ventricular-source.test.ts`: mismo perfil produce los mismos kernels/T al
cambiar únicamente PVC/ventricular/paced; distintas fuentes producen diferencias
>0,03 mV en I/V1/V6 a iguales parámetros. En señales a 500 Hz, HR 60, QRS 160,
P=0 y filtro off se integran I/II/V1/V6; eje dentro de 2° del objetivo, signos
indicados e intervalo de actividad de derivada a 2% entre 140 y 178 ms. Este
intervalo es una prueba de soporte de la onda con taper/antialias y meseta ST,
NO error de un delineador clínico. El criterio no usa `measure()` ni copia las
constantes de los perfiles como oráculo. La ventana usa tiempos del generador.

Además: determinismo, fuentes inmutables, inversión RA/LA, identidades de
Einthoven/Goldberger <1e−9 mV con filtros/ruido, importación y conservación de
calendarios. La comparación preserva 32 escenarios regionales; ocho snapshots
se actualizan SOLO después de aceptar esos contratos. Los hashes históricos
siguen en Git y la reconstrucción explícita de fuente comprueba igualdad exacta.

## Evidencia clínica que orienta los ejemplos, no sus coeficientes

Cronin et al. 2019 HRS/EHRA/APHRS/LAHRS consensus, sección de ECG y localización:
https://pmc.ncbi.nlm.nih.gov/articles/PMC6595359/ (DOI 10.1002/joa3.12185).
Describe variabilidad por origen/salida y patrones BRI con eje inferior, BRD y
ejes superiores/inferiores. No aporta ni valida nuestros kernels o ángulos
exactos. Es precisamente la razón para NO fijar un origen universal por ritmo.

Ejecución local de desarrollo: Node 22.16.0, dependencias restauradas del runtime
conservado. La instalación limpia y la comprobación Chromium corresponden a CI.
No se realiza despliegue privado como parte de este PR.
