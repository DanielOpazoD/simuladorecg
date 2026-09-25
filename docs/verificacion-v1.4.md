# Verificación v1.4 — candidato en tres PR

25 septiembre 2026. Base `38c0cd31b5836c96c82556d756e8150cfde99c64` (v1.3). No nuevos presets ni controles. Esta entrega demuestra contratos de señal y metrología, no calibración clínica poblacional.

## Ejecuciones reales

| Etapa | SHA de rama | Ejecución PR de GitHub Actions | Resultado |
|---|---|---|---|
| Referencia | `4fdc44c225986b40816827aa6ea961a6739c14e5` | [36090261950](https://github.com/DanielOpazoD/simuladorecg/actions/runs/36090261950) | éxito; métricas, congelación, tests y build |
| Regional | `6250def5fe6d98eac01c1403746b623ec7ea1e0f` | [36090588681](https://github.com/DanielOpazoD/simuladorecg/actions/runs/36090588681) | éxito; 324 pruebas |
| Metrología | `ef642f4cfd326e11e8304e38e478f318bbdfafba` | [36090865037](https://github.com/DanielOpazoD/simuladorecg/actions/runs/36090865037) | éxito; 327/327 pruebas, tipos/build, comparación y Chromium |

El artefacto de la tercera ejecución contiene `unit-results.json`, `repolarization-comparison.json`, `browser/browser-results.json`, capturas, fuente y build. El commit de combinación temporal probado fue `7f60cb2120edc9777fd621fd93f0d768eac13c63`; no se confunde con el SHA de rama ni con un merge en main. Los ajustes documentales posteriores se verifican en nuevas ejecuciones visibles en el PR.

La reejecución inicial de v1.3 había fallado 1/293 por una expectativa histórica de hash de hiperpotasemia. Se compararon todas las muestras con el generador conservado, sin diferencias. Se corrigió únicamente ese snapshot y se añadió una regresión. [Evidencia y causa no demostrada](baseline-recheck-v1.4.md).

## Señal

Comparación predefinida: cuatro perfiles × cuatro fases × dos filtros = 32 configuraciones. Semilla, frecuencia 72, variabilidad cero, casos y ventanas idénticos. Los 61 presets por defecto conservan exactamente las doce señales (diferencia máxima 0 en el entorno probado). Los calendarios de activación/QRS/QT permanecen idénticos en las 32 configuraciones. El código de measure.ts y todos los archivos analysis/*.ts se compara byte por byte con la base y conserva su hash.

Métricas ilustrativas, filtro apagado, sobre señal completa en la ventana T (incluye ST; no T celular aislada):

| Perfil / derivación hiperaguda | Pico anterior → nuevo, mV | Anchura a media altura anterior → nueva, ms | Simetría anterior → nueva |
|---|---|---|---|
| Inferior CD / II | 0,60549 → 0,70799 | 106,18 → 116,99 | 0,640 → 0,886 |
| Inferior Cx / II | 0,62171 → 0,75447 | 108,37 → 118,47 | 0,667 → 0,886 |
| Anterior / V3 | 1,08513 → 1,10183 | 108,56 → 118,68 | 0,667 → 0,886 |
| Lateral / V5 | 1,09813 → 1,03393 | 106,25 → 116,65 | 0,640 → 0,851 |

El lateral demuestra que la mejora pretendida no es aumentar todas las amplitudes. Las T evolutivas cambian por región, no por inversión global. Esos valores son resultados de ingeniería, no errores frente a pacientes. El ancho programado y QT no aumentan: cambia la forma dentro del soporte existente.

Las ventanas de esta comparación se sitúan con eventos del generador. La función de métricas no conoce esos eventos y se prueba aparte con ondas analíticas a 250/500/1000 Hz, pero la evaluación sintética no es delineación independiente. El detector congelado recibe sólo muestras y se informa por separado; sus fallos no se corrigen sustituyendo las cifras por parámetros.

## Presentación

[Metrología y QA](metrologia-v1.4.md): dominio de voltaje común al caso, pruebas de interacción, dos viewports, cero errores de consola/página en el recorrido, PNG real de 300 dpi y 12 combinaciones calibradas desde píxeles. El trazo, filtros y paleta no se han rediseñado.

## Referencia externa

[STAFF III](staff-exploration-v1.4.md): seis pacientes, 12 fragmentos, procedencia y SHA-256 verificados al adquirir. Tres pacientes de reserva sin descargar. La exploración con el detector congelado encuentra propuestas de límites no fiables en algunos registros con ruido. No se usan como verdad para calibrar los perfiles. No se ejecutó una nueva validación clínica reservada, PTB-XL+ ni lectura de expertos humanos.

## Entrega y limitaciones

PR #1 → #2 → #3 dependientes. Main y el sitio privado no se modifican por abrirlos. Antes de publicar se requiere integrar en orden, ejecutar CI sobre el resultado y comprobar build-info.json en el sitio servido. El ZIP histórico de public se retira para no ofrecer v1.3 como código del candidato.

Pendiente: calibración externa con límites revisados, ampliar población, validar gradientes/regiones frente a datos, probar móvil físico/accesibilidad/impresión real y resolver limitaciones previas del detector. Las curvas regionales son heurísticas explícitas; no son un modelo anatómico ni certificación diagnóstica.
