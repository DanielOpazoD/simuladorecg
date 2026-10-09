"""Clasificador diagnóstico entrenado solo con ECG reales (PTB-XL, 100 Hz).

  python scripts/fidelity/diag_classifier.py train --data ~/datos/ecg-referencia --model diag.pt
  python scripts/fidelity/diag_classifier.py presets --data ~/datos/ecg-referencia --model diag.pt \
      --catalog DIR --out informe.json

`train`: multietiqueta con todas las declaraciones SCP con ≥ 100 registros en los
pliegues 1–8; valida en el pliegue 9 y reporta el AUC macro en el 10.
`presets`: aplica la red a cada preset (exportado con export-synthetic.mjs
<dir> 0 catalog) y compara con los diagnósticos que el preset pretende enseñar.
Un preset fiel debería recibir de una red entrenada con pacientes el mismo
diagnóstico que un cardiólogo le pondría.
"""
import argparse, ast, csv, json, os, sys
import numpy as np
import torch
from torch import nn
sys.path.insert(0, os.path.dirname(__file__))
from wfdb import read
from nets import ResNet1d, device
from sklearn.metrics import roc_auc_score
from scipy.signal import decimate

# Diagnósticos SCP que cada preset pretende mostrar (al menos uno debe ser probable).
EXPECTED = {
    'sinus': ['NORM', 'SR'], 'brady': ['SBRAD'], 'tachy': ['STACH'], 'rsa': ['SARRH', 'SR'],
    'af': ['AFIB'], 'af_fast': ['AFIB'], 'af_slow': ['AFIB'], 'flutter': ['AFLT'], 'flutter3': ['AFLT'],
    'svt': ['SVTAC', 'PSVT'], 'pac': ['PAC'], 'pvc': ['PVC'], 'bigeminy': ['BIGU', 'PVC'],
    'trigeminy': ['TRIGU', 'PVC'], 'couplet': ['PVC'], 'av1': ['1AVB'], 'wenckebach': ['2AVB'],
    'mobitz2': ['2AVB'], 'av21': ['2AVB'], 'highav': ['2AVB', '3AVB'], 'complete': ['3AVB'], 'complete_v': ['3AVB'],
    'rbbb': ['CRBBB'], 'irbbb': ['IRBBB'], 'lbbb': ['CLBBB'], 'lafb': ['LAFB'], 'lpfb': ['LPFB'],
    'bifascicular': ['CRBBB', 'LAFB'], 'bifascicular_pr': ['CRBBB', 'LAFB', '1AVB'], 'wpw': ['WPW'],
    'inferior': ['IMI', 'INJIN', 'ILMI'], 'inferior_lcx': ['IMI', 'INJIL', 'ILMI'], 'anterior': ['AMI', 'ASMI', 'INJAS'],
    'lateral': ['ALMI', 'INJAL', 'ISCAL'], 'posterior': ['PMI'], 'rv_infarct': ['IMI', 'INJIN'],
    'diffuse': ['ISC_', 'NST_'], 'subendo': ['ISC_', 'NST_'], 'wellens_a': ['ISCAS', 'ISCAN'], 'wellens_b': ['ISCAS', 'ISCAN'],
    'de_winter': ['ISCAS', 'AMI'], 'sgarbossa': ['CLBBB'], 'pericarditis': ['STE_'], 'rv_acute': ['RVH', 'IRBBB'],
    'rv_chronic': ['RVH', 'RAO/RAE'], 'lvh': ['LVH'], 'old_inferior': ['IMI', 'ILMI'], 'old_anterior': ['ASMI', 'AMI'], 'aai': ['PACE'], 'vvi': ['PACE'], 'ddd': ['PACE'],
    'hypok': ['TAB_', 'NT_'], 'longqt': ['LNGQT'], 'lowvoltage': ['LVOLT'],
}


def load_meta(root):
    rows = list(csv.DictReader(open(os.path.join(root, 'ptb-xl', 'ptbxl_database.csv'))))
    for r in rows:
        r['codes'] = ast.literal_eval(r['scp_codes'])
    return rows


def load_x(root, rows):
    out = []
    for r in rows:
        fs, names, x = read(os.path.join(root, 'ptb-xl', r['filename_lr']))
        out.append(x[:1000].T.astype(np.float32))
    return np.stack(out)


