"""Descarga y verifica los datos públicos del banco de realismo (fuera del repo).

Uso: python scripts/fidelity/prepare_data.py --dest ~/datos/ecg-referencia [--medians]

- PTB-XL 1.0.3 (CC BY 4.0): metadatos y la reserva de evaluación: hasta 600
  pacientes distintos de los pliegues 9–10 con NORM=100, ritmo sinusal y sin
  marcas de ruido, electrodos ni marcapasos. Esos pliegues NO se usan para
  entrenar el modelo de forma.
- Con --medians: latidos medianos 12SL y rasgos de PTB-XL+ 1.0.1 (CC BY 4.0),
  usados para entrenar. Sus muestras están en µV aunque el encabezado diga mV
  (comprobado contra los registros crudos: factor 1,02 ± 0,03, r = 0,998).
Cada archivo se verifica contra el SHA256SUMS oficial de su versión.
"""
import argparse, ast, csv, hashlib, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

MIRROR = 'https://physionet-open.s3.amazonaws.com/{}/{}/{}'


def fetch(dest, ds, ver, rel, sums):
    path = os.path.join(dest, ds, rel)
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        for attempt in range(5):
            try:
                with urllib.request.urlopen(MIRROR.format(ds, ver, rel), timeout=120) as r:
                    data = r.read()
                break
            except OSError:
                if attempt == 4:
                    raise
        with open(path, 'wb') as f:
            f.write(data)
    if rel in sums:
        digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        if digest != sums[rel]:
            os.remove(path)
            raise RuntimeError(f'SHA256 distinto: {ds}/{rel}')
    return path


def sums_of(dest, ds, ver):
    p = fetch(dest, ds, ver, 'SHA256SUMS.txt', {})
    out = {}
    for line in open(p, encoding='utf8'):
        parts = line.strip().split(maxsplit=1)
        if len(parts) == 2:
            out[parts[1]] = parts[0]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dest', required=True)
    ap.add_argument('--medians', action='store_true')
    a = ap.parse_args()
    dest = os.path.expanduser(a.dest)

    s = sums_of(dest, 'ptb-xl', '1.0.3')
    for rel in ['ptbxl_database.csv', 'scp_statements.csv', 'LICENSE.txt']:
        fetch(dest, 'ptb-xl', '1.0.3', rel, s)
    rows = list(csv.DictReader(open(os.path.join(dest, 'ptb-xl', 'ptbxl_database.csv'))))
    seen, hold = set(), []
    for r in rows:
        scp = ast.literal_eval(r['scp_codes'])
        clean = all(r[k] == '' for k in ['pacemaker', 'electrodes_problems', 'burst_noise', 'static_noise'])
        if r['strat_fold'] in ('9', '10') and scp.get('NORM', 0) >= 100 and 'SR' in scp and clean and r['patient_id'] not in seen:
            seen.add(r['patient_id'])
            hold.append(r['filename_hr'])
    hold = hold[:600]
    with open(os.path.join(dest, 'ptb-xl', 'holdout_norm600.txt'), 'w') as f:
        f.write('\n'.join(hold))
    jobs = [rel + ext for rel in hold for ext in ('.hea', '.dat')]
    with ThreadPoolExecutor(16) as ex:
        list(ex.map(lambda rel: fetch(dest, 'ptb-xl', '1.0.3', rel, s), jobs))
    print(f'Reserva: {len(hold)} registros verificados')

    if a.medians:
        s2 = sums_of(dest, 'ptb-xl-plus', '1.0.1')
        for rel in ['LICENSE.txt', 'features/12sl_features.csv', 'labels/ptbxl_statements.csv', 'labels/12sl_statements.csv']:
            fetch(dest, 'ptb-xl-plus', '1.0.1', rel, s2)
        med = [k for k in s2 if k.startswith('median_beats/12sl/')]
        with ThreadPoolExecutor(24) as ex:
            list(ex.map(lambda rel: fetch(dest, 'ptb-xl-plus', '1.0.1', rel, s2), med))
        print(f'Latidos medianos 12SL: {len(med)} archivos verificados')


if __name__ == '__main__':
    main()
