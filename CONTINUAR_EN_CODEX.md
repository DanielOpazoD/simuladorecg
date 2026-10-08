# Continuar ECG en Codex

Estado de traspaso: 8 de octubre de 2026, 22:52 UTC. Trabajo pendiente, **sin merge ni aceptación final** del bloque QRS–QT.

## Abrir y continuar

Abre esta carpeta como proyecto de Codex y pide:

> Continúa personalmente el bloque QRS–QT de este repositorio. Lee CONTINUAR_EN_CODEX.md, docs/qrs-qt-boundary-coherence.md y docs/electrophysiology-closeout.md. Preserva main y los cambios de esta rama. Primero confirma el estado de Git y reproduce las pruebas; después completa un PR integrado de alto valor, con validación por latido, CI y navegador sobre el commit exacto. No declares cerrada toda la deuda ni cambies tolerancias para obtener verde. Informa después de cada merge. Una vez cumplida la aceptación de fidelidad, avanza al ciclo educativo y de experiencia de usuario sin sobreingeniería.

## Versión publicada y trabajo pendiente

- Repositorio: https://github.com/DanielOpazoD/simuladorecg
- Última versión publicada: PR155, commit `ddba83dcbc85cbc8679986380446fc6aebbe7e20`. Sus 21 controles pasaron antes y después del merge.
- PR154 corrigió identidad de ondas; PR155 recuperó QRS débiles completos. No modificar sus resultados históricos.
- Esta rama contiene el siguiente bloque, todavía no publicado como PR. Corrige dos causas compartidas: inclusión de la onda precedente dentro del inicio QRS y pérdida de una activación ventricular terminal débil antes de buscar T.
- Solo entran muestras y frecuencia de muestreo al analizador. Diagnósticos, configuraciones y eventos verdaderos del generador permanecen exclusivamente en evaluadores.
- Contrato y límites: `docs/qrs-qt-boundary-coherence.md`.
- Resumen verificable del candidato: `docs/closeout/qrs-qt-handoff-development.json`.

## Evidencia disponible y verificaciones pendientes

El candidato actual, denominado v11 durante el desarrollo:

- Pasó 66 pruebas enfocadas, incluyendo controles independientes de onda T alta, soporte terminal, portadora continua, WPW y preservación de límites por latido.
- Pasó 2.476 escenarios de desarrollo, con las mismas 80 exclusiones explícitas del generador. Ningún nuevo FP/FN, pérdida de identidad, límite previamente correcto degradado ni retirada de una medición correcta utilizable. Esta ejecución reutilizó los resultados de la línea base PR155 recién calculados en el mismo entorno Node; no sustituye la comparación final fresca.
- Los 152 registros LUDB expuestos y las dos cohortes de 150 ventanas INCART conservaron exactamente todos los campos. No son un conjunto clínico nuevo.
- La suite completa de v11 pasó: 2.255 pruebas en 173 archivos. TypeScript y build también pasaron. Los 920 escenarios de ruido con el analizador worker fueron numéricamente idénticos a PR155 y pasaron la comparación estricta. Esto es evidencia local; todavía no es aceptación de una versión publicada.
- Todavía faltan la CI del commit publicado, la comparación fresca completa y los 126 flujos reales de navegador previstos. La versión publicada PR155 tenía 90 flujos aprobados; no atribuirle 126.
- v10 había pasado la comparación fresca de 2.476 casos, los 452 registros/ventanas reales y 920 escenarios de ruido, pero falló tres controles independientes de T alta y dos expectativas antiguas de WPW nulo. Fue rechazado. v11 añade el retorno observado de energía y sustituye esas dos expectativas por exactitud demostrable QRS/QT, manteniendo documentado el error histórico QRS232/QT498–500.

No contar una abstención o cambio de confianza como corrección numérica. Permanecen 28 banderas de FC utilizable incorrecta en el analizador bruto; el filtro de presentación es una capa distinta. El inventario inicial de 50 FC / 434 QRS / 33 QT tampoco equivale al número de errores visibles al usuario. El fallo histórico de QT en datos LUDB y sus limitaciones siguen vigentes.

## Secuencia de aceptación

1. Inspeccionar `git status`, rama, commit, cambios y este documento. Instalar dependencias con el gestor y lockfile existentes si hace falta. No sobrescribir trabajo local.
2. Ejecutar la suite completa, TypeScript y build con la versión Node del repositorio/CI. No comparar informes numéricos entre Node24 de desarrollo y Node22 de CI como si fueran el mismo experimento.
3. Reproducir que las nuevas pruebas discriminan la versión publicada; mantener los controles independientes de T alta y portadora continua.
4. Ejecutar `scripts/validate-qrs-t-discrimination.mjs` sobre los 2.476 casos, sin caché, con los nuevos controles por identidad y límites de cada latido.
5. Reproducir las regresiones reales y 920 escenarios de ruido mediante los flujos existentes. Las fuentes de adquisición y sus manifiestos están definidos en los workflows; los datos descargados y node_modules no forman parte de Git.
6. Abrir el PR únicamente para este bloque coherente. Verificar los 21 controles y artefactos asociados al SHA exacto, los 126 flujos de navegador, A/B, exportación y capturas. No relajar límites, ocultar casos agresivos ni regenerar baselines para pasar.
7. Fusionar únicamente después de la aceptación. Avisar al usuario inmediatamente y confirmar también la CI de main.
8. Revisar el inventario fijo y cerrar los fallos críticos pendientes antes de declarar terminado el ciclo de fidelidad. Pasar luego a mejoras educativas, funcionales y estéticas.

Comandos básicos (desde esta carpeta):

```sh
npm ci
node node_modules/vitest/vitest.mjs run tests --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/validate-qrs-t-discrimination.mjs /tmp/ecg-qrs-qt-fresh.json
```

Esta copia no incluye credenciales, node_modules ni datos clínicos privados. No se requiere cambiar el motor ni añadir bibliotecas de detección: los experimentos previos de sustitución no justificaron hacerlo.
