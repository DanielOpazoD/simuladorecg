# Contrato causal del calendario de eventos

Antes de producir muestras, el calendario debe tener eventos finitos, ordenados y dentro de su intervalo de generación. Cada RR posterior al primer latido debe ser exactamente la diferencia temporal con su predecesor; el primero conserva su condición inicial nominal. Cada activación auricular marcada como conducida debe declarar un PR positivo y tener su respuesta ventricular en ese tiempo, salvo si cae fuera del intervalo solicitado.

Este contrato detecta fallos del programa, no adjudica un ECG clínico. No impone conducción 1:1 a flutter/FA, actividad de escape, disociación AV o actividad auricular retrógrada. No define refractariedad ni permite simular fusiones que el motor excluye.

Defecto: la generación podía devolver P o espigas posteriores al final solicitado, y no existía una comprobación central de coherencia entre RR, PR y tiempos. La corrección acota eventos en su creación y verifica relaciones causales, sin ordenar, desplazar, inventar o eliminar eventos válidos para conseguir una prueba verde. Las muestras y eventos visibles anteriores al límite deben permanecer idénticos.

Refutación: cualquier cambio de muestras dentro del dominio previamente admitido o rechazo de un calendario válido. Aceptación: mutaciones deliberadas de RR/PR/orden, ventanas que terminan entre P y QRS, comparación por prefijos y matriz del catálogo. No se modifica ninguna fórmula fisiológica ni se afirma validación clínica.

Comprobación local contra main b4194c8: los 66 presets, 3.960.000 muestras y todos los eventos visibles permanecieron exactamente iguales. Suite completa: 1.470 pruebas aprobadas y build correcto. CI y validación externa son comprobaciones separadas.
