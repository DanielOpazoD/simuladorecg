# Materiales y licencias: inventario acotado

Este inventario distingue materiales propios y referencias externas. **No
concede una licencia al código de ECG Lab ni certifica una auditoría jurídica
exhaustiva de sus dependencias transitivas.** Estado verificable:
[licensing-status.json](docs/licensing-status.json). Aviso del código: [LICENSE](LICENSE).

| Material | Ubicación / uso | Estado y atribución |
|---|---|---|
| Código y documentación propios de ECG Lab | `src/`, herramientas y documentación propia | Licencia de reutilización pendiente de elección explícita del titular; `UNLICENSED`. No aplicarles automáticamente la licencia de los datos. |
| LUDB 1.0.1 | `tests/reference/ludb/fixtures/`: ocho señales y anotaciones derivadas, solo evaluación | Open Data Commons Attribution License v1.0. Texto original en [LICENSE-LUDB.txt](tests/reference/ludb/fixtures/LICENSE-LUDB.txt), manifiesto de fuentes y transformaciones en [README LUDB](tests/reference/ludb/README.md). Kalyakulina AI et al., *LUDB: A New Open-Access Validation Tool for Electrocardiogram Delineation Algorithms*, IEEE Access 2020, doi:10.1109/ACCESS.2020.3029211. Conjunto: https://physionet.org/content/ludb/1.0.1/ ; doi:10.13026/eegm-h675. |
| STAFF III 1.0.0 | Adquisición explícita con `scripts/collect-staff.py`; extractos fuera de la app y de Git | Open Data Commons Attribution License v1.0 según la fuente versionada y el colector. Martínez JP et al., *The STAFF III Database: ECGs Recorded During Acutely Induced Myocardial Ischemia*, Computing in Cardiology 2017;44, doi:10.22489/CinC.2017.266-133. https://physionet.org/content/staffiii/1.0.0/ . Al redistribuir extractos, conservar licencia, atribución, calibración, selección y hashes. |
| Modelo de forma del latido normal | `src/engine/realistic/normal-shape-model.json`, usado por el motor del producto | Coeficientes derivados (latido medio, 64 modos de variación, una gaussiana conjunta y una mezcla de 8 gaussianas) de 2.381 latidos medianos calculados de registros PTB-XL 1.0.3 (500 Hz), alineados a los latidos 12SL de PTB-XL+ 1.0.1 para heredar sus puntos fiduciales; pliegues 1–8, NORM = 100. **Cambios**: mediana de los latidos de cada registro, alineación, referencia a la línea TP, segmentación por puntos fiduciales y ápice de T, remuestreo por fase, exclusión de atípicos, análisis de componentes principales. No contiene ningún trazado individual. Licencia de los datos: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Atribución: Wagner P et al., *PTB-XL, a large publicly available electrocardiography dataset*, Sci Data 7, 154 (2020), doi:10.1038/s41597-020-0495-6; Strodthoff N et al., *PTB-XL+, a comprehensive electrocardiographic feature dataset*, Sci Data 10, 279 (2023), doi:10.1038/s41597-023-02153-8; conjuntos doi:10.13026/kfzx-aw45 y doi:10.13026/g6h6-7g88. Reconstrucción: `scripts/fidelity/build_shape_model.py`. |
| Modelos de forma por clase (BRI, BRD, BRD incompleto, HBAI, HVI, infartos inferior y anteroseptal antiguos) | `src/engine/realistic/models/*.json`, cargados bajo demanda por el motor del producto | Mismo método y fuentes que el modelo normal, aplicado a los pacientes de cada diagnóstico SCP de PTB-XL 1.0.3 (CLBBB 160, CRBBB 60, IRBBB 383, LAFB 406, LVH 437, IMI 499, ASMI 420; pliegues 1–8, ritmo sinusal, sin diagnósticos que cambien la morfología) con sus latidos 12SL de PTB-XL+ 1.0.1 como referencia fiducial. **Cambios**: los del modelo normal, con 17–50 modos según el número de pacientes, una gaussiana conjunta contraída (Ledoit-Wolf) y, en el BRD, muestreo acotado (`sampleScale`). No contiene ningún trazado individual. Licencia CC BY 4.0 y atribución como en la fila anterior. Reconstrucción: `scripts/fidelity/build_shape_model.py --class CODE`. |
| Modelo de fibrilación auricular (ondas f y RR) | `src/engine/realistic/af-model.json`, usado por el motor del producto | Parámetros derivados de 963 registros con FA de PTB-XL 1.0.3 (500 Hz, pliegues 1–8): espectro de la actividad auricular en V1 (pico, ancho, armónico), covarianza entre derivaciones (log-Cholesky, 7 modos) y CV del RR, resumidos en una gaussiana contraída. **Cambios**: cancelación del QRST por latido medio, enmascarado del QRS, remuestreo a 100 Hz, ajuste paramétrico del espectro. No contiene ningún trazado individual. Licencia CC BY 4.0 y atribución como en las filas anteriores. Reconstrucción: `scripts/fidelity/build_atrial_model.py`. |
| Modelo de flutter auricular (ondas F) | `src/engine/realistic/flutter-model.json`, usado por el motor del producto | Parámetros derivados (ciclo medio, 9 modos, gaussiana contraída y distribución circular de la fase del QRS) de 29 pacientes con flutter de la base Georgia 12-lead ECG Challenge (PhysioNet/Computing in Cardiology Challenge 2021 1.0.3, CC BY 4.0; Reyna MA et al., *Physiol Meas* 2021, doi:10.13026/34va-7q14) y de PTB-XL 1.0.3 (pliegues 1–8; Wagner P et al., *Sci Data* 7, 154, 2020, doi:10.1038/s41597-020-0495-6). **Cambios**: enmascarado del QRS-T, plegado por el ciclo auricular, alineación por correlación circular, ACP. No contiene ningún trazado individual. Licencia CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Reconstrucción: `scripts/fidelity/build_flutter_model.py`. |
| Modelo de forma de la extrasístole ventricular | `src/engine/realistic/models/PVC.json`, cargado bajo demanda por el motor del producto | Coeficientes derivados (latido medio, 24 modos, mezcla gaussiana) de la mediana de las extrasístoles ventriculares de 346 pacientes de PTB-XL 1.0.3 (500 Hz, pliegues 1–8, PVC/BIGU/TRIGU). **Cambios**: detección y agrupación de latidos prematuros de morfología distinta, mediana, puntos fiduciales por velocidad y magnitud espaciales, segmentación por fases, ACP. No contiene ningún trazado individual. Licencia CC BY 4.0 y atribución como en las filas anteriores. Reconstrucción: `scripts/fidelity/build_pvc_model.py`. |
| Revisión clínica proporcionada al proyecto | `docs/referencias/Revision_ECG_SCA_Simulador.md` | Se conserva sin cambios. Su bibliografía no concede licencias de los artículos citados ni verifica automáticamente sus afirmaciones. No se incorporan textos completos externos por citar una referencia. |
| Fuentes tipográficas externas | `src/style.css` solicita DM Sans e IBM Plex Mono a Google Fonts | No hay archivos de tipografías incluidos en este repositorio. La atribución/licencia de un eventual autoalojamiento debe verificarse antes de incorporar esos archivos; este PR no los descarga ni redistribuye. |
| Dependencias de construcción/pruebas | `package-lock.json` y paquete Playwright fijado en CI | Mantienen las licencias de sus respectivos autores. Consultar los archivos de licencia de cada paquete instalado; este inventario no reemplaza una revisión de transitivas ni convierte esas licencias en licencia de ECG Lab. |

