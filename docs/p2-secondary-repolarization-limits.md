# P2 · Límites visibles de repolarización secundaria

## Contrato docente

WPW añade delta pero no modifica la T secundaria. BRI, VVI y DDD incluyen
repolarización secundaria aproximada, pero el control de voltaje QRS no mantiene
una proporcionalidad ST/QRS calibrada. No sirven para validar reglas proporcionales
de Sgarbossa. Esto limita al simulador, no la interpretación clínica de pacientes.

Los avisos se obtienen de los parámetros actuales (incluidos casos personalizados),
se muestran en el panel habitual y se conservan en la ficha de estado del preset.
AAI sin BRI no recibe el aviso de estimulación ventricular. FV y asistolia no
reciben avisos sobre una T organizada. El quiz oculta pistas antes de responder.
No se añade una T invertida arbitraria ni se ajustan vectores, eventos o filtros.

## Evidencia y tolerancias

`tests/teaching-limits.test.ts` compara importación/contexto y doce derivaciones
con igualdad exacta. Reproduce delta visible con T terminal idéntica al control
sin preexcitación, manteniendo iguales PR/QRS/semilla (ventana QRS+210 ms hasta QT).
El barrido de voltaje 0,1 → 1 en BRI/VVI/DDD mide S en V2 y ST40, sin convertir
ese valor en ST en J ni diagnosticar positividad de Sgarbossa. La escala de S se
comprueba con tolerancia decimal 1e−6; el residuo no proporcional >0,1 mV es un
margen del fixture conocido, no un límite clínico. Estas pruebas describen un
límite actual; cuando se corrija el modelo deberán reemplazarse, no perpetuarlo.

El contrato original de WPW exige cambios secundarios (guía original, §3.4 A).
El enfoque clínico del repositorio distingue una configuración docente de una
adjudicación diagnóstica (`enfoque-clinico.md`, «BRI o marcapasos»). Esta entrega
reduce la discrepancia de enseñanza mediante advertencias explícitas; no afirma
haber implementado aún esa fisiología ni realizado validación humana independiente.
