# Manifiesto de diseño de ECG Lab

**Bello, útil, sencillo y elegante. El ECG es el protagonista.**

La prioridad actual es pulir la experiencia de escritorio y la integridad del producto. Cada posición, color, tamaño y explicación debe justificar su presencia por la lectura o por una acción comprensible. La percepción de calidad nace de la coherencia y el cuidado, no de ampliar el catálogo de funciones.

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
| Edición contextual | FC, PR, eje QRS, QRS, conducción intraventricular y QTc | Una sola superficie «Ajustar ECG», junto al papel cuando hay espacio y debajo en anchos menores |
| Exploración contextual | Una derivación ampliada, un hallazgo, una comparación | Cerca de aquello que explica, sin abrir otra ruta equivalente |
| Ajustes y profundidad | Parámetros, herramientas docentes menos frecuentes, generación y fuentes | Desplegables o espacios secundarios bien nombrados |

En escritorio, las variantes quedan debajo del título y los valores resumen al otro extremo de esa fila cuando el espacio lo permite. En móvil se reorganizan sin encoger el texto hasta volverlo ilegible.

«Ajustar ECG» reúne esos seis parámetros con deslizador y valor escribible, sin duplicarlos en «Más ajustes». Muestra solo los que actúan en el registro actual y conserva los valores de los que oculta. El significado de FC puede ser auricular, de escape o de estímulos y se nombra cuando corresponde. Los complejos ventriculares aprendidos fijan sus duraciones: QRS/QTc permanecen como medidas visibles, mientras sus ajustes inoperantes se ocultan. Las fuentes históricas que sí leen esos objetivos conservan los controles.

El panel solo ocupa una columna derecha cuando queda espacio suficiente para conservar el papel; en el escritorio habitual se integra debajo en una fila compacta. No se estrecha el ECG ni se cambia su escala para hacer sitio. Los campos se reorganizan al ampliar el texto. La entrada numérica y el deslizador representan el mismo objetivo, incluidos valores importados fraccionarios, sin redondear el caso al mostrarlo.

La navegación lateral debe priorizar los ejemplos de la familia elegida. Se admite replegar el índice y acceder a la búsqueda bajo demanda si eso libera espacio. Siempre debe ser evidente dónde estamos y cómo volver. El objetivo es reducir decisiones y desplazamientos, no mantener todas las opciones expandidas a cualquier precio.

## 3. El papel primero

El trazado debe comenzar cerca de la parte superior del área de trabajo y aprovechar el ancho disponible. Evitamos cabeceras altas, tarjetas dentro de tarjetas y bandas informativas que empujan el ECG hacia abajo.

La cabecera de escritorio se compacta quitando espacios entre título, variantes y acciones, sin reducir tipografía, medidas visibles ni áreas de interacción. En el catálogo, la selección se reconoce por un fondo suavemente teñido y el peso del nombre; el contorno se reserva para foco de teclado y modos de alto contraste.

El fondo de selección abraza el nombre con márgenes equilibrados, mientras toda la celda conserva su área pulsable. Título, primera variante y primera herramienta comparten una referencia de alineación en escritorio. La cuadrícula fina acompaña al trazado con discreción; sus divisiones principales y la calibración conservan su legibilidad.

En la vista inicial de escritorio, la hoja completa cabe en el ancho y alto disponibles. Se ajusta con una única escala para ambos ejes, sin recortar derivaciones ni alterar muestras, intervalos o calibración. El zoom deliberado permite ampliarla y recorrerla; volver a 100 % recupera la hoja completa. En móvil y ventanas de poca altura se conserva una escala legible. No añadimos avisos visibles de desplazamiento para compensar un encuadre deficiente.

En todos los anchos, el escritorio comienza en el formato compacto de 3 × 4 con tira de II: 2,5 segundos por derivación y 10 segundos continuos en la tira. Esta disposición amplía las ondas proporcionalmente en lugar de estirarlas o dejar grandes márgenes laterales. «Vista» se limita a tres formatos; el de 5 segundos por derivación sigue entre ellos. Un registro importado conserva su propia disposición, y el formato elegido durante la sesión se mantiene al redimensionar o cambiar de caso. No se guarda un formato preferido entre sesiones: la elección inicial se parte siempre del formato compacto.

Reducimos el espacio entre derivaciones donde realmente sobra. La envolvente de las muestras, los picos grandes, el pulso de calibración y las anotaciones determinan el espacio mínimo. Nunca comprimimos verticalmente una onda para que quepa más contenido.

Buscamos una lectura continua, con menos separadores y cortes visuales. Eso no autoriza a unir segmentos de tiempos diferentes ni a dibujar una falsa continuidad entre derivaciones.

