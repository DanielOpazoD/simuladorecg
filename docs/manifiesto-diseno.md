# Manifiesto de diseño de ECG Lab

**Bello, útil, sencillo y elegante. El ECG es el protagonista.**

Esta es la guía de diseño visual y funcional del programa. Recoge las decisiones de Daniel durante las iteraciones de lectura, simplificación, medidas y lupa. Sirve para decidir qué construir, qué reorganizar y qué quitar. Es una dirección de producto y un criterio de revisión; no afirma que todas las pantallas ya la cumplan.

## 1. La experiencia que queremos

Una persona que quiere aprender ECG debería poder entrar, elegir un ejemplo, observar el trazado, medir y comparar sin estudiar primero la interfaz.

El programa debe sentirse como una buena mesa de lectura: el papel ocupa el centro; las herramientas están al alcance; la explicación aparece cuando ayuda. La profundidad existe, pero no invade el primer vistazo.

**Mejorar no significa agregar.** Una mejora puede ser quitar un párrafo, reunir dos controles, acercar una medida a su onda o eliminar un paso. Antes de incorporar otra función, preguntamos si podemos resolver la necesidad con lo que ya existe.

## 2. Una jerarquía clara

| Nivel | Qué pertenece aquí | Cómo se presenta |
| --- | --- | --- |
| Lectura inmediata | Caso, variantes, ECG y FC, PR, QRS, QTc y eje QRS | Visibles, compactos y con jerarquía consistente |
| Acciones habituales | Medir, marcas automáticas, J/ST, comparar y vista/zoom | Acceso directo, pocos controles y estados claros |
| Exploración contextual | Una derivación ampliada, un hallazgo, una comparación | Cerca de aquello que explica, sin abrir otra ruta equivalente |
| Ajustes y profundidad | Parámetros, herramientas docentes menos frecuentes, generación y fuentes | Desplegables o espacios secundarios bien nombrados |

En escritorio, las variantes quedan debajo del título y los valores resumen al otro extremo de esa fila cuando el espacio lo permite. En móvil se reorganizan sin encoger el texto hasta volverlo ilegible.

La navegación lateral debe priorizar los ejemplos de la familia elegida. Se admite replegar el índice y acceder a la búsqueda bajo demanda si eso libera espacio. Siempre debe ser evidente dónde estamos y cómo volver. El objetivo es reducir decisiones y desplazamientos, no mantener todas las opciones expandidas a cualquier precio.

## 3. El papel primero

El trazado debe comenzar cerca de la parte superior del área de trabajo y aprovechar el ancho disponible. Evitamos cabeceras altas, tarjetas dentro de tarjetas y bandas informativas que empujan el ECG hacia abajo.

Reducimos el espacio entre derivaciones donde realmente sobra. La envolvente de las muestras, los picos grandes, el pulso de calibración y las anotaciones determinan el espacio mínimo. Nunca comprimimos verticalmente una onda para que quepa más contenido.

Buscamos una lectura continua, con menos separadores y cortes visuales. Eso no autoriza a unir segmentos de tiempos diferentes ni a dibujar una falsa continuidad entre derivaciones.

La calibración se consulta **debajo del ECG**, de forma discreta y legible. Las etiquetas propias de las derivaciones permanecen en el papel; no repetimos su lista completa en la cabecera. Los datos de filtros, origen y disposición temporal pertenecen al detalle técnico, salvo que sean necesarios para entender una decisión concreta.

## 4. Menos texto, mejor colocado

Cada frase debe responder a una pregunta del usuario o ayudarle a actuar. Si solo describe una implementación interna, repite un título o vuelve a contar algo ya visible, se elimina de la vista habitual.

- Reunir procedencia, funcionamiento, límites y fuentes bajo una entrada comprensible, como **«Cómo se genera este ECG»**, dentro de la información técnica.
- Consultar las medidas automáticas junto a las demás medidas, identificando cuándo son estimaciones y cuándo son valores del modelo.
- Quitar tiempos internos, identificadores de latidos y frases como «QRS del modelo» de la explicación principal cuando no aportan a la tarea.
- Evitar repetir una orientación anatómica aproximada en texto y diagrama si ambos dicen lo mismo.
- Preferir una explicación breve ligada a un hallazgo visible antes que un bloque general de teoría.