def train(a):
    root = os.path.expanduser(a.data)
    rows = [r for r in load_meta(root) if os.path.exists(os.path.join(root, 'ptb-xl', r['filename_lr'] + '.dat'))]
    tr = [r for r in rows if int(r['strat_fold']) <= 8]
    counts = {}
    for r in tr:
        for k in r['codes']:
            counts[k] = counts.get(k, 0) + 1
    labels = sorted(k for k, v in counts.items() if v >= 100)
    Y = lambda rs: np.array([[1.0 if k in r['codes'] else 0.0 for k in labels] for r in rs], dtype=np.float32)
    va = [r for r in rows if r['strat_fold'] == '9']
    te = [r for r in rows if r['strat_fold'] == '10']
    Xtr, Xva, Xte = load_x(root, tr), load_x(root, va), load_x(root, te)
    Ytr, Yva, Yte = Y(tr), Y(va), Y(te)
    dev = device()
    torch.manual_seed(0)
    net = ResNet1d(len(labels), width=64, stem_stride=1).to(dev)
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-3)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=a.epochs * ((len(Xtr) + 127) // 128))
    lossf = nn.BCEWithLogitsLoss()
    rng = np.random.default_rng(0)

    def predict(X):
        net.eval()
        with torch.no_grad():
            return np.concatenate([torch.sigmoid(net(torch.from_numpy(X[i:i + 256]).to(dev))).cpu().numpy() for i in range(0, len(X), 256)])

    def macro(Yt, P):
        keep = [j for j in range(len(labels)) if 0 < Yt[:, j].sum() < len(Yt)]
        return float(np.mean([roc_auc_score(Yt[:, j], P[:, j]) for j in keep]))

    best, best_state = -1, None
    for ep in range(a.epochs):
        net.train()
        for i, b in enumerate(np.array_split(rng.permutation(len(Xtr)), (len(Xtr) + 127) // 128)):
            opt.zero_grad()
            l = lossf(net(torch.from_numpy(Xtr[b]).to(dev)), torch.from_numpy(Ytr[b]).to(dev))
            l.backward()
            opt.step()
            sched.step()
        auc = macro(Yva, predict(Xva))
        print(f'época {ep + 1}: AUC macro validación {auc:.4f}', flush=True)
        if auc > best:
            best, best_state = auc, {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)
    Pte = predict(Xte)
    per = {k: round(float(roc_auc_score(Yte[:, j], Pte[:, j])), 3) for j, k in enumerate(labels) if 0 < Yte[:, j].sum() < len(Yte)}
    torch.save({'state': best_state, 'labels': labels, 'auc_test_macro': macro(Yte, Pte), 'auc_test_per_label': per}, a.model)
    print(json.dumps({'labels': len(labels), 'auc_val': round(best, 4), 'auc_test_macro': round(macro(Yte, Pte), 4)}))


def presets(a):
    root = os.path.expanduser(a.data)
    ck = torch.load(a.model, weights_only=True)
    labels = ck['labels']
    net = ResNet1d(len(labels), width=64, stem_stride=1)
    net.load_state_dict(ck['state'])
    net.eval()
    # Umbral por etiqueta: el que maximiza F1 sería ideal; usamos la prevalencia
    # del pliegue 10 en los reales para calibrar el rango ("probable" si supera
    # el percentil 90 de los reales sin esa etiqueta).
    rows = [r for r in load_meta(root) if r['strat_fold'] == '10' and os.path.exists(os.path.join(root, 'ptb-xl', r['filename_lr'] + '.dat'))]
    X10 = load_x(root, rows)
    with torch.no_grad():
        P10 = torch.sigmoid(net(torch.from_numpy(X10))).numpy()
    neg90 = {k: float(np.percentile(P10[[k not in r['codes'] for r in rows], j], 99)) for j, k in enumerate(labels)}
    idx = json.load(open(os.path.join(a.catalog, 'index.json')))
    report = []
    for e in idx:
        x = np.fromfile(os.path.join(a.catalog, e['file']), dtype='<f4').reshape(-1, 12)[:5000].T
        x100 = decimate(x, 5, axis=1, zero_phase=True)[:, :1000].astype(np.float32)
        with torch.no_grad():
            p = torch.sigmoid(net(torch.from_numpy(x100[None]))).numpy()[0]
        top = sorted(zip(labels, p), key=lambda t: -t[1])[:4]
        exp = [k for k in EXPECTED.get(e['preset'], []) if k in labels]
        hit = [k for k in exp if p[labels.index(k)] > neg90[k]]
        report.append({'preset': e['preset'], 'esperado': exp, 'reconocido': hit,
                       'p_esperado': {k: round(float(p[labels.index(k)]), 3) for k in exp},
                       'top': [(k, round(float(v), 3)) for k, v in top]})
    ok = sum(1 for r in report if r['reconocido'])
    out = {'auc_test_macro_reales': round(ck['auc_test_macro'], 4), 'presets_reconocidos': ok, 'presets_evaluables': sum(1 for r in report if r['esperado']), 'detalle': report}
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(f"Reconocidos {ok}/{out['presets_evaluables']}")
    for r in report:
        print(f"  {r['preset']:<16} {'✓' if r['reconocido'] else '✗'} esperado {r['p_esperado']}  top {r['top']}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['train', 'presets'])
    ap.add_argument('--data', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--catalog')
    ap.add_argument('--out')
    ap.add_argument('--epochs', type=int, default=25)
    a = ap.parse_args()
    train(a) if a.cmd == 'train' else presets(a)
