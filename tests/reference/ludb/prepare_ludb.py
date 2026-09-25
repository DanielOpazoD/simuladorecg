#!/usr/bin/env python3
"""Reproduce a small, preselected LUDB 1.0.1 regression fixture.

Standard library only. No detector is run. Retains all 12 source signals and
annotations; copies no demographic or diagnosis comments to derived fixtures.
Source bytes are validated against PhysioNet's published SHA256SUMS.txt.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.request import urlopen

BASE = "https://physionet.org/files/ludb/1.0.1/"
PAGE = "https://physionet.org/content/ludb/1.0.1/"
LEADS = ["i", "ii", "iii", "avr", "avl", "avf", "v1", "v2", "v3", "v4", "v5", "v6"]
LABEL = {"i": "I", "ii": "II", "iii": "III", "avr": "aVR", "avl": "aVL", "avf": "aVF", **{f"v{i}": f"V{i}" for i in range(1, 7)}}
SPLITS = {"development": [1, 2, 3, 4], "control": [101, 102, 103, 104]}
SYMBOLS = {1: "N", 24: "p", 27: "t", 39: "(", 40: ")"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(path: str, raw: Path) -> bytes:
    dest = raw / path
    if dest.is_file():
        return dest.read_bytes()
    with urlopen(BASE + path, timeout=30) as response:
        body = response.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    return body


def annotations(data: bytes, *, preserve_unassigned: bool = False) -> dict:
    """Decode MIT WFDB annotation words with optional waveform boundaries.

    References: https://physionet.org/physiotools/wag/annot-5.htm and
    https://physionet.org/physiotools/wpg/wpg_36.htm .
    Fail closed on unknown codes. Default: fail on unassigned boundaries.
    Expansion mode preserves unassigned brackets as explicit audit events; it
    never invents a peak or attaches a nonadjacent boundary to a waveform.
    Some source wave peaks have no onset/offset; retain these as null, not inferred.
    """
    sample, pos, events = 0, 0, []
    while pos < len(data):
        if pos + 2 > len(data):
            raise ValueError("Truncated WFDB annotation word")
        word = int.from_bytes(data[pos:pos + 2], "little")
        pos += 2
        if word == 0:
            break
        code, delta = word >> 10, word & 1023
        if code == 59:
            if pos + 4 > len(data):
                raise ValueError("Truncated WFDB SKIP")
            high = int.from_bytes(data[pos:pos + 2], "little")
            low = int.from_bytes(data[pos + 2:pos + 4], "little")
            interval = (high << 16) | low
            if interval >= 2**31:
                interval -= 2**32
            sample += interval
            pos += 4
        elif code == 63:
            if pos + delta + delta % 2 > len(data):
                raise ValueError("Truncated WFDB auxiliary data")
            pos += delta + delta % 2
        elif code in (60, 61, 62):
            # Numeric/subtype/channel attributes do not change sample time.
            # Lead identity is explicitly given by the annotation suffix.
            continue
        else:
            sample += delta
            if code not in SYMBOLS:
                raise ValueError(f"Unexpected LUDB annotation code {code}")
            events.append({"sample": sample, "symbol": SYMBOLS[code]})
    waves, used = [], set()
    for i, peak in enumerate(events):
        if peak["symbol"] not in ("p", "N", "t"):
            continue
        used.add(i)
        onset = events[i - 1]["sample"] if i > 0 and events[i - 1]["symbol"] == "(" else None
        offset = events[i + 1]["sample"] if i + 1 < len(events) and events[i + 1]["symbol"] == ")" else None
        if onset is not None:
            used.add(i - 1)
        if offset is not None:
            used.add(i + 1)
        if (onset is not None and onset > peak["sample"]) or (offset is not None and offset < peak["sample"]):
            raise ValueError("Unordered LUDB waveform boundaries")
        waves.append({"wave": {"p": "P", "N": "QRS", "t": "T"}[peak["symbol"]], "onset": onset, "peak": peak["sample"], "offset": offset})
    unassigned = [{"eventIndex": i, **event} for i, event in enumerate(events) if i not in used]
    if unassigned and not preserve_unassigned:
        raise ValueError("Ambiguous/unassigned LUDB boundary; preserve and inspect source")
    result = {"waves": waves, "events": events}
    if preserve_unassigned:
        result["unassignedBoundaries"] = unassigned
    return result


def prepare(root: Path, *, preserve_unassigned: bool = False) -> None:
    raw, out = root / "raw", root / "fixtures"
    raw.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    checksum_bytes = fetch("SHA256SUMS.txt", raw)
    source_sums = {}
    for line in checksum_bytes.decode().splitlines():
        digest, name = line.split(maxsplit=1)
        source_sums[name.lstrip("*")] = digest
    license_bytes = fetch("LICENSE.txt", raw)
    paths = [f"data/{record}.{ext}" for records in SPLITS.values() for record in records for ext in ["hea", "dat", *LEADS]]
    with ThreadPoolExecutor(max_workers=8) as pool:
        bodies = dict(zip(paths, pool.map(lambda path: fetch(path, raw), paths)))
    for path, body in bodies.items():
        if sha(body) != source_sums.get(path):
            raise ValueError(f"SHA256 differs from PhysioNet manifest: {path}")
    if sha(license_bytes) != source_sums["LICENSE.txt"]:
        raise ValueError("License checksum mismatch")
    (out / "LICENSE-LUDB.txt").write_bytes(license_bytes)
    manifest = {
        "schemaVersion": 1,
        "dataset": "Lobachevsky University Electrocardiography Database",
        "version": "1.0.1",
        "source": PAGE,
        "doi": "https://doi.org/10.13026/eegm-h675",
        "license": "Open Data Commons Attribution License v1.0",
        "licenseUrl": "https://physionet.org/content/ludb/view-license/1.0.1/",
        "licenseFile": "LICENSE-LUDB.txt",
        "officialManifestSha256": sha(checksum_bytes),
        "selection": "Frozen by record ID before detector evaluation; development 1–4, control 101–104. Convenience regression subset, not a representative clinical cohort.",
        "splits": SPLITS,
        "records": [],
    }
    for split, records in SPLITS.items():
        for record in records:
            prefix = f"data/{record}"
            header = bodies[prefix + ".hea"].decode()
            lines = [line for line in header.splitlines() if line and not line.startswith("#")]
            rec, channels, frequency, count = lines[0].split()[:4]
            channels, frequency, count = int(channels), int(frequency), int(count)
            if (rec, channels, frequency, count) != (str(record), 12, 500, 5000):
                raise ValueError(f"Unexpected LUDB dimensions in record {record}")
            samples = struct.unpack("<" + "h" * (channels * count), bodies[prefix + ".dat"])
            calibration, wave_annotations, raw_events, unassigned = [], {}, {}, {}
            for channel, line in enumerate(lines[1:13]):
                parts = line.split()
                if parts[0] != f"{record}.dat" or parts[1] != "16":
                    raise ValueError("This fixture converter supports LUDB format 16 only")
                gain_match = re.fullmatch(r"([\d.]+)\((-?\d+)\)/mV", parts[2])
                if not gain_match:
                    raise ValueError("Unexpected LUDB physical scaling")
                gain, baseline = float(gain_match[1]), int(gain_match[2])
                lead = parts[8]
                if lead != LEADS[channel]:
                    raise ValueError("Unexpected source channel order")
                values = samples[channel::channels]
                checksum = (sum(values) + 32768) % 65536 - 32768
                if checksum != int(parts[6]) or values[0] != int(parts[5]):
                    raise ValueError(f"WFDB signal checksum/initial value differs: {record}/{lead}")
                calibration.append({"lead": LABEL[lead], "adcGain": gain, "baseline": baseline, "unit": "mV"})
                annotation = annotations(bodies[prefix + "." + lead], preserve_unassigned=preserve_unassigned)
                wave_annotations[LABEL[lead]] = annotation["waves"]
                raw_events[LABEL[lead]] = annotation["events"]
                if preserve_unassigned:
                    unassigned[LABEL[lead]] = annotation["unassignedBoundaries"]
            meta = {
                "record": str(record), "split": split, "fs": frequency, "samples": count,
                "channels": calibration, "signalFile": f"{record}.dat", "signalFormat": "WFDB 16: interleaved signed int16 little-endian",
                "physicalValue": "mV = (digitalSample - baseline) / adcGain",
                "annotations": wave_annotations,
                "annotationEvents": raw_events,
                "missingBoundaryPolicy": "Missing source boundaries remain null; never inferred from samples or other waves.",
                "annotationUnits": "integer sample indices at 500 Hz",
                "sourceFiles": [{"path": f"{record}.{ext}", "url": BASE + prefix + "." + ext, "sha256": sha(bodies[prefix + "." + ext])} for ext in ["hea", "dat", *LEADS]],
            }
            if preserve_unassigned:
                meta["unassignedBoundaryEvents"] = unassigned
                meta["unassignedBoundaryPolicy"] = "Retained verbatim with indices; no missing wave/peak inferred. Not used as reference fiducials."
            target = out / split
            target.mkdir(parents=True, exist_ok=True)
            (target / f"{record}.dat").write_bytes(bodies[prefix + ".dat"])
            (target / f"{record}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
            manifest["records"].append({"record": str(record), "split": split, "metadata": f"{split}/{record}.json", "metadataSha256": sha((target / f"{record}.json").read_bytes()), "signal": f"{split}/{record}.dat", "signalSha256": sha(bodies[prefix + ".dat"])})
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"fixtures": str(out), "records": len(manifest["records"]), "sourceFilesValidated": len(bodies), "signalAndAnnotationChecks": "passed", "detectorEvaluated": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    prepare(parser.parse_args().root)
