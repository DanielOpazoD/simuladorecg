# Eje global en ritmos ventriculares polimórficos

Base: PR41 integrado, `e7609daad6a01c05097e5a540f3b4b581aa1f876`.

## Problema

Torsades aplica una rotación temporal al vector QRS durante la síntesis. Sin embargo,
`truth.axis` heredaba el eje fijo de la fuente ventricular ilustrativa
(`rv_apical_pacing`, -65°). Esa cifra describe la plantilla previa a la rotación,
no un eje global estable de la señal final.

## Cambio

Para `rhythm === "torsades"`, la referencia sintética de eje pasa a `null`.
La señal no cambia. La auditoría del simulador retira un eje global calculado por el
analizador cuando la propia referencia declara que no existe un eje global estable.

No se introducen umbrales nuevos, clasificadores, estados ni dependencias. VT, VVI,
escape ventricular y ritmos con eje estable conservan su referencia actual.

## Alcance

Esto no afirma que cada complejo de torsades carezca de eje instantáneo. Al contrario:
la limitación es resumir una secuencia polimórfica mediante **un único número global**.
El analizador de muestras sigue siendo independiente y conserva sus candidatos; la
retirada ocurre después, en la auditoría específica del simulador.

La prueba exige que torsades no publique referencia global, que la auditoría retire
el candidato global conservándolo en `rejected.axis`, y que ejemplos ventriculares
monomórficos mantengan su eje.