No repetimos avisos genéricos de uso educativo o falta de validación por toda la interfaz y la exportación. La procedencia y las limitaciones siguen siendo consultables en su lugar correspondiente. La limpieza visual no convierte una estimación en una certeza ni permite atribuir al modelo una validación que no tiene.

## 5. Una acción, un propósito

Los controles deben tener nombres y efectos previsibles. Reutilizamos herramientas, cálculos y patrones de interacción antes de crear alternativas paralelas.

- **Comparar** debe permitir contrastar el ejemplo con ritmo sinusal u otro caso elegido. Una etiqueta como «ECG previo» no basta si no explica qué se está comparando.
- **Medir automáticamente** debe señalar los intervalos sobre el trazado, con sus valores. Una tabla separada por sí sola no satisface esa acción.
- **Medir manualmente** usa los mismos calibres y unidades en el papel y en la lupa.
- **Zoom** sirve para ampliar y recorrer el ECG completo. La **lupa** reutiliza la exploración de una derivación para estudiar dos latidos del fragmento elegido.
- **Vista** reúne los formatos de presentación. Monitor y tira de ritmo no necesitan competir como acciones independientes en todas las barras.

Los iconos pueden ahorrar espacio en acciones conocidas. Deben conservar un nombre accesible, una ayuda breve y un estado activo reconocible. Una palabra corta sigue siendo mejor que un símbolo ambiguo. No convertir el minimalismo en una interfaz que haya que adivinar.

## 6. Marcas que enseñan sin tapar

Las marcas se anclan a las muestras y a la ventana realmente mostradas. El número debe quedar junto al intervalo que representa. El zoom, el desplazamiento y el cambio de tamaño mantienen esa alineación y no cambian el valor medido.

En la lupa, PR, QRS y QT pueden verse juntos. Tienen colores diferentes, nombre y valor: azul para PR, verde para QRS y violeta para QT. El color ayuda, pero no es la única forma de distinguirlos. Las filas se mantienen compactas, cerca de las ondas y sin cruces entre etiquetas.

Las etiquetas necesitan un tamaño de lectura estable; no deben crecer como si fueran milímetros de papel y terminar encogiendo el trazado. Las mediciones manuales se distinguen de las automáticas y pueden limpiarse sin cerrar la lupa.

Una explicación de hallazgo se presenta cada vez para evitar acumular recuadros y textos. Esta regla no impide comparar simultáneamente varios intervalos. Toda capa debe poder ocultarse con facilidad, sin recargar ni desplazar el ECG.

Si falta un intervalo estimable, no se inventa. Si en la ventana solo cabe un latido completo, se muestra ese latido o el fragmento disponible, sin fingir que son dos.

## 7. Ventanas contenidas y estables

La lupa y los diálogos de lectura deben caber en una pantalla habitual. Si necesitan scroll, primero revisamos contenido, márgenes, duplicaciones y jerarquía. El cierre y la acción principal permanecen accesibles.

Activar medidas, J/ST o una explicación no debe insertar una nueva banda que empuje el papel. Se reserva espacio o se usa una capa superpuesta. Ocultar una marca conserva la posición y el tamaño del trazado.

En pantallas bajas se compactan cabeceras y controles antes de sacrificar el ECG. En ampliaciones de texto, pantallas extremas o necesidades de accesibilidad, aceptamos desplazamiento accesible antes que recortar contenido, ocultar el cierre o reducir la letra. «Sin scroll» es una meta de composición, no una prohibición que justifique una mala experiencia.

## 8. El lenguaje visual

Promovemos una superficie principal, pocos bordes, alineaciones claras y espacios con intención. La tipografía secundaria debe poder leerse con comodidad. Las medidas usan cifras estables y unidades próximas.

Reservamos el color para selección, estado y explicación. La isquemia puede tener una organización visual más expresiva para orientar la exploración, manteniendo la misma gramática de navegación y sin convertir el panel en una colección de alertas.

