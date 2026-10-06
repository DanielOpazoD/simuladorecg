# Flutter: un solo reloj ventricular para RR y memoria QT

El flutter utiliza frecuencia auricular dividida por relación de conducción.
Sin embargo, su primer latido almacenaba RR=60/hr, donde hr es el control base
inactivo en este ritmo. Ese intervalo contaminaba la memoria exponencial de QT;
cambiar un control sin efecto en la frecuencia alteraba la repolarización.

La inicialización ahora usa el mismo intervalo auricular/conducción que el resto
del registro. No cambia la ley QT, la onda auricular ni la conducción fija del
flutter. No incorpora conducción variable ni restitución celular nueva.

Aceptación: 2:1, 3:1 y 4:1 tienen RR inicial coherente; cambiar hr de 40 a 200
mantiene exactamente las doce señales y eventos, mientras variar atrialRate sí
cambia el calendario. Cuatro pruebas fallaron antes y pasan después. Las muestras
de los presets conservan sus huellas existentes: sus dos frecuencias ya eran
coherentes. Ninguna huella se regeneró ni se modificaron umbrales clínicos.
