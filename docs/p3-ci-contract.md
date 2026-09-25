# P3 · CI del código integrado y del artefacto servido

## Contrato ejecutable

`ECG fidelity` se ejecuta en cada pull request, push a `main`, ramas históricas
`improvement/v1.4-*` y ejecución manual. El job `verify` instala desde lockfile,
ejecuta tests, TypeScript/build, contratos de comparación y Chromium contra
`vite preview` (dist). No se prueba el servidor de desarrollo como sustituto.

`verify-production.mjs` exige commit esperado, árbol de producto limpio, versión
coincidente y SHA-256 de entradas. Descarga cada archivo de dist desde el servidor
y compara sus bytes con el build local, incluido el worker. El navegador verifica
que usa assets compilados y no importa `/src/` ni `@vite/client`.
Esto prueba el artefacto servido en CI, no el despliegue de la URL privada.

## Invariantes que ahora hacen fallar CI

`validate-repolarization.mjs` usa los mismos validadores de
`tests/fidelity-gates.test.mjs`. Siete mutaciones negativas cubren cambio de voltaje,
error algebraico negativo, NaN, canal ausente/corto, tiempo de activación y QT.
La prueba falla ante cambio de catálogo activo, calendario o archivo del analizador.
Los 61 defaults y las fases aguda/resuelta de la matriz regional conservan sus
muestras exactamente (0 mV). Hiperaguda/evolutiva admiten cambios regionales, pero
no canales inválidos, muestras no finitas ni cambios de eventos. Einthoven/Goldberger:
error absoluto <1e−9 mV, tolerancia algebraica, no precisión clínica.

El PNG se obtiene por la exportación real de la UI en doce combinaciones de
velocidad/ganancia. Se leen pulso y grilla desde esos archivos con señal sinusal,
sin inyectar ceros ni importar el renderizador fuente. Tolerancias: <2 píxeles en
altura/anchura del pulso y <1 píxel en paso de grilla 5 mm, por rasterización y
antialias a 300 dpi. No constituyen validación de impresión física o digitalización
completa de las ondas. Continúa el control de metadatos pHYs del PNG descargado.

## Protección de main: ajuste administrativo separado

El workflow no activa por sí mismo la protección de rama. Debe configurarse en
GitHub para `main`: pull requests obligatorios, check `verify` de ECG fidelity
obligatorio y actualizado con la base, sin force-push ni eliminación. Mantener
la revisión humana según la organización del proyecto, sin atribuirla a estos tests.

En esta ejecución el conector disponible permite PR/merge y lectura de protección,
pero no escritura administrativa de branch protection/rulesets. Por tanto, el
repositorio NO se declara protegido por incorporar este archivo. La activación
administrativa queda pendiente hasta confirmarla mediante la API de GitHub.

## Reproducción

```bash
npm ci
npm run check
node scripts/validate-repolarization.mjs
npx vite preview --host 127.0.0.1 --port 5173 --strictPort
# En otra terminal, con el mismo commit limpio y Playwright instalado:
node scripts/verify-production.mjs
node tests/browser-fidelity.mjs
```

Archivos JSON/capturas de ejecución se guardan fuera del código en los artefactos
identificados por SHA. Las pruebas sintéticas no sustituyen revisión humana ni
validación externa; los límites fisiológicos de P2 permanecen sin cambios.
