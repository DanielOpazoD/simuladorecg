# ECG Lab — v1.5.0

Simulador educativo de ECG de 12 derivaciones. Vite + TypeScript + Canvas, sin backend ni IA diagnóstica. La señal mostrada es sintética; los registros de referencia se usan únicamente fuera del producto. Ningún preset está validado clínicamente.

## Ciclo actual: fidelidad de la señal

El desarrollo está centrado en que los trazados sean indistinguibles de ECG reales.
El analizador automático queda congelado en PR #155 y sus workflows de referencia
solo se ejecutan a mano; la CI obligatoria es `.github/workflows/ci.yml`.
Plan y decisiones: [docs/fidelidad.md](docs/fidelidad.md).

## Estado del código y de la publicación

La repolarización regional y metrología de los PR [#1](https://github.com/DanielOpazoD/simuladorecg/pull/1), [#2](https://github.com/DanielOpazoD/simuladorecg/pull/2) y [#3](https://github.com/DanielOpazoD/simuladorecg/pull/3) están integradas desde `d55cc648cfbaf74754dfce5df647152f274f8f70`. P1–P3 de la auditoría posterior ([#5](https://github.com/DanielOpazoD/simuladorecg/pull/5), [#6](https://github.com/DanielOpazoD/simuladorecg/pull/6), [#7](https://github.com/DanielOpazoD/simuladorecg/pull/7)) están integrados desde `279ef40cfe8d98026d35542039d9709f9e021b73`.

La versión del producto procede de `package.json`; la UI y `dist/build-info.json` la utilizan sin una etiqueta manual separada. La versión del esquema JSON del caso sigue siendo 1: no es la versión del producto. Un merge o un build **no acredita el despliegue** de la URL privada. Para identificar un servidor concreto, comparar su `build-info.json` y sus bytes con el artefacto de CI correspondiente. No se afirma aquí que ese despliegue se haya realizado.

## Activación ventricular v1.5

El [contrato de fuentes ventriculares](docs/ventricular-source-v1.5.md) separa la
fuente del ritmo: cuatro perfiles ilustrativos reutilizables.
Ocho presets cambian su QRS y la orientación secundaria; 53 conservan exactamente
sus muestras. La fuente histórica `rv_apical_pacing` permite reproducir todos los
presets v1.4. No hay calibración anatómica o clínica de esos perfiles.

## ST secundario acoplado al QRS

El ST secundario se representa en BRI, BRD/BRD incompleto y fuentes ventriculares
regulares, con dirección derivada de su activación. Es independiente de la lesión
primaria y del control de amplitud de T. El [contrato y evaluación](docs/secondary-st-resolution.md)
detalla la predicción, los cambios de medición, el nuevo origen de comparación y
los resultados adversos conservados. No valida amplitudes clínicas ni Sgarbossa.
WPW y el ST separable de torsades quedan fuera de esta implementación.

## Laboratorio de activación QRS

**Activación QRS** abre un [experimento A/B interactivo](docs/activation-lab.md)
sobre los eventos reales del caso: suma temporal XYZ, vista oblicua y tres planos,
12 derivaciones, cursor sincronizado en milisegundos y escalas compartidas. Permite
comparar conducciones o fuentes ventriculares, exportar SVG/JSON y aplicar B de
forma explícita mediante el flujo existente. Cerrar no modifica el caso.

Es una vista del **QRS vectorial aislado antes de adquisición**, no un VCG clínico
ni una simulación anatómica nueva. No cambia los coeficientes del generador. Los
componentes no representables se declaran en lugar de omitirse silenciosamente.

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
npm ci
npx playwright install chromium
npx vite preview --host 127.0.0.1 --port 5173 --strictPort
# En otra terminal:
node scripts/verify-production.mjs
node tests/browser-fidelity.mjs
```

Playwright es una dependencia temporal de pruebas, no del producto. Con Vitest 4,
`--legacy-peer-deps` evita un fallo interno de npm al resolver su peer opcional;
`--no-save --package-lock=false` conserva los manifiestos y el lockfile.

Las salidas nuevas se guardan en `.sites-runtime/` o la ruta indicada, sin sobrescribir evidencia histórica de `docs/`. El informe de análisis incluye versión real, commit/árbol cuando existen, estado de los archivos evaluados y SHA-256 de sus fuentes. Un archivo fuente sin historial informa procedencia Git desconocida; no inventa un SHA ni un estado limpio.

CI (`.github/workflows/fidelity.yml`) comprueba PR, push a `main` y ejecución manual; sirve **dist**, comprueba identidad y ejecuta Chromium. Los artefactos se vinculan al SHA (retención 14 días). El workflow no activa por sí solo la protección administrativa de rama: ver [contrato P3](docs/p3-ci-contract.md).

## Alcance actual, contratos y limitaciones

Hay **63 presets activos y cinco pendientes** (F3.2 añadió los infartos inferior y anteroseptal antiguos), sin nuevas derivaciones ni funciones diagnósticas. Tres responsabilidades distintas:

| Capa | Fuente | Qué demuestra su aceptación |
|---|---|---|
| Generador | `src/engine/signal.ts`, `rhythm.ts`, `morphology.ts` | Coherencia de eventos y muestras sintéticas según contratos acotados. |
| Analizador | `src/engine/sample-analysis.ts` → `measure.ts`, `analysis/` | Estimaciones desde muestras; la auditoría del modelo es una etapa posterior separada. |
| Representación | `src/render/`, `src/ui/` | Tiempo y voltaje de esas muestras; no validez clínica por apariencia. |

La [matriz vigente de alcance por fase](docs/alcance-actual.md) distingue base vectorial, correcciones por derivación y funciones pendientes. [Estado de cada preset](docs/estado-presets.md) conserva sus límites. En inferior/anterior/lateral, las fases hiperaguda/evolutiva añaden T regional solo en el dominio admitido; no son campos anatómicos calibrados ni propagación celular. Selección: **ST y morfología → Hiperaguda/Evolutiva**.

Los [avisos de adquisición P1](docs/p1-acquisition-contract.md) distinguen la inversión de brazos de la fisiología basal. El [ST secundario](docs/secondary-st-resolution.md) y la [repolarización de WPW](docs/wpw-repolarization-resolution.md) ya se generan desde la activación ventricular representada. La amplitud y proporcionalidad ST/QRS siguen sin calibración clínica; no validan Sgarbossa ni localizan vías accesorias. El [contrato P2](docs/p2-secondary-repolarization-limits.md) se conserva como antecedente histórico.

## Documentación de entrada

- [Modelo y decisiones](docs/modelo.md), [enfoque clínico](docs/enfoque-clinico.md) y [contratos por fenotipo](docs/aceptacion-fenotipos.md).
- [Modelo regional](docs/regional-repolarization-v1.4.md), [protocolo](docs/repolarization-protocol-v1.4.md) y [metrología](docs/metrologia-v1.4.md).
- [Verificación histórica v1.4](docs/verificacion-v1.4.md), [STAFF III](docs/staff-exploration-v1.4.md) y [LUDB: procedencia/licencia](tests/reference/ludb/README.md).
- [Contrato de versión y trazabilidad P4](docs/p4-version-provenance.md) y [sesión del trazado P6](docs/p6-trace-session.md).

La [revisión clínica aportada](docs/referencias/Revision_ECG_SCA_Simulador.md) se conserva íntegra: no se convierte toda su bibliografía ni sus cifras en reglas del producto. Las afirmaciones adoptadas y excluidas están distinguidas en el enfoque clínico. Las pruebas sintéticas no sustituyen revisión humana ni validación externa.

## Histórico

[README de v1.3](docs/README-v1.3.md), [verificación v1.3](docs/verificacion.md), [v1.2](docs/verificacion-v1.2.md) y [v1.1](docs/verificacion-v1.1.md) son registros históricos, no nuevas ejecuciones. Sus cifras no describen automáticamente el HEAD actual. La navegación vigente comienza en este README y la matriz de alcance; el [índice de documentación](docs/INDEX.md) clasifica todos los archivos de `docs/`. No se distribuye el ZIP antiguo de código en `public/`.

## Derechos y contribuciones

La licencia de reutilización del código está **pendiente de elección del titular**;
[LICENSE](LICENSE) documenta el estado y no concede una licencia abierta. Las
referencias mantienen sus licencias propias: [inventario](THIRD_PARTY_NOTICES.md).
La [guía de contribución](CONTRIBUTING.md) describe contratos, pruebas, referencias
y el flujo de PR. Ver [alcance de P5](docs/p5-licensing-contribution.md).

## Referencia morfológica externa (auditoría profunda PR3)

[Benchmark PTB-XL+](docs/ptbxl-morphology-reference.md): protocolo por paciente,
características 12SL/Uni-G separadas y latidos medianos cotejados con WFDB.
Solo evaluación offline; no modifica el generador ni el analizador y no acredita
validación clínica. Los resultados y la fuente ejecutada quedan en el artefacto
del workflow `PTB-XL+ morphology reference`.

## Ruido, filtros y medidas conservadas

[Contrato de estrés con ruido calibrado](docs/noise-stress.md): evaluación offline
con ventanas NSTDB fijas, preservación ST/T/QRS y abstención del analizador sin
acceso a la referencia sintética. No modifica el producto ni afirma precisión
clínica. Distingue el ensayo a 500 Hz de la cadena nativa a 1000 Hz; conserva
resultados desfavorables y errores etiquetados como utilizables.

## Calidad de FC antes de la auditoría del modelo

El worker utiliza `analyzeSamples({fs, leads})`: preserva las cifras del primitivo
`measure()` y puede marcar FC como **Revisar** si sus candidatos son sensibles
al umbral y existe actividad de fondo elevada. No corrige la frecuencia ni
clasifica una arritmia. [Contrato y evaluación pareada](docs/hr-detection-quality.md).
Los informes históricos de `measure()` continúan describiendo el primitivo
congelado; no deben confundirse con la entrada completa actual del worker.
