"""Banco de realismo: ¿se distingue el ECG sintético del real?

Uso:
  python scripts/fidelity/benchmark.py --real-list LISTA --real-root DIR \
      --synthetic DIR --out informe.json

- LISTA: rutas de registros PTB-XL 500 Hz (sin extensión), relativas a --real-root.
- DIR sintético: salida de export-synthetic.mjs.
Mide cada rasgo en ambos conjuntos con el mismo código (features.py), compara
distribuciones y entrena clasificadores real/sintético con validación cruzada.
AUC 0,5 = indistinguible; 1,0 = trivialmente distinguible.
"""
import argparse, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from features import features, group, LEADS
from scipy.stats import ks_2samp
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer


def load_real(root, rel):
    fs, names, x = read(os.path.join(root, rel))
    assert fs == 500 and [n.upper() for n in names] == [n.upper() for n in LEADS], (rel, fs, names)
    return x


def load_synthetic(d):
    idx = json.load(open(os.path.join(d, 'index.json')))
    for e in idx:
        assert e['fs'] == 500 and e['leads'] == LEADS
        x = np.fromfile(os.path.join(d, e['file']), dtype='<f4').reshape(e['samples'], 12)
        yield e['file'], x.astype(np.float64)


def table(rows):
    keys = sorted({k for r in rows for k in r})
    return keys, np.array([[r.get(k, np.nan) for k in keys] for r in rows], dtype=float)


def auc_for(X, y, cols, seed=0):
    Xs = X[:, cols]
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    gb = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.08, random_state=seed)
    p = cross_val_predict(gb, Xs, y, cv=cv, method='predict_proba')[:, 1]
    lr = make_pipeline(SimpleImputer(), StandardScaler(), LogisticRegression(max_iter=2000, C=0.5))
    q = cross_val_predict(lr, Xs, y, cv=cv, method='predict_proba')[:, 1]
    return float(roc_auc_score(y, p)), float(roc_auc_score(y, q)), p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--real-list', required=True)
    ap.add_argument('--real-root', required=True)
    ap.add_argument('--synthetic', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--label', default='')
    a = ap.parse_args()

    real_rows, syn_rows = [], []
    for rel in [l.strip() for l in open(a.real_list) if l.strip()]:
        f = features(load_real(a.real_root, rel))
        if f:
            real_rows.append(f)
    for name, x in load_synthetic(a.synthetic):
        f = features(x)
        if f:
            syn_rows.append(f)
    keys, R = table(real_rows)
    _, S = table([{k: r.get(k, np.nan) for k in keys} for r in syn_rows])
    X = np.vstack([R, S])
    y = np.r_[np.zeros(len(R)), np.ones(len(S))]

    per = []
    for j, k in enumerate(keys):
        r, s = R[:, j], S[:, j]
        r, s = r[np.isfinite(r)], s[np.isfinite(s)]
        if len(r) < 10 or len(s) < 10:
            continue
        ks = ks_2samp(r, s).statistic
        pct = float((r < np.median(s)).mean() * 100)
        per.append({'rasgo': k, 'grupo': group(k), 'ks': round(float(ks), 3),
                    'real_p50': round(float(np.median(r)), 4), 'real_p05': round(float(np.percentile(r, 5)), 4),
                    'real_p95': round(float(np.percentile(r, 95)), 4), 'sint_p50': round(float(np.median(s)), 4),
                    'percentil_mediana_sint': round(pct, 1)})
    per.sort(key=lambda d: -d['ks'])

    groups = {}
    for g in ['morfologia', 'dinamica', 'ruido']:
        cols = [j for j, k in enumerate(keys) if group(k) == g]
        gb, lr, _ = auc_for(X, y, cols)
        groups[g] = {'auc_gb': round(gb, 3), 'auc_lr': round(lr, 3), 'rasgos': len(cols)}
    gb, lr, p = auc_for(X, y, list(range(len(keys))))
    report = {
        'etiqueta': a.label, 'n_real': len(R), 'n_sintetico': len(S),
        'auc_global_gb': round(gb, 3), 'auc_global_lr': round(lr, 3),
        'auc_por_grupo': groups,
        'ks_mediana_por_grupo': {g: round(float(np.median([d['ks'] for d in per if d['grupo'] == g])), 3) for g in groups},
        'rasgos_mas_delatores': per[:25],
        'rasgos': per,
    }
    json.dump(report, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: report[k] for k in ['etiqueta', 'n_real', 'n_sintetico', 'auc_global_gb', 'auc_global_lr', 'auc_por_grupo', 'ks_mediana_por_grupo']}, ensure_ascii=False, indent=1))
    print('Más delatores:')
    for d in per[:15]:
        print(f"  {d['rasgo']:<22} KS {d['ks']:.2f}  real p50 {d['real_p50']:>8} [{d['real_p05']}, {d['real_p95']}]  sint p50 {d['sint_p50']:>8}")


if __name__ == '__main__':
    main()
