# P9 · Calibres, teclado y contraste

## Contrato de interacción

Los calibres existentes de papel/tira se manejan por arrastre, campos nativos o
flechas con foco en el canvas. Un selector elige derivación/tramo y otro extremo
A/B. Tiempo se expresa en ms de la señal y voltaje en mV mostrados respecto de la
línea basal del segmento; en Cabrera se identifica −aVR mostrado. No es una nueva
medición automatizada de ondas ni una reconstrucción de las muestras.

`caliper-geometry.ts` comparte coordenadas y lectura entre puntero, teclado y
render: paso horizontal 1/fs, vertical 0,01 mV (Mayús: diez pasos), con límites
al tramo. La señal no se cuantiza ni se modifica; se ajustan solo los cursores.
El output anuncia Δt/ΔV, extremo y unidades. El cociente 60.000/Δt solo es frecuencia
si el usuario midió RR. Limpiar o invalidar no conserva lecturas manuales antiguas.

Los atajos M/P/R/V/G/C y espacio solo están activos con foco en el trazado.
No interceptan formularios, botones, modificadores de lector ni IME. Tab conserva
su comportamiento. Los campos numéricos son una alternativa a que un lector de
pantalla transmita las flechas al canvas; no se utiliza role=application.
La ayuda está en «Teclado y calibres». No se afirma acceso no visual completo al
contenido electrocardiográfico ni conformidad WCAG global.

## Contraste y alcance

Colores secundarios pasan a tokens contrastados en claro/oscuro; fondo y texto
raíz siguen esos tokens (el fondo raíz antes permanecía claro). Pie a 12 px y foco
visible del trazado. Campos táctiles de 44 px en viewport estrecho. No se cambia
la grilla/curva clínica ni se agrega una derivación/preset.

Referencias W3C consultadas para los criterios concretos:
- 2.1.1: https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html
- 2.1.4: https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html
- 1.4.3: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html

## Aceptación y límites

24 combinaciones II/V5 × velocidades × ganancias sobre extremos analíticos:
200 ms y 0,5 mV. Teclado/puntero ≤una muestra y ≤0,01 mV; pruebas comprueban además
valores exactos a tolerancia de redondeo y un paso de 2 ms. Estos márgenes son de
interacción, no precisión clínica del detector. Pruebas negativas de NaN, límites,
Cabrera y paleta. El navegador valida foco, controles nativos y flechas, atajos
fuera de foco, contraste calculado de elementos y una medición manual por puntero.

No hay prueba con teléfono físico, lector de pantalla humano o impresora. El
DOM/roles comprobado en Chromium no sustituye esa evaluación. Las pruebas de
representación no validan generador ni analizador; ambos quedan sin cambios.

Primera ejecución Chromium: el nuevo recorrido se detuvo porque el selector de
«Ajustar al ancho» coincidía con dos controles existentes. El test selecciona
ahora explícitamente el del inspector. No se modifican las expectativas de
precisión ni se interpreta ese error del test como un fallo del producto.

La revisión de la captura detectó también contraste 4,28:1 en el texto Δt/ΔV
(acento sobre fondo suave). Se cambia solo ese texto al token de tinta y se añade
su contraste a la prueba de estilos computados en ambos temas; la curva y los
marcadores no cambian de color.