La calibración se consulta **debajo del ECG, alineada al extremo derecho**, de forma discreta y legible. Las etiquetas propias de las derivaciones permanecen en el papel; no repetimos su lista completa en la cabecera. Los datos de filtros, origen y disposición temporal pertenecen al detalle técnico, salvo que sean necesarios para entender una decisión concreta.

Los límites de los controles se reúnen en «Cómo se genera este ECG», dentro del icono de información. La referencia del ST se consulta mediante un superíndice junto a su descripción: abre una nota breve y devuelve el foco al cerrarse, sin desplazar ni regenerar el trazado.

## 4. Menos texto, mejor colocado

Cada frase debe responder a una pregunta del usuario o ayudarle a actuar. Si solo describe una implementación interna, repite un título o vuelve a contar algo ya visible, se elimina de la vista habitual.

- Reunir procedencia, funcionamiento, límites y fuentes bajo una entrada comprensible, como **«Cómo se genera este ECG»**, dentro de la información técnica.
- Consultar las medidas automáticas junto a las demás medidas, identificando cuándo son estimaciones y cuándo son valores del modelo.
- Quitar tiempos internos, identificadores de latidos y frases como «QRS del modelo» de la explicación principal cuando no aportan a la tarea.
- Evitar repetir una orientación anatómica aproximada en texto y diagrama si ambos dicen lo mismo.
- Preferir una explicación breve ligada a un hallazgo visible antes que un bloque general de teoría.

No repetimos avisos genéricos de uso educativo o falta de validación por toda la interfaz y la exportación. La procedencia y las limitaciones siguen siendo consultables en su lugar correspondiente. La limpieza visual no convierte una estimación en una certeza ni permite atribuir al modelo una validación que no tiene.

La explicación visible usa nombres como «Ritmo», «Intervalos» y «Eje», conserva los valores y los estados no valorables y evita repetir la calibración. Las herramientas de exploración ST se consultan al pie de su nota de referencia. Las fichas de isquemia separan el escenario de la descripción obtenida del trazado: muestran contexto, clave de lectura y cautela específica, mientras su contenido íntegro se conserva junto a las fuentes. Una exploración modificada o con brazos invertidos no debe presentar la ficha original como interpretación del registro actual; tampoco debe revelarla un ejercicio sin responder.

La explicación puede incorporar hasta dos frases educativas: relacionar el rasgo actual con su mecanismo y orientar la observación. Se redactan para el estado y los eventos disponibles, sin repetir cifras ni convertir el nombre del preset en evidencia. Una explicación teórica no atribuye al programa una propagación anatómica calculada. Se conservan las incertidumbres, las restricciones de aplicabilidad y la ocultación de respuestas en práctica.

## 5. Una acción, un propósito

Los controles deben tener nombres y efectos previsibles. Reutilizamos herramientas, cálculos y patrones de interacción antes de crear alternativas paralelas.

- **Comparar** debe permitir contrastar el ejemplo con ritmo sinusal u otro caso elegido. Una etiqueta como «ECG previo» no basta si no explica qué se está comparando.
- **Medir automáticamente** debe señalar los intervalos sobre el trazado, con sus valores. Una tabla separada por sí sola no satisface esa acción.
- **Medir manualmente** usa los mismos calibres y unidades en el papel y en la lupa.
- **Zoom** sirve para ampliar y recorrer el ECG completo. La **lupa** reutiliza la exploración de una derivación para estudiar dos latidos del fragmento elegido.
- **Vista** es un menú plano con dos modos, papel y monitor, los tres formatos, la escala y la cuadrícula, sin desplegables anidados. La adquisición limpia o con ruido se consulta en «Más ajustes → Artefactos». Vista no contiene filtros de señal, «Marcar ondas» ni una tira de ritmo independiente: la tira de II ya forma parte del formato inicial.

Durante la práctica, «Señal» permanece en Vista porque los parámetros del caso están ocultos. Al salir vuelve a Artefactos, conservando su valor y sin duplicar el control ni revelar la respuesta.

Los iconos pueden ahorrar espacio en acciones conocidas. Deben conservar un nombre accesible, una ayuda breve y un estado activo reconocible. Una palabra corta sigue siendo mejor que un símbolo ambiguo. No convertir el minimalismo en una interfaz que haya que adivinar.

Cuando el ancho de escritorio lo permite, las herramientas de lectura llevan un nombre breve junto al icono. La etiqueta visible conserva su longitud al activar u ocultar la herramienta; el nombre accesible describe el estado. El zoom ocupa el extremo derecho de esa misma fila, y Vista abre junto a su control. En espacios compactos se mantienen los iconos y sus ayudas. Esta claridad no debe añadir otra fila ni desplazar el papel en el escritorio habitual.

