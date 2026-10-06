# Inicio de la memoria de RR

El primer evento no tiene un predecesor observado. El motor ya declara una
condición inicial de régimen mediante `nominalVentricularRR`; ahora la conserva
para ese evento y aplica la adaptación exponencial sólo desde el segundo.

Antes, en BAV 2:1/alto grado/Mobitz, se inicializaba la memoria con el RR
ventricular nominal pero acto seguido se actualizaba con un intervalo auricular
ficticio del primer evento. Esto introducía una transición de QT sin intervención.
No se cambian la constante de adaptación, QTc, límites numéricos, tiempos de
activación, amplitudes, filtros ni el calendario auricular/ventricular.

No representa restitución celular individual ni añade validación clínica.
Mobitz conserva su variación real de intervalos desde el segundo evento.

## Evidencia y regresión

- Tres contraejemplos fallaron antes: estacionariedad 2:1, alto grado y
  independencia del predecesor no observado, con adaptación posterior intacta
- La predicción de referencia se construye en fuente histórica, sin importar
  la implementación candidata: primer estado = RR ventricular nominal; resto
  de la adaptación original intacto
- La comparación de 244 escenarios y 54 combinaciones sigue exigiendo muestras
  exactas respecto de esa predicción; presets fuera de BAV conservan además la
  comparación histórica sin cambios
- Las referencias de amplitud aplican exactamente la misma revisión de inicio
  antes de comparar sus cambios de morfología. No se amplían tolerancias
- Se revisan únicamente las huellas `wenckebach`, `av21`, `highav`; no se
  regenera el catálogo entero ni se exime a estos casos de regresión

El gate regional PR55 también compara con la predicción de inicio declarada.
Su comparación exacta usa el helper existente de fallo compacto: evita generar
un diff gigante de 60.000 muestras al detectar una regresión, sin cambiar igualdad
ni tolerancias. Se reprodujo el rechazo original en `wenckebach/off` antes de
incorporar la revisión del reloj a esa referencia.
