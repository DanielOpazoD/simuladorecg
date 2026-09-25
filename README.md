# ECG Lab — candidato v1.4

Simulador educativo de ECG de 12 derivaciones. Vite + TypeScript + Canvas, sin backend ni IA diagnóstica. Señal sintética; los registros públicos de referencia se usan únicamente fuera del producto.

Esta rama reúne la entrega **repolarización regional verificable** sobre v1.3 `38c0cd31b5836c96c82556d756e8150cfde99c64`. Es un candidato en PR, no una versión declarada desplegada. La etiqueta de interfaz y `package.json` mantienen 1.3.0 hasta la promoción de versión; `dist/build-info.json` identifica el candidato por commit, hash de fuentes y `revision=v1.4-review`.

## Ejecutar y verificar

Node 22.16.0 es el entorno reproducido en CI.

```bash
npm ci
npm run check
npm run dev
```

`check` ejecuta pruebas, TypeScript y compilación. Abrir mediante HTTP, no como archivo local. La verificación Chromium y PNG se ejecuta además en `.github/workflows/fidelity.yml`; no se incluye implícitamente en `check`.

```bash
node scripts/validate-repolarization.mjs --output .sites-runtime/repolarization.json
# Requiere historial Git con el commit v1.3. Alternativa: --baseline-dir /ruta/v1.3
npm install --no-save --package-lock=false playwright@1.63.0
npx playwright install chromium
ECG_TEST_URL=http://127.0.0.1:5173/ node tests/browser-fidelity.mjs
```

## Cambios revisables

| PR | Responsabilidad |
|---|---|
| [1](https://github.com/DanielOpazoD/simuladorecg/pull/1) | Protocolo, mediciones sobre muestras, referencia congelada, CI y adquisición de referencias |
| [2](https://github.com/DanielOpazoD/simuladorecg/pull/2) | T regional de los patrones inferior CD/Cx, anterior y lateral en fases hiperaguda/evolutiva |
| [3](https://github.com/DanielOpazoD/simuladorecg/pull/3) | Escala común de ampliación, metrología del PNG y trazabilidad del build |

Son PR dependientes: #2 tiene como base la rama de #1; #3, la de #2. La integración debe respetar ese orden y volver a verificar el resultado. No se presume que se hayan fusionado o desplegado.

No se amplían los 61 presets ni los controles. Para ver el cambio de T, seleccionar **Inferior, Anterior o Lateral → ST y morfología → Hiperaguda/Evolutiva**. Las configuraciones por defecto conservan sus muestras; los bloqueos, estimulación y causas secundarias mantienen el modelo anterior. El detector no se modifica.

## Evidencia y límites

- [Verificación de v1.4](docs/verificacion-v1.4.md): resultados, rutas reproducibles y límites.
- [Modelo regional](docs/regional-repolarization-v1.4.md): parámetros explícitos, alcance y pruebas.
- [Protocolo](docs/repolarization-protocol-v1.4.md) y [metrología de la ampliación](docs/metrologia-v1.4.md).
- [Referencia STAFF III](docs/staff-exploration-v1.4.md): seis pacientes de desarrollo, tres reservados no descargados; no calibración clínica.
- [Discrepancia del snapshot de hiperpotasemia](docs/baseline-recheck-v1.4.md).
- [Enfoque clínico](docs/enfoque-clinico.md) y [documento clínico aportado](docs/referencias/Revision_ECG_SCA_Simulador.md).

Las correcciones regionales son perfiles reducidos heurísticos, no campos anatómicos calibrados ni propagación celular. Mayor coherencia de las pruebas no demuestra máxima fidelidad clínica. El inicio/final de T humano y la calibración externa necesitan anotaciones/revisión independientes; no se ajustó el modelo para esconder fallos del detector.

El ZIP antiguo en `public/` se retira para evitar distribuir código de v1.3 como si fuera el candidato. El código exacto y el build se conservan como artefactos de CI vinculados al commit (retención 14 días). No se requieren secretos de aplicación. Las fuentes pueden solicitarse a Google Fonts, con alternativas locales.

## Documentación histórica

El [README íntegro de v1.3](docs/README-v1.3.md) conserva catálogo, arquitectura, atajos y resultados anteriores. Sus enlaces relativos deben interpretarse desde la raíz original. [Verificación v1.3](docs/verificacion.md), [v1.2](docs/verificacion-v1.2.md) y [v1.1](docs/verificacion-v1.1.md) no equivalen a nuevas ejecuciones.
