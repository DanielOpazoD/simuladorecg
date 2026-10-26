# Instrumentos de fidelidad reproducibles desde cualquier directorio

El banco necesita registros exportables en la máquina donde se investiga. Los
dos CLI calculaban la raíz con `URL.pathname`, que conserva la codificación de
espacios y no representa una ruta de unidad Windows. El exportador fallaba antes
de producir un ECG. Además, al ejecutarlo desde otro `cwd`, la isquemia dependía
de un modelo buscado en ese directorio ajeno.

Ambos instrumentos convierten ahora su URL con `fileURLToPath`. El exportador
registra todos los modelos desde la raíz del proyecto, incluida la isquemia;
el directorio de salida sigue siendo relativo al `cwd` del usuario. La selección
del paciente, los parámetros y las muestras válidas no cambian.

El CLI rechaza cantidades fraccionarias, cero, valores no finitos, adquisición
desconocida y desplazamientos que sacarían las semillas del rango del caso.
Comprueba que cada muestra Float32 sea finita antes de escribir un registro.
Así un lote inválido no termina como un índice de entrenamiento aparentemente
correcto pero vacío o con coeficientes no finitos.

La prueba `tests/fidelity-cli.test.mjs` ejecuta procesos Node reales, sin mocks
del bundler o del motor. Dos pruebas de integración fallaban antes del arreglo.
Comprueba:

- Sinusal, BRD incompleto e isquemia anterior desde un `cwd` ajeno: índices a
  500 Hz, 5000 muestras, doce derivaciones en orden, 240000 bytes por registro,
  todos los Float32 finitos y bytes idénticos al repetir la ejecución ideal.
- Una copia del proyecto cuya ruta contiene espacios y `#`, incluida la elección
  de paciente con el criterio existente. La salida también contiene esos caracteres.
- Ocho lotes inválidos sin índice de salida publicado.

```bash
npx vitest run tests/fidelity-cli.test.mjs
node scripts/fidelity/export-synthetic.mjs "ruta de salida" 1 sinus ideal
node scripts/fidelity/choose-textbook-seed.mjs 5
```

Se usa una unión de directorio para reutilizar dependencias en el fixture de
prueba, sin copiarlas ni alterar el lockfile. El test corre tanto en Windows
como en la CI Linux. Es una corrección del instrumento: no aporta una nueva
medida de realismo ni validación clínica del generador.
