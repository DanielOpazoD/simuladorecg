# QT configurado frente a QT realmente aplicado

El generador conserva un soporte mínimo de QRS+120 ms y un techo de QT de900 ms.
En los extremos del dominio, el QTc configurado no se realiza íntegramente; antes
el diálogo no explicaba esa diferencia y podía atribuirse al analizador.

Se leen los eventos realmente generados para informar cuántos latidos toparon
con cada límite en el diálogo de medición. No se modifica el motor, su historia
RR, la señal, las medidas ni las advertencias históricas. Los límites se describen
como numéricos, no como períodos refractarios ni máximos fisiológicos. La diferencia
algebraica usa una tolerancia de1 ns, que no expresa precisión clínica.

Aceptación: señal normal sin aviso, QRS240/QTc260 a60 lpm con mínimo QT360 ms,
QTc650 a20 lpm con techo900 ms, ausencia de eventos y no mutación de señal/medidas.
La prueba de presencia en el diálogo fallaba antes de integrarlo. No ofrece
predicción terapéutica ni valida el QT absoluto del simulador.
