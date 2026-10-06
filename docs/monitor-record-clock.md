# Reloj único y limitado por el registro del monitor

Dibujo y sonido duplicaban un mapeo de reproducción de60 s. Un monitor muy ancho
o una señal más corta podía solicitar muestras posteriores al registro, dejando
zonas vacías que no representan ausencia de actividad cardíaca.

Se comparte un reloj de reproducción: la ventana no excede el soporte adquirido
(hasta60 s) y conserva mm/s, sin estirar el ECG. Si el lienzo permite más tiempo
que el registro, el segmento ocupa solo su anchura calibrada. El sonido consulta
el mismo origen temporal del monitor. Un retroceso temporal redibuja el fondo
en lugar de intentar borrar una anchura negativa.

Aceptación: tiempos límite y vueltas largas en registros0,5/10/30/60 s, ventanas
menores/mayores, correspondencia exacta con el mapeo habitual previo, y constructor
real en pantalla amplia con registro de10 s. La prueba del constructor falló
antes. No modifica el generador, el ritmo ni transforma reproducción en monitor
en vivo. El reinicio del registro sigue siendo un bucle educativo explícito.