## 6. Marcas que enseñan sin tapar

Las marcas se anclan a las muestras y a la ventana realmente mostradas. El número debe quedar junto al intervalo que representa. El zoom, el desplazamiento y el cambio de tamaño mantienen esa alineación y no cambian el valor medido.

En el papel, los valores se centran sobre sus intervalos y comparten altura en cada fila, dentro de la banda libre de señal. Solo se desplazan horizontalmente para evitar el nombre de la derivación o el límite de una columna. En escalas extremadamente pequeñas se conserva una disposición lateral para no apilar texto sobre las ondas.

La cabecera distingue navegación y herramientas sin repetir cajas: variantes con un subrayado de selección, acciones activas con un fondo tenue y compacto. La superficie visible puede ser menor que el área interactiva, que conserva su tamaño. Cambiar de estado no debe mover ni redimensionar el ECG.

En la lupa, PR, QRS y QT pueden verse juntos. Tienen colores diferentes, nombre y valor: azul para PR, verde para QRS y violeta para QT. El color ayuda, pero no es la única forma de distinguirlos. Las filas se mantienen compactas, cerca de las ondas y sin cruces entre etiquetas.

Las etiquetas necesitan un tamaño de lectura estable; no deben crecer como si fueran milímetros de papel y terminar encogiendo el trazado. Las mediciones manuales se distinguen de las automáticas y pueden limpiarse sin cerrar la lupa.

El recorrido lento del latido mueve únicamente un cursor sobre las muestras de la lupa. Comparte los límites estimados de las marcas, conserva su incertidumbre y no inventa el final de P ni el inicio de T. Se inicia por decisión del lector, puede pausarse o recorrerse a mano y se detiene al medir, cerrar o dejar la página. Su espacio se comparte con la observación y el resultado del calibre para no desplazar las ondas al cambiar de herramienta. Con movimiento reducido se mantiene el recorrido manual.

Una explicación de hallazgo se presenta cada vez para evitar acumular recuadros y textos. Esta regla no impide comparar simultáneamente varios intervalos. Toda capa debe poder ocultarse con facilidad, sin recargar ni desplazar el ECG.

Si falta un intervalo estimable, no se inventa. Si en la ventana solo cabe un latido completo, se muestra ese latido o el fragmento disponible, sin fingir que son dos.

## 7. Ventanas contenidas y estables

La lupa y los diálogos de lectura deben caber en una pantalla habitual. Si necesitan scroll, primero revisamos contenido, márgenes, duplicaciones y jerarquía. El cierre y la acción principal permanecen accesibles.

Lupa, Medidas y Comparar comparten una cabecera breve, controles de 44 px y superficies neutras tenues; los contornos refuerzan la selección, el foco y el alto contraste. La compacidad se obtiene reuniendo controles y reduciendo márgenes, sin encoger ondas ni valores. En las tablas, cifras y unidades tienen una alineación estable; la procedencia y los estados de revisión permanecen junto a la medida y, en pantallas estrechas, pueden ocupar otra línea. El pie de la lupa reserva espacio para medir sin mover el trazado.

Activar medidas, J/ST o una explicación no debe insertar una nueva banda que empuje el papel. Se reserva espacio o se usa una capa superpuesta. Ocultar una marca conserva la posición y el tamaño del trazado.

Los hallazgos de «Qué observar» se reconocen como controles discretos, con una superficie tenue y esquinas suaves. Aprovechan el ancho en una fila que se adapta al texto disponible, sin recuadros en reposo ni columnas vacías impuestas. La selección comparte el acento de la marca sobre el ECG; el foco de teclado se distingue de ella. La explicación contextual puede flotar sin ocupar otra fila. Aparte de esa capa, la «Explicación» estructurada situada debajo de los hallazgos permanece siempre desplegada y no depende de pulsar ningún hallazgo; solo el estado oculto del cuestionario la reserva. La «Presentación 30 s» se ha retirado. Llevar la lectura hasta el hallazgo mediante desplazamiento no debe cambiar la posición de la hoja dentro del documento ni su escala.

Ocultar una medición no es borrarla. Mostrar un hallazgo, cambiar la cuadrícula o volver a pulsar el caso o la vista actuales conserva el trabajo. Al recalcular, el papel mantiene el zoom y la referencia de lectura durante la espera; una respuesta anterior no puede recuperar un estado caducado. Si cambian las muestras o la geometría usada por el calibre, se retira la medición anterior para no atribuirla al nuevo trazado.

El resultado manual se lee antes de sus campos de ajuste: derivación, tiempo y voltaje, con su equivalencia en milímetros. No repite las coordenadas de los extremos que ya muestran los campos ni infiere una frecuencia a partir de cualquier intervalo.

