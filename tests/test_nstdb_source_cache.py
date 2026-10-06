import hashlib
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import sys
import json
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cache', Path(__file__).resolve().parents[1] / 'scripts/nstdb-source-cache.py')
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.target = self.root / 'target'
        lines = []
        for name in cache.FILES:
            data = ('independent fixture ' + name).encode()
            (self.source / name).write_bytes(data)
            lines.append(hashlib.sha256(data).hexdigest() + '  ' + name)
        self.manifest = ('\n'.join(lines)+'\n').encode()
        (self.source / 'SHA256SUMS.txt').write_bytes(self.manifest)
        self.patch = patch.object(cache, 'MANIFEST_SHA256', hashlib.sha256(self.manifest).hexdigest())
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_verified_bytes_only(self):
        (self.source / 'evaluation.json').write_text('must not be staged')
        result = cache.stage(self.source, self.target)
        self.assertEqual(result['files'], 7)
        self.assertEqual(set(p.name for p in self.target.iterdir()), {'SHA256SUMS.txt', *cache.FILES})
        for path in self.target.iterdir():
            self.assertEqual(path.read_bytes(), (self.source/path.name).read_bytes())

    def test_corrupt_last_file_writes_nothing(self):
        (self.source / cache.FILES[-1]).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            cache.stage(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_corrupt_manifest_rejected(self):
        (self.source / 'SHA256SUMS.txt').write_bytes(b'replacement manifest')
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            cache.stage(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_incomplete_cache_rejected(self):
        (self.source / cache.FILES[0]).unlink()
        with self.assertRaises(FileNotFoundError):
            cache.stage(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_source_symlink_rejected(self):
        file = self.source / cache.FILES[0]
        data = file.read_bytes(); file.unlink()
        external = self.root/'external'; external.write_bytes(data); file.symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            cache.stage(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_destination_symlink_does_not_modify_target(self):
        self.target.mkdir(); victim = self.root/'victim'; victim.write_text('preserved')
        (self.target / cache.FILES[-1]).symlink_to(victim)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            cache.stage(self.source, self.target)
        self.assertEqual(victim.read_text(), 'preserved')
        self.assertFalse((self.target/'SHA256SUMS.txt').exists())


    def test_cli_missing_cache_is_explicit_cold_acquisition(self):
        result = subprocess.run([sys.executable, str(Path(cache.__file__)), 'restore', '--cache', str(self.root/'missing'), '--raw', str(self.target)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['status'], 'cold-acquisition')
        self.assertFalse(self.target.exists())

    def test_cli_save_never_accepts_an_unpinned_manifest(self):
        raw = self.root/'raw'; raw.mkdir(); (raw/'nstdb').mkdir()
        (raw/'nstdb'/'SHA256SUMS.txt').write_bytes(self.manifest)
        result = subprocess.run([sys.executable, str(Path(cache.__file__)), 'save', '--cache', str(self.target), '--raw', str(raw)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('fingerprint mismatch', result.stderr)
        self.assertFalse(self.target.exists())

if __name__ == '__main__':
    unittest.main()
