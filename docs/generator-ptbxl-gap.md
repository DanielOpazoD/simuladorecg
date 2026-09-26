# Brecha morfológica generador ↔ PTB-XL+ — triage antes de calibrar

Base: PR32 integrado, `8e016474bddc2ef5213f3605a65429005df44c5d`.

Este bloque no modifica el generador. Reutiliza el benchmark PTB-XL+ ya integrado para responder una pregunta previa a cualquier ajuste: **qué características de los presets regionales merecen ser investigadas primero**.

Se comparan diez presets de isquemia/ST con distribuciones agregadas NORM/MI/STTC ya producidas por el benchmark. Para I, II y V1–V6 se describen J+60, QRS pico-pico, pico T, FWHM T y T/QRS. La distancia se expresa en unidades de IQR sólo para ordenar discrepancias. No es una puntuación de fidelidad y no existe un objetivo de “meter” todos los presets dentro del IQR.

Limitaciones decisivas: los grupos PTB-XL se superponen; MI no equivale a oclusión coronaria aguda ni a territorio; los límites externos son automáticos 12SL; las ventanas del generador provienen de eventos sintéticos. Por ello el informe **no autoriza modificar coeficientes**. Una intervención posterior debe escoger una discrepancia interpretable, mantener territorio/signos/reciprocidad y demostrar mejora con pruebas específicas sin degradar los demás contratos.

El valor de este bloque es evitar calibración por intuición y evitar tocar simultáneamente ST, T, QRS y múltiples territorios.
