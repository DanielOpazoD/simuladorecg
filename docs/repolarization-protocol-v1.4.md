# Protocolo v1.4 — repolarización regional verificable

Base fijada: `38c0cd31b5836c96c82556d756e8150cfde99c64` (v1.3). Esta rama prepara verificación; no declara una nueva versión desplegada ni una mejoría clínica demostrada.

## Alcance aprobado

Conservar 61 presets, UI y controles existentes. Separar tres cambios revisables: (1) protocolo, referencia y medidas de muestras, (2) T regional inferior/anterior/lateral, (3) metrología de ampliación y PNG. No modificar el detector, la conducción, los patrones especiales ni introducir datos reales en el producto.

## Contratos antes del ajuste

- Preservar muestras basales, P, QRS, eventos, QT programado, artefactos y filtros cuando no sean el objetivo del cambio.
- Intensidad cero y fase ST resuelto recuperan repolarización basal; amplitud T cero elimina toda T pero no exige eliminar ST, U o ruido.
- Las modificaciones hiperagudas/evolutivas dependen del territorio. Un aumento global idéntico no satisface este contrato.
- Verificar magnitud, polaridad, área, anchura a media altura y asimetría T; ST en J y J+60 respecto de una referencia basal declarada. Marcar ventanas superpuestas o insuficientes, no rellenarlas con ceros.
- Derivar III/aVR/aVL/aVF desde I/II, no corregirlas independientemente. Perfil regional explícito no equivale a modelo multidipolar ni propagación celular.
- Comparar versiones a igual caso, semilla, muestreo y ventana. Medir las muestras sin llamar al detector. Evaluar al detector por separado con código congelado.
- Mantener escala vertical de detalle común al navegar por latidos/derivaciones del mismo caso. La geometría de render nunca modifica las muestras.
- Medir calibración desde los píxeles del PNG terminado, con ganancias/velocidades declaradas, además de probar las coordenadas internas.

## Evidencia y límites

La revisión aportada por el usuario inspira territorialidad y morfología; sus parámetros marcados (*) son ajustables, no constantes biológicas. Se mantiene `docs/enfoque-clinico.md` como marco de inferencia prudente. No se adoptan cifras de fidelidad, equivalencia arteria-territorio infalible ni cronologías obligatorias.

Fuentes para calibración externa: STAFF III 1.0.0 (https://physionet.org/content/staffiii/1.0.0/), PTB-XL+ 1.0.1 (https://physionet.org/content/ptb-xl-plus/1.0.1/), HATW (https://pubmed.ncbi.nlm.nih.gov/40892623/). STAFF III: angioplastia electiva, Mason–Likar en extremidades; no equivale a SCA espontáneo. PTB-XL+ contiene rasgos/fiduciales algorítmicos, no consenso humano universal.

Para cualquier banco nuevo, definir selección por paciente antes de ajustar, congelar una reserva, conservar procedencia/licencia/hashes y publicar exclusiones. Si no se obtiene el banco o no se ejecuta la comparación, se informa como pendiente: una revisión bibliográfica no cuenta como validación externa.

## Trazabilidad

El workflow conserva SHA, salida de tests y fuente exacta como artefactos. Pruebas aprobadas, compilación, revisión visual y validación externa son estados separados. Abrir PR no equivale a integrar ni desplegar. Cada resultado debe enlazar una ejecución real; nunca reutilizar la cifra 293 de v1.3 como una nueva ejecución.
