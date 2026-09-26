# Concordancia del final T visible en revisión

Base: PR31 integrado, `b1a5de7828d0730823d87241167d3316e885b7c8`.

Este bloque conecta a la vista de latido la clasificación ya integrada por PR31. No modifica `suggestTEnds`, el analizador automático, QT/QTc, calidad, presets ni filtros.

La nota de revisión muestra uno de dos estados: **alta concordancia interna en desarrollo** o **revisar con cautela**. También expone dispersión temporal y razón de amplitudes. El texto indica explícitamente que la etiqueta fue seleccionada retrospectivamente y no es una probabilidad clínica.

No se ocultan candidatos de menor concordancia y no se crea una banda QT. El objetivo es que el usuario pueda interpretar la propuesta existente sin tener que conocer el benchmark interno.

Pruebas: contrato unitario de UI, suite histórica completa y recorrido Chromium escritorio/móvil sobre el producto compilado. No requiere nuevos modelos, dependencias, persistencia ni estados de producto.
