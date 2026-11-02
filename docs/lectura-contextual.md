# Lectura contextual: criterios previos

Iteración sobre `d202075` (PR #238), 2 de noviembre de 2026. Se profundiza la
lectura existente: conducción normal, BRD y BRI, respuesta educativa de los seis
ajustes, una pregunta en Comparar y orden de la correlación mecánica.

## Resultado autorizado

- Una explicación breve relaciona un rasgo comprobable, dónde mirarlo y el
  mecanismo pertinente. El nombre del preset o el parámetro de conducción no
  demuestran una morfología. Si falta el rasgo, se retira la afirmación o se
  formula una instrucción de observación. Los umbrales gráficos ilustrativos
  no se presentan como criterios diagnósticos.
- La explicación y la fila ST/QRS dejan de repetirse en pantalla cuando la
  explicación conserva su límite causal. La descripción estructurada completa
  y la exportación conservan sus valores, textos e incertidumbres.
- Un ajuste puede sustituir la explicación corriente por una frase sobre la
  diferencia realmente publicada. Se distinguen objetivos, valores de eventos
  del modelo y estimaciones del analizador. No se mezclan parámetros nuevos
  con una señal anterior ni se usa una respuesta caducada.
- El feedback se retira al elegir/importar/restaurar un caso o entrar en
  práctica; no crea un historial, un aviso ni otra tarjeta. Un cambio solo de
  presentación conserva el contexto compatible. La edición inválida no genera.
- Comparar conserva su selector y sus dos papeles. Una sola pregunta breve
  aparece cuando ambos registros aceptados pertenecen al dominio docente. Se
  retira durante carga, error y fuera de dominio. Dos ejemplos independientes
  no prueban el efecto causal de una intervención.
- La descripción eléctrica precede al esquema de contracción. La escalera AV
  conserva su utilidad y sus contratos. La contracción sigue siendo ilustrativa
  del escenario, una sola vista, reproducción voluntaria y control manual.
  No se infiere motilidad, FEVI, anatomía de propagación ni oclusión desde el ECG.
- No se añaden controles permanentes ni rutas paralelas. No se modifican motor,
  analizador, renderer, presets, adquisición, calibración o muestras.

## Aceptación antes de integrar

1. Comparación emparejada antes/después con las mismas configuraciones: hashes
   de los 65 s de cada derivación, eventos, medidas y PNG de papel iguales.
   Posición y geometría del ECG principal iguales. Sin nuevas decisiones de
   navegación ni desplazamientos al mostrar la explicación o pregunta.
2. Controles negativos: señal aplanada, polaridad invertida, límites incompletos,
   ausencia de complejos organizados, ritmos ajenos, ajustes inoperantes y
   práctica sin responder. Un rasgo ausente no se anuncia por el preset.
3. Edición nativa, ráfagas y respuesta tardía: solo el resultado vigente cambia
   la explicación; conservar foco y referencia del papel. Restablecer devuelve
   las muestras originales. Vista/zoom no provocan síntesis adicional.
4. Comparar: ambos sentidos normal/BRD/BRI, mismo ejemplo y pares ajenos. Error
   de referencia y cierre/retorno no dejan preguntas ni metadatos caducados.
5. Escritorio 1920/1440/1280, móvil 390/320, texto 200 %, teclado, tema oscuro y
   movimiento reducido. Las ventanas conservan sus controles y cierre accesibles.
6. Si cambia la proyección de muestras o marcas, ampliar primero la verificación
   al oráculo independiente y errores deliberados de tiempo/escala/polaridad.
   Conservar fallos y resultados adversos; no regenerar referencias para pasar.

## Resultados adversos conservados

Registro de la iteración, sin regenerar el oráculo ni ajustar referencias para
pasar. Los fallos y las respuestas incompletas de la API se guardan fuera del
producto.

- La primera entrega excluía el preset sinusal porque el criterio confundía el
  pacing ventricular con actividad propia. Se corrigió consultando
  `events.spikes`/`kind` del modelo en lugar de inferirlo de la señal.
- BRI en V1: la amplitud terminal cruda fue −0,052 mV, por debajo del umbral
  ilustrativo fijo de 0,1 mV. Se clasifica como plana (`flat`); no se forzó
  la negatividad para que el texto coincidiera con el nombre del preset.
- QRS de 140 ms en ritmo sinusal: la ventana terminal (últimos 40 ms) resultó
  poco legible aunque el complejo completo era visible. La elegibilidad del
  feedback se corrigió usando la medida pico a pico ya existente, con al menos
  una de V1, I o V6 ≥ 0,1 mV; se mantienen el test y el umbral terminal de la
  explicación. Enseñar el voltaje terminal y comprobar la visibilidad general
  del complejo son criterios distintos y se documentan por separado.
- La ventana terminal usa el calendario del modelo y la basal PR sobre las
  muestras finales, con un mínimo de dos latidos consistentes. No es una
  delineación independiente ni un detector clínico. Las unidades se expresan
  en mV (0,1 mV), no en mm, porque no interviene la calibración del papel.
- El feedback compara referencias modeladas ya publicadas del caso; no mezcla
  objetivos nuevos con señales anteriores ni muestra estimaciones del
  analizador, que siguen en Medidas. Un párrafo breve en «Cómo se genera este
  ECG» recoge esta procedencia sin nuevo apartado, control ni aviso.

Resultados locales ya obtenidos (ejecución local de la coordinación, no una
prueba de Fable ni CI remoto): 2957 tests en 212 archivos; 13 comprobaciones
de navegador de la lectura contextual; 15 registros con 65 s, medidas, PNG de
pantalla y geometría idénticos; 4 exportaciones PNG idénticas byte a byte.
Después de esa entrega se completaron las regresiones de comparación, continuidad
de medidas, retorno, intención de ventanas, Ajustar ECG, escalera AV, recorrido
lento, lectura esencial y Vista, sin fallos. La última edición del detalle de
procedencia pasó sus seis pruebas específicas. El build y TypeScript son
correctos; los 18 archivos servidos se contrastaron por HTTP con el build del
árbol de trabajo. Esta comprobación local no certifica un release limpio ni un
CI remoto. No hay revisión humana independiente ni validación clínica.

## Procedencia y límites

Inspiración docente: archivo `DanielOpazoD/ecg-learning-guides`, commit
`e69ddd503b1670f15f407ac6e687a5568b704fdf`, especialmente capítulos 06, 07 y 14
de The Heart in Twelve Leads. Redacción e implementación propias, sin copiar
motor, recursos o reglas particulares del modelo de la guía.

Referencia de teoría de conducción: AHA/ACCF/HRS (2009), parte III,
<https://www.jacc.org/doi/10.1016/j.jacc.2008.12.013>. El acceso directo al texto
completo no se consiguió en esta sesión; no se introducen umbrales clínicos nuevos
tomados de un resumen. Las referencias existentes siguen siendo consultables.

Fable ejecuta los cambios con razonamiento alto; la coordinación y las pruebas
de conservación son independientes de sus afirmaciones. Ese contraste técnico
no demuestra aprendizaje ni plausibilidad clínica. Elevar tales afirmaciones
requiere observación de usuarios, evidencia externa y revisión humana independiente.
