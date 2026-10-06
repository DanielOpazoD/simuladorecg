# VVI a demanda: controlador y captura explícitos

## Contrato previo
El generador histórico etiqueta VVI pero siempre emite espigas y captura periódica. Se conserva como ejemplo de captura fija y se añade un modo optativo de demanda, con actividad ventricular intrínseca, sensado ideal, inhibición y captura garantizada en el producto. La pérdida de captura se investigó y no se incorpora por el fallo de medición descrito al final.

El intervalo inferior se calcula como 60/frecuencia programada en segundos. Un evento ventricular intrínseco detectado reinicia ese intervalo e inhibe el estímulo que habría ocurrido antes del siguiente vencimiento. Al vencimiento se emite una espiga; solo con captura se genera despolarización ventricular. Un estímulo sin captura no reinicia el escape biológico. Se prioriza el evento intrínseco si coincide exactamente con el vencimiento: convención del controlador ideal, no latencia de un dispositivo real.

La fuente intrínseca es un escape ventricular idealizado, no un ritmo sinusal sin ondas P. Se reinicia su temporizador tras una captura ventricular: aproximación de reinicio del foco, sin memoria de sobreestimulación. No se modelan umbral en voltios, electrodo, sensado analógico, blanking, refractariedad, histéresis, respuesta de frecuencia, fusión o pseudofusión. La latencia espiga-QRS de 5 ms conserva el ejemplo previo y es un parámetro de dibujo, no una especificación clínica.

Predicciones: una actividad intrínseca más rápida inhibe estímulos; ausencia de actividad con captura produce ritmo estimulado; ausencia de captura deja espigas sin QRS; cambiar la amplitud visual no cambia el reloj. Ninguna espiga aislada debe enseñarse como captura. No deben publicarse medidas utilizables falsas en ese estado.

Fuentes primarias: [Medtronic, significado de VVI](https://www.medtronic.com/en-us/heart-device-answers/search-results/search-result.what-is-the-difference-between-ddd-and-vvi-pacing.html), [Boston Scientific, manual de referencia](https://www.bostonscientific.com/content/dam/elabeling/crm/pr/359244-001_INGENIO2_CRTP_RG_en-GBR_W_S.pdf). Los manuales fundamentan sensado/inhibición; no validan este controlador simplificado ni sus parámetros.

Aceptación: secuencias manuales independientes, empate, pausa, fin de ventana, captura y no captura, ausencia de efectos fuera de VVI a demanda, compatibilidad exacta del modo fijo, medición desde muestras y navegación real. El caso es docente; no simula una marca de marcapasos ni debe usarse para programar dispositivos reales.

## Resultado adversarial y alcance final antes de publicar
Se ensayó también captura desactivada. Con filtros off/diagnostic el analizador retiró todas las medidas; con monitor interpretó las espigas filtradas como 10 QRS y publicó FC ≈60 lpm y QRS 52 ms utilizables. Con aggressive también publicó FC utilizable. No se oculta ese fallo usando la verdad interna del generador ni se relajan umbrales. Por seguridad docente, la versión de producto se limita a **captura garantizada**; no expone el fallo de captura y rechaza explícitamente un ajuste importado `pacingCapture`. El controlador puro conserva pruebas de estímulo/captura separadas para investigación, pero la aplicación siempre selecciona captura verdadera. Resolver la interpretación de estímulos filtrados requiere una mejora independiente de medición antes de habilitar esa opción.
