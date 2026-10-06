# Mediciones y filtros de demostración

La repetibilidad de un detector no demuestra que identifique los complejos correctos después de un filtrado que transforma la señal. En pruebas exploratorias, el filtrado de espigas aisladas produjo QRS aparentes; el filtro de 2 Hz también duplicó una FC estimada de un ejemplo ventricular. Esas observaciones no justifican cambiar umbrales para el caso específico.

Se añade una política separada al resultado del trabajador de síntesis: con Diagnóstico o Sin filtro se conserva exactamente el resultado; con Monitor todas las métricas previamente disponibles requieren revisión; con Paso alto de 2 Hz (demostración) se consideran no disponibles para presentación automática. Se conservan los candidatos y números internos como resultados del detector, pero no se promueven ni se presentan como medidas utilizables. Las vistas deben respetar la evidencia, incluso si retienen números internos.

La política solo recibe el modo de adquisición conocido y la medición: no recibe diagnóstico, eventos, captura ni verdad del generador. No cambia el delineador congelado, muestras, filtros, candidatos ni umbrales; tampoco infiere filtros de archivos externos donde no hay esa información. No convierte Diagnóstico en validación clínica.

Predicción: cambiar a un filtro de demostración nunca aumenta confianza. Los cálculos internos pueden diferir porque cambia la señal, pero la interfaz retira las medidas fuera de dominio. Regresar a Diagnóstico recalcula normalmente, sin reutilizar cifras retiradas.

Aceptación: prueba funcional del worker real con filtros, inmutabilidad, métricas ya ausentes, conservación exacta off/diagnostic, presentación de métricas y cambio/retorno en navegador. Es una frontera conservadora de uso educativo; el problema de reconocer estímulos filtrados desde muestras sigue abierto. La pérdida de captura en VVI no debe habilitarse solo por añadir esta advertencia.
