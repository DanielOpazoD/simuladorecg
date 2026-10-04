# Activación regional BRD v1: un reloj temprano que no se estira

## Cambio de producto

En **Conducción > Modelo de activación**, un BRD aislado puede elegir
`BRD regional · experimental`. La plantilla histórica sigue siendo el valor
predeterminado y sigue disponible. Fijar A antes de activar el modo permite
comparar con B usando las mismas escalas del laboratorio existente. El selector,
los soportes temporales programados y las advertencias se conservan con el caso;
el JSON v1 admite `activationModel` opcional y rechaza identificadores desconocidos.
Un archivo v1 anterior elige `template`. Una selección regional convierte el caso
en personalizado: no hereda la explicación clínica de un preset distinto.

## Problema reproducible y modelo

El generador anterior fija centros/anchos gaussianos como fracción del QRS.
Por ello ampliar el QRS estira también la actividad inicial, no solo la tardía.
El modo nuevo mantiene las direcciones vectoriales del BRD y cambia el reloj:

| Base ilustrativa | Soporte programado |
|---|---|
| Septal | 0–30 ms |
| VI principal | 12–80 ms |
| VI terminal | 42–96 ms |
| VD tardío | 55 ms hasta el final del QRS |

Estos nombres son etiquetas de bases, **no localizaciones anatómicas medidas**.
Los centros tempranos se anclan a la plantilla histórica de 140 ms. La base VD
se dilata desde un inicio fijo. Su ganancia es inversa a su ancho para mantener
su integral temporal: una restricción explícita de ingeniería, **no una ley de
conservación fisiológica**. El dominio admitido es QRS programado de 100–240 ms,
no el rango diagnóstico universal del BRD. Los soportes usan un taper C1 y la
alineación frontal integra la base realmente truncada, no solo su sigma.

La T secundaria se orienta contra la región etiquetada VD tardío. No se selecciona
una región por superar el 55% del QRS: con QRS breve eso incluiría erróneamente
una base VI. No cambia la memoria de RR ni la programación QT. No añade ST
secundario, refractariedad, mecanismo de reentrada, lesión causal ni Sgarbossa.

La referencia clínica que orienta la separación entre activación inicial y tardía
es el documento AHA/ACCF/HRS sobre conducción intraventricular:
Surawicz et al., JACC 2009;53:976–981, DOI 10.1016/j.jacc.2008.12.013,
https://pubmed.ncbi.nlm.nih.gov/19281930/ . Esa referencia **no aporta ni valida
nuestros coeficientes**. No se usaron ECG de pacientes para ajustar esta versión.

## Límites y aislamiento

Solo actúa sobre latidos conducidos (`kind=normal`) de BRD completo/incompleto
isolado. Las fuentes de extrasístoles ventriculares, escape, TV y estimulación
ventricular permanecen intactas. BRI, bloqueos bifasciculares, sobrecarga,
componente posterior del QRS, ritmos sin complejos conducidos o QRS fuera de
dominio conservan la selección solicitada pero muestran **Regional no aplicado**
y utilizan la plantilla histórica. No se corrigen silenciosamente los parámetros.
Los modificadores primarios ST/T conservan sus límites previos.

## Aceptación y regresión

- `tests/regional-activation.test.mjs`: 18 casos de soporte temporal, integración
  numérica independiente, identificación regional de T, ganancia, no mutación,
  eventos, fuentes excluidas, importación, retorno histórico y límites.
- `scripts/validate-regional-activation.mjs OUTPUT`: compara contra el commit
  inmutable de PR55 `0df1527edb4a3cb5ff95bc4b88305a5b40372e20`; exige identidad
  exacta de señales/eventos/truth/warnings en 61 presets × cuatro filtros.
- `scripts/lib/regional-activation-contract.mjs`: inspecciona las muestras reales
  de salida a 500 Hz, sin usar el analizador ni el resumen de coeficientes de #54.
  Un control negativo debe reproducir el estiramiento de la plantilla histórica.
- `tests/browser-regional-activation.mjs`: aplicación compilada y worker real;
  plantilla A, regional B, QRS 190 ms, invalidación durante debounce,
  exportación/importación y reversión exacta. Escritorio 1440 y móvil 390;
  Chromium en verify, los tres motores en accessibility.

En la prueba determinista local (HR 60, filtro off, P/T/lesión desactivadas),
QRS 115/150/190/230 ms desplaza el máximo tardío V1 a 92/112/136/160 ms.
El error máximo temprano entre esas señales es 0,000054 mV; la tolerancia
preregistrada de ingeniería es 0,001 mV porque el FIR centrado puede adelantar
una contribución tardía pequeña. R' V1 positiva, S V6 negativa e integral frontal
con error <0,1° se exigen por separado. La diferencia temprana II de la plantilla
115 frente a 230 ms es 0,729 mV. **No son métricas de precisión diagnóstica**.

Verificación local: Node 22.16.0, fuentes TypeScript transpilaron sin cambiar el
motor; las mismas 18 aserciones se ejecutaron con node:test y pasó la comparación
exacta 244/244. `tsc` estricto pasó para src. La instalación limpia, Vitest, Vite
y los navegadores se verifican en GitHub Actions; no se infieren de este ensayo.
Los workflows conservan baselines, umbrales previos, datos y detector. El gate
histórico de repolarización solo admite las nuevas rutas opt-in, pero sigue
comparando todas las señales por defecto contra su predicción congelada.
