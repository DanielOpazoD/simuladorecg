# STAFF III — adquisición y exploración inicial

Se obtuvo el banco predefinido en [staff-selection-v1.4.md](staff-selection-v1.4.md) mediante [ejecución 36090259449](https://github.com/DanielOpazoD/simuladorecg/actions/runs/36090259449). Se verificó cada archivo .dat completo con SHA256SUMS oficial, luego WFDB extrajo 10 s de basal y 10 s durante inflación por paciente. Los extractos incluyen cabecera, ganancia, unidades y hashes de origen. Nueve canales almacenados (V1–V6, I, II, III), 1000 Hz, unidades mV. Los tres aumentados se calculan sólo para exploración.

Se adquirieron 6 pacientes y 12 fragmentos. Los pacientes 24, 19 y 37 permanecen reservados sin descargar. La primera ejecución falló por incompatibilidad WFDB 4.3.0 / pandas 3; se fijó pandas 2.2.3, numpy 2.2.6 y scipy 1.15.3, manteniendo el fallo visible en Actions.

## Exploración, no calibración

`scripts/inspect-staff.mjs` aplica el detector congelado a las muestras, sin etiquetas de arteria como entrada. Propone PR/J/final T para producir descriptores. Su pico post-J+60 no equivale a T aislada y las ventanas no son anotaciones de experto. No se calcula sensibilidad, especificidad ni error frente a una referencia clínica.

| Paciente | Arteria anotada | Candidatos QRS basal / inflación en 10 s | Ventanas propuestas interiores basal / inflación |
|---|---|---|---|
| 9 | LAD | 14 / 12 | 12 / 10 |
| 14 | LAD | 12 / 29 | 10 / 14 |
| 10 | RCA | 11 / 30 | 9 / 14 |
| 12 | RCA | 11 / 29 | 9 / 13 |
| 3 | LCX | 12 / 12 | 10 / 8 |
| 30 | LCX | 14 / 15 | 12 / 13 |

La inspección de los fragmentos 14 y 10 muestra interferencia y sobredetección; por tanto esas propuestas no se adoptan como verdad. La tabla no afirma que todos los candidatos restantes sean QRS correctos. Se conservan todos los pacientes y el resultado, en vez de eliminar los casos que no favorecen al simulador. No se reajustó el detector ni los perfiles a partir de esta exploración.

Para repetir tras descargar el artefacto de adquisición:

```bash
node scripts/inspect-staff.mjs /ruta/staff-development.json.gz .sites-runtime/staff-exploration.json
```

STAFF III fue obtenido en angioplastia electiva, con extremidades Mason–Likar. No equivale a SCA espontáneo; LCX tampoco equivale a lesión lateral pura. Inyecciones incompletamente anotadas y ruido son confusores. La siguiente calibración necesita límites revisados y descriptores adecuados antes de contrastar la reserva. PTB-XL+ sigue sin incorporarse; no se atribuye validación a una búsqueda bibliográfica.

Fuente: https://physionet.org/content/staffiii/1.0.0/ . Licencia Open Data Commons Attribution 1.0. Martínez JP, Pahlm O, Ringborn M, Warren S, Laguna P, Sörnmo L. The STAFF III Database: ECGs Recorded During Acutely Induced Myocardial Ischemia. Computing in Cardiology 2017;44. doi:10.22489/CinC.2017.266-133. Los extractos no forman parte de la aplicación ni se usan como trazados visibles.
