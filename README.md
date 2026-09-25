# ECG Lab — v1.5.0

Simulador educativo de ECG de 12 derivaciones. Vite + TypeScript + Canvas, sin backend ni IA diagnóstica. La señal mostrada es sintética; los registros de referencia se usan únicamente fuera del producto. Ningún preset está validado clínicamente.

## Estado del código y de la publicación

La repolarización regional y metrología de los PR [#1](https://github.com/DanielOpazoD/simuladorecg/pull/1), [#2](https://github.com/DanielOpazoD/simuladorecg/pull/2) y [#3](https://github.com/DanielOpazoD/simuladorecg/pull/3) están integradas desde `d55cc648cfbaf74754dfce5df647152f274f8f70`. P1–P3 de la auditoría posterior ([#5](https://github.com/DanielOpazoD/simuladorecg/pull/5), [#6](https://github.com/DanielOpazoD/simuladorecg/pull/6), [#7](https://github.com/DanielOpazoD/simuladorecg/pull/7)) están integrados desde `279ef40cfe8d98026d35542039d9709f9e021b73`.

La versión del producto procede de `package.json`; la UI y `dist/build-info.json` la utilizan sin una etiqueta manual separada. La versión del esquema JSON del caso sigue siendo 1: no es la versión del producto. Un merge o un build **no acredita el despliegue** de la URL privada. Para identificar un servidor concreto, comparar su `build-info.json` y sus bytes con el artefacto de CI correspondiente. No se afirma aquí que ese despliegue se haya realizado.

## Activación ventricular v1.5

El [contrato de fuentes ventriculares](docs/ventricular-source-v1.5.md) separa la
fuente del ritmo: cuatro perfiles ilustrativos reutilizables, sin nuevo selector.
Ocho presets cambian su QRS y la orientación secundaria; 53 conservan exactamente
sus muestras. La fuente histórica `rv_apical_pacing` permite reproducir todos los
presets v1.4. No hay calibración anatómica o clínica de esos perfiles.

## Ejecutar y verificar

Entorno de CI: Node **22.16.0**, instalación desde `package-lock.json`.

```bash
npm ci
npm run check
npm run dev
```

`check` ejecuta pruebas, TypeScript y compilación; no incluye navegador. Abrir mediante HTTP, no como archivo local. P4 actualiza metadatos y documentación; P6 extrae el estado de sesión del trazado. Ninguno modifica el motor ni el analizador.

```bash
# Comparación de señal con la referencia v1.3, sin modificarla:
node scripts/validate-repolarization.mjs --output .sites-runtime/repolarization.json
# Requiere historial con 38c0cd3; alternativa: --baseline-dir /ruta/v1.3

# LUDB: subconjunto conocido de regresión, NO una reserva clínica nueva:
node scripts/validate-analysis.mjs --split=all --output .sites-runtime/analysis-current.json

# Después de npm run build, desde un commit limpio:
npm install --no-save --package-lock=false playwright@1.63.0
npx playwright install chromium
npx vite preview --host 127.0.0.1 --port 5173 --strictPort
# En otra terminal:
node scripts/verify-production.mjs
node tests/browser-fidelity.mjs
```

Las salidas nuevas se guardan en `.sites-runtime/` o la ruta indicada, sin sobrescribir evidencia histórica de `docs/`. El informe de análisis incluye versión real, commit/árbol cuando existen, estado de los archivos evaluados y SHA-256 de sus fuentes. Un archivo fuente sin historial informa procedencia Git desconocida; no inventa un SHA ni un estado limpio.

CI (`.github/workflows/fidelity.yml`) comprueba PR, push a `main` y ejecución manual; sirve **dist**, comprueba identidad y ejecuta Chromium. Los artefactos se vinculan al SHA (retención 14 días). El workflow no activa por sí solo la protección administrativa de rama: ver [contrato P3](docs/p3-ci-contract.md).

## Alcance actual, contratos y limitaciones

Se conservan **61 presets activos y cinco pendientes**, sin nuevas derivaciones ni funciones diagnósticas. Tres responsabilidades distintas:

| Capa | Fuente | Qué demuestra su aceptación |
|---|---|---|
| Generador | `src/engine/signal.ts`, `rhythm.ts`, `morphology.ts` | Coherencia de eventos y muestras sintéticas según contratos acotados. |
| Analizador | `src/engine/measure.ts`, `analysis/` | Estimaciones desde muestras; la auditoría del modelo es una etapa posterior separada. |
| Representación | `src/render/`, `src/ui/` | Tiempo y voltaje de esas muestras; no validez clínica por apariencia. |

La [matriz vigente de alcance por fase](docs/alcance-actual.md) distingue base vectorial, correcciones por derivación y funciones pendientes. [Estado de cada preset](docs/estado-presets.md) conserva sus límites. En inferior/anterior/lateral, las fases hiperaguda/evolutiva añaden T regional solo en el dominio admitido; no son campos anatómicos calibrados ni propagación celular. Selección: **ST y morfología → Hiperaguda/Evolutiva**.

Los [avisos de adquisición P1](docs/p1-acquisition-contract.md) distinguen la inversión de brazos de la fisiología basal. Los [avisos P2](docs/p2-secondary-repolarization-limits.md) declaran la repolarización secundaria incompleta de WPW y la proporcionalidad ST/QRS no calibrada en BRI/VVI/DDD. Esas limitaciones no se han corregido cambiando las ondas.

## Documentación de entrada

- [Modelo y decisiones](docs/modelo.md), [enfoque clínico](docs/enfoque-clinico.md) y [contratos por fenotipo](docs/aceptacion-fenotipos.md).
- [Modelo regional](docs/regional-repolarization-v1.4.md), [protocolo](docs/repolarization-protocol-v1.4.md) y [metrología](docs/metrologia-v1.4.md).
- [Verificación histórica v1.4](docs/verificacion-v1.4.md), [STAFF III](docs/staff-exploration-v1.4.md) y [LUDB: procedencia/licencia](tests/reference/ludb/README.md).
- [Contrato de versión y trazabilidad P4](docs/p4-version-provenance.md) y [sesión del trazado P6](docs/p6-trace-session.md).

La [revisión clínica aportada](docs/referencias/Revision_ECG_SCA_Simulador.md) se conserva íntegra: no se convierte toda su bibliografía ni sus cifras en reglas del producto. Las afirmaciones adoptadas y excluidas están distinguidas en el enfoque clínico. Las pruebas sintéticas no sustituyen revisión humana ni validación externa.

## Histórico

[README de v1.3](docs/README-v1.3.md), [verificación v1.3](docs/verificacion.md), [v1.2](docs/verificacion-v1.2.md) y [v1.1](docs/verificacion-v1.1.md) son registros históricos, no nuevas ejecuciones. Sus cifras no describen automáticamente el HEAD actual. La navegación vigente comienza en este README y la matriz de alcance. No se distribuye el ZIP antiguo de código en `public/`.

## Derechos y contribuciones

La licencia de reutilización del código está **pendiente de elección del titular**;
[LICENSE](LICENSE) documenta el estado y no concede una licencia abierta. Las
referencias mantienen sus licencias propias: [inventario](THIRD_PARTY_NOTICES.md).
La [guía de contribución](CONTRIBUTING.md) describe contratos, pruebas, referencias
y el flujo de PR. Ver [alcance de P5](docs/p5-licensing-contribution.md).
