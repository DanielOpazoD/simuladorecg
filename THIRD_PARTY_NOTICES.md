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
