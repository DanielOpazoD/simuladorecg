#!/usr/bin/env python3
"""Reuse PR19's frozen acquisition; select different temporal windows before evaluation."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
policy = json.loads((root/'benchmarks/hr-quality/protocol.json').read_text())
spec = importlib.util.spec_from_file_location('frozen_noise_reader', args.baseline/'scripts/prepare-noise-stress.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
original = json.loads(reader.PROTOCOL.read_text())
assert original['segmentStartsSeconds'] == policy['developmentStartsSeconds']
args.output.mkdir(parents=True, exist_ok=True)
(args.output/'hr-quality-protocol.json').write_text(json.dumps(policy, indent=2)+'\n')
# The original reader checks the product fingerprint against the BASELINE tree.
reader.prepare(args.output/'known')
replication = args.output/'replication'
replication.mkdir(exist_ok=True)
shutil.copytree(args.output/'known'/'raw', replication/'raw', dirs_exist_ok=True)
replication_protocol = args.output/'replication-acquisition-protocol.json'
replication_protocol.write_text(json.dumps({**original, 'segmentStartsSeconds': policy['replicationStartsSeconds']}, indent=2)+'\n')
reader.PROTOCOL = replication_protocol
reader.prepare(replication)
