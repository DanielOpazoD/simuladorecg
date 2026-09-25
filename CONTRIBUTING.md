# Contribuir a ECG Lab

## Antes de enviar cambios

Lee [README](README.md), [alcance actual](docs/alcance-actual.md) y
[LICENSE](LICENSE). La licencia de reutilización del código aún no está elegida;
abrir un PR no concede ni cambia derechos. Coordina con el mantenedor cualquier
aportación que necesite términos de licencia. No incorpores material de terceros
sin procedencia y permiso compatibles. No subas ECG identificables de pacientes,
credenciales ni archivos de tipografías a este proyecto.

## Entorno y verificación

```bash
# Node 22.16.0 (misma versión que CI)
npm ci
npm run check
node scripts/validate-repolarization.mjs --output .sites-runtime/comparison.json
```

La comparación requiere el commit v1.3 indicado en su script. En un ZIP sin
historial, usa `--baseline-dir /ruta/v1.3` y no inventes un SHA Git. Los recorridos
de producción y comandos de navegador están en README y `docs/p3-ci-contract.md`.
Una instalación local y un `build` correctos no prueban la interfaz; CI prueba
`dist`, el worker, exportaciones reales e identidad. Comprueba también el CI del
commit de `main` después de integrar. No hagas force-push a `main`.

## Un PR, un contrato revisable

Título `fix:`, `test:`, `docs:`, `ci:` o `refactor:`; `feat:` solo cuando el alcance
lo autorice. Explica: problema reproducible, cambio, archivos afectados, criterio
de aceptación, resultados con commit/entorno y limitaciones que siguen pendientes.
No mezcles una nueva patología, cambios del detector y un rediseño visual.

Para una prueba de señal especifica **preset/parámetros, semilla, fs, filtro,
derivaciones, ventana y referencia basal, magnitud/unidad y tolerancia con motivo**.
Ejemplo de preservación: I, II y V1–V6 antes/después, igualdad exacta si no se cambió
el motor; identidades de Einthoven/Goldberger con error absoluto <1e−9 mV. Esa es
una tolerancia algebraica, no exactitud clínica. Para ST indicar J/J+60 y PR/TP;
no convertir un umbral de fixture en una recomendación diagnóstica.

## Las tres responsabilidades

- Generador: pruebas sobre eventos y muestras del dominio admitido. Sus tiempos
  conocidos pueden situar una ventana, pero eso no valida un delineador.
- Analizador: solo muestras y frecuencia de muestreo. En evaluación externa no
  recibe parámetros del generador ni la auditoría sintética posterior.
- Representación: prueba escalas y píxeles del archivo exportado y el estado
  visible. Una captura atractiva no demuestra corrección del generador.

## Presets y referencias

Para añadir o revisar un preset, usa el catálogo tipado, documenta estrategia y
límites, y añade aceptación por rasgo observable con controles negativos. La
simple existencia de un hash nuevo no basta. Mantén sincronizados catálogo y
estado-presets.md/json; actualiza la matriz de fases si cambia el alcance.

No regeneres todos los snapshots para pasar CI. Explica cada diferencia y conserva
una comparación emparejada antes/después. Los ocho LUDB actuales son regresión
conocida, no una reserva nueva. No inspecciones los pacientes STAFF reservados
como ajuste. Adquirir nuevas referencias es una acción explícita, fuera de la app,
con licencias, hashes y anonimización verificados.

Resultados temporales en `.sites-runtime/` o artefactos de CI, no en `src/` ni
sobrescribiendo informes históricos de `docs/`. Un refactor debe conservar muestras,
medidas y comportamiento salvo el contrato expresamente modificado. Toda afirmación
de validación clínica requiere evidencia independiente; no la sustituye este flujo.
