# Eje sin información frontal

Una señal analítica con QRS precordiales y canales I/II constantes producía eje
0° con estado «usable». Ese resultado proviene de atan2(0,0), no de información
sobre dirección. La repetición exacta no transforma ausencia de datos en certeza.

La entrada pública retira eje QRS y ejes P/T cuando I y II son exactamente
constantes en su ventana de análisis. Conserva candidatos, tiempos, otras medidas,
muestras y la cifra retirada en rejected.axis. No modifica el delineador congelado
ni corrige el eje hacia otro ángulo. Una sola derivación plana no basta para retirar
la dirección; tampoco se introduce un umbral arbitrario de bajo voltaje.

Pruebas con derivaciones de miembros algebraicamente coherentes, con/sin offset,
control de una sola derivación plana y amplitudes pequeñas no constantes. Dos
casos fallaban antes. Se exige conservar la salida numérica de presets y referencias conocidas
fuera de esta condición explícita. Los contratos congelados admiten solo esta revisión exacta y
comprueban el núcleo previo sin cambiar sus políticas ni las referencias externas.

Límite: esto cubre ausencia exacta de información frontal; no valida fiabilidad
a bajo voltaje, cancelación bifásica, ruido, rotación anatómica o conexión de cables.
La falta de información no se etiqueta como diagnóstico ni como eje extremo.