La animación solo se justifica si muestra una relación temporal o ayuda a seguir una acción. Evitamos movimiento decorativo, transiciones que hagan perder la referencia y cambios de posición durante la medición. Respetamos movimiento reducido, contraste y navegación con teclado.

Un ECG limpio facilita aprender. El ruido se incorpora cuando responde al escenario o a un control explícito, no como decoración para aparentar realismo. Tampoco se suavizan muestras para esconder una discrepancia del modelo.

## 9. Profundidad sin ampliar el alcance por inercia

La ambición consiste en hacer mejor lo que el simulador ya permite: coherencia clínica, continuidad causal de los controles, lectura, medidas y fidelidad entre pantalla y exportación.

La anatomía y el esquema de ecocardiografía son apoyos contextuales. Deben aclarar una relación y distinguir lo ilustrativo de lo respaldado; no convertirse en otro producto dentro de la página ni insinuar diagnósticos que el ECG no permite establecer.

La inspiración externa —por ejemplo, la exploración de derivaciones y patrones de [Culprit](https://www.cliffreid.com/culprit/)— se adapta a esta jerarquía. No copiamos todas sus secciones ni añadimos controles solo porque existen en otra página.

## 10. Cómo decidir y comprobar una mejora

1. **Nombrar la fricción.** Qué cuesta encontrar, leer o hacer; en qué pantalla y con qué ejemplo ocurre.
2. **Fijar el resultado antes de editar.** Menos pasos, menos altura, valores legibles o una relación mejor explicada. Elegir también qué debe conservarse.
3. **Podar primero.** Quitar duplicados, agrupar y recolocar. Añadir una función solo si queda una necesidad real sin resolver.
4. **Implementar una iteración revisable.** Reutilizar componentes y geometría. No mezclar un cambio visual con ajustes ocultos del generador o del analizador.
5. **Probar la interacción real.** Escritorio, móvil vertical y horizontal, modo oscuro y texto ampliado cuando corresponda; ratón, tacto y teclado en controles de medición.
6. **Comprobar los contratos.** Valores, muestras, escala, polaridad, posición, exportación y estados de ocultación. Para cambios de representación, contrastar también píxeles con un método independiente del renderer y controles negativos pertinentes.
7. **Conservar la evidencia.** Registrar fallos y correcciones. No borrar resultados adversos ni regenerar referencias simplemente para que las pruebas pasen.

Una revisión visual se acepta cuando resuelve la fricción, mantiene la lectura cómoda y supera las comprobaciones relevantes. No hace falta añadir pruebas que solo repitan una línea de CSS; sí verificar las interacciones y los contratos que el cambio puede afectar.

Los cambios de modelo tienen un umbral adicional: caracterizar discrepancias, auditar unidades y referencias temporales, distinguir muestras conocidas de una reserva adecuada y evaluar resultados por familia sobre la señal final. Elevar una afirmación de plausibilidad clínica exige evidencia externa y revisión humana independiente. Una interfaz atractiva no sustituye esas condiciones.

## Lista breve para revisar un PR

- ¿El ECG gana protagonismo o queda rodeado de más interfaz?
- ¿La tarea requiere menos decisiones, sin perder controles esenciales?
- ¿Se entiende cada botón, incluido su estado y cómo deshacer la acción?
- ¿Hay algo repetido que pueda eliminarse o reunirse?
- ¿Las ondas, marcas y valores siguen alineados y legibles?
- ¿Abrir, medir, ocultar o comparar mantiene estable el trazado?
- ¿Cabe en una pantalla habitual y sigue siendo accesible fuera de ella?
- ¿Se preservan señal, unidades y exportación, y se declara cualquier cambio intencional?
- ¿La explicación distingue lo implementado, lo probado y lo que aún no podemos concluir?

**El destino visual es una página serena, precisa y fácil de recorrer: mucho ECG, pocas decisiones y profundidad disponible cuando se necesita.**

Este manifiesto se lee junto con [el alcance vigente](alcance-actual.md), [el plan de fidelidad](fidelidad.md) y [la guía de contribución](../CONTRIBUTING.md). Las mejoras futuras deben acercarnos a estos criterios; no usar el documento para afirmar que ya hemos alcanzado todas las metas.