En pantallas bajas se compactan cabeceras y controles antes de sacrificar el ECG. En ampliaciones de texto, pantallas extremas o necesidades de accesibilidad, aceptamos desplazamiento accesible antes que recortar contenido, ocultar el cierre o reducir la letra. «Sin scroll» es una meta de composición, no una prohibición que justifique una mala experiencia.

## 8. El lenguaje visual

Promovemos una superficie principal, pocos bordes, alineaciones claras y espacios con intención. La tipografía secundaria debe poder leerse con comodidad. Las medidas usan cifras estables y unidades próximas.

Reservamos el color para selección, estado y explicación. La isquemia puede tener una organización visual más expresiva para orientar la exploración, manteniendo la misma gramática de navegación y sin convertir el panel en una colección de alertas.

El catálogo tiene la identidad de un índice clínico cuidado: superficie neutra ligeramente cálida, títulos de grupo discretos y nombres alineados. El nombre del caso tiene prioridad; la sigla o el detalle que permite distinguirlo aparece en un segundo nivel. La selección usa un fondo suavemente teñido, esquinas suaves y el nombre ligeramente destacado, sin línea de contorno ni franja lateral. En isquemia el acento es burdeos; las demás familias conservan el verde del programa. El foco de teclado tiene un contorno exterior marcado y distinto de la selección. Evitamos tarjetas individuales, iconos de adorno y color en todos los títulos. Los nombres abreviados mantienen el significado y conservan la denominación completa en la búsqueda y el nombre accesible.

La compacidad se evalúa al mismo ancho antes y después: una mejora tipográfica no debe expulsar ejemplos de la pantalla habitual. Mantenemos filas pulsables de al menos 44 px y aceptamos que crezcan cuando el usuario amplía el texto. En móvil, el catálogo conserva una superficie opaca y un cierre visible.

Panel, barra de acciones y ventanas comparten tipografía, tonos y una selección serena; no necesitan repetir el mismo recuadro en cada nivel. Los títulos de grupo y los nombres del catálogo se alinean; el margen no debe obligar a partir palabras que antes cabían. La barra conserva su altura al cambiar de estado. El porcentaje de zoom sigue siendo legible al 100 %, aunque restablecerlo no tenga efecto en ese estado.

Al ampliar el texto, el catálogo puede pasar de dos columnas a una y el indicador de zoom crecer con sus cifras. La densidad no justifica fragmentar palabras ni superponer el porcentaje con los botones.

La animación solo se justifica si muestra una relación temporal o ayuda a seguir una acción. Evitamos movimiento decorativo, transiciones que hagan perder la referencia y cambios de posición durante la medición. Respetamos movimiento reducido, contraste y navegación con teclado.

Un ECG limpio facilita aprender: la adquisición inicial no añade ruido. El ruido se incorpora cuando responde al escenario, a una preferencia explícita del lector o a un registro importado, no como decoración para aparentar realismo. Tampoco se suavizan muestras para esconder una discrepancia del modelo.

## 9. Profundidad sin ampliar el alcance por inercia

La ambición consiste en hacer mejor lo que el simulador ya permite: coherencia clínica, continuidad causal de los controles, lectura, medidas y fidelidad entre pantalla y exportación.

La anatomía y el esquema de ecocardiografía son apoyos contextuales. Deben aclarar una relación y distinguir lo ilustrativo de lo respaldado; no convertirse en otro producto dentro de la página ni insinuar diagnósticos que el ECG no permite establecer.

El destinatario es cualquier clínico interesado en aprender ECG y sus fundamentos. La lectura avanza en la misma página: trazado, qué observar, explicación breve y apoyo visual pertinente. El antiguo Aula como editor separado se retira, junto con sus Ajustes, Anotaciones y duplicados de comparación, práctica y exportación. La lupa, los calibres, las medidas y la comparación principal conservan su propósito.

La escalera AV comparte reloj y muestras con su tira de ritmo y explica asociaciones eléctricas sin inventar localización anatómica; se lee delante de la tabla. El apoyo ecográfico representa mecánica: solo aparece cuando el escenario lo admite y existe un objetivo docente concreto, y se lee después de la descripción eléctrica, en el mismo orden en el documento y en pantalla. Una vista suficiente y compacta, un título breve y una sola pregunta —comparar ambas paredes y reconocer cuál se mueve menos— tienen prioridad sobre planos, rotaciones, segmentos manipulables o párrafos repetidos. No infiere motilidad, arteria ni función desde el ECG. El movimiento requiere una acción del lector. Un caso sin esquema útil no recibe un panel vacío ni un aviso de no disponible. Los parámetros ilustrativos y las fuentes se reúnen en la información existente.

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