Los PNG sintéticos y capturas históricas de `docs/` son evidencia del proyecto,
no registros clínicos de pacientes de LUDB/STAFF. Las referencias no son entradas
del producto ni deben copiarse a `public/` para facilitar una prueba.

La ausencia de licencia explícita no equivale a una licencia abierta:
https://docs.github.com/es/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository .
El valor `UNLICENSED` documenta el estado, no sustituye una decisión del titular:
https://docs.npmjs.com/cli/v11/configuring-npm/package-json/ .

## PTB-XL / PTB-XL+ (benchmark offline PR3)

PTB-XL 1.0.3 aporta metadatos y categorías SCP; PTB-XL+ 1.0.1 aporta
características automáticas de 12SL/Uni-G y latidos medianos 12SL. Strodthoff et al.,
*PTB-XL+, a comprehensive electrocardiographic feature dataset*, Scientific Data
10, 279 (2023); conjunto doi:10.13026/g6h6-7g88. Wagner et al., *PTB-XL, a large
publicly available electrocardiography dataset*, Scientific Data 7, 154 (2020).

Las fuentes, transformaciones y límites están en el [contrato](docs/ptbxl-morphology-reference.md).
Se conservan los textos LICENSE.txt originales de ambas versiones en cada
artefacto, con sus hashes. PTB-XL+ se publica bajo CC BY 4.0; no se aplica esa
licencia al código ECG Lab ni se distribuyen tablas completas en el producto.

## NSTDB 1.0.0 (ruido de evaluación offline)

Contiene información de MIT-BIH Noise Stress Test Database, Moody/Mark,
doi:10.13026/C2HS3T, disponible bajo Open Data Commons Attribution License v1.0:
https://physionet.org/content/nstdb/1.0.0/ y
https://physionet.org/content/nstdb/view-license/1.0.0/ .
Los derivados de evaluación son recortes preespecificados y remuestreados de
bw/ma/em. Se conserva la atribución, URI de licencia y hashes con cada artefacto.
No se incorporan al programa web ni se concede otra licencia al código ECG Lab.
