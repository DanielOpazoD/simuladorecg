#!/usr/bin/env python3
"""Optional independent format cross-check; requires wfdb==4.3.1 and numpy.

Run after prepare_ludb.py. This compares decoding only, never detector output.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import wfdb
import prepare_ludb as converter


def verify(root):
    records = channels = event_count = 0
    for split, ids in converter.SPLITS.items():
        for rec in ids:
            meta = json.loads((root / f"fixtures/{split}/{rec}.json").read_text())
            original = wfdb.rdrecord(str(root / f"raw/data/{rec}"))
            raw = np.fromfile(root / f"fixtures/{split}/{rec}.dat", dtype="<i2").reshape(5000, 12)
            for i, channel in enumerate(meta["channels"]):
                decoded = (raw[:, i].astype(float) - channel["baseline"]) / channel["adcGain"]
                assert np.array_equal(decoded, original.p_signal[:, i]), (rec, "scaling", i)
                ann = wfdb.rdann(str(root / f"raw/data/{rec}"), converter.LEADS[i])
                actual = [{"sample": int(s), "symbol": str(y)} for s, y in zip(ann.sample, ann.symbol)]
                assert actual == meta["annotationEvents"][channel["lead"]], (rec, "annotations", i)
                channels += 1
                event_count += len(actual)
            records += 1
    report = {
        "referenceReader": f"WFDB Python {wfdb.__version__}",
        "records": records,
        "channels": channels,
        "annotationEventsMatched": event_count,
        "physicalSamplesCompared": records * 12 * 5000,
        "sampleAgreement": "exact float64 before Float32 conversion",
        "annotationAgreement": "exact symbols and sample indices",
        "detectorEvaluated": False,
    }
    (root / "reader-crosscheck.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    verify(parser.parse_args().root)
