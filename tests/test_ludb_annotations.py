"""Independent byte fixtures for source annotation conversion, not ECG accuracy."""
import importlib.util
from pathlib import Path
import unittest
P = Path(__file__).parent / 'reference/ludb/prepare_ludb.py'
spec = importlib.util.spec_from_file_location('reader', P)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def words(events):
    last, out = 0, bytearray()
    for sample, code in events:
        out += ((code << 10) | (sample - last)).to_bytes(2, 'little')
        last = sample
    return bytes(out) + b'\x00\x00'


class AnnotationTests(unittest.TestCase):
    def test_complete_wave_preserved(self):
        self.assertEqual(reader.annotations(words([(100,39),(120,1),(150,40)]))['waves'],
                         [{'wave':'QRS','onset':100,'peak':120,'offset':150}])

    def test_orphan_retained_not_a_fabricated_wave(self):
        data=words([(50,40),(100,39),(120,1),(150,40),(200,39)])
        with self.assertRaises(ValueError): reader.annotations(data)
        r=reader.annotations(data,preserve_unassigned=True)
        self.assertEqual(len(r['events']),5)
        self.assertEqual(len(r['waves']),1)
        self.assertEqual(r['unassignedBoundaries'],[
            {'eventIndex':0,'sample':50,'symbol':')'},
            {'eventIndex':4,'sample':200,'symbol':'('}])

    def test_missing_boundaries_remain_null(self):
        r=reader.annotations(words([(100,1),(200,24)]),preserve_unassigned=True)
        self.assertTrue(all(w['onset'] is None and w['offset'] is None for w in r['waves']))
        self.assertEqual(r['unassignedBoundaries'],[])

    def test_nonadjacent_boundary_is_not_attached(self):
        r=reader.annotations(words([(100,39),(110,39),(130,1),(150,40)]),preserve_unassigned=True)
        self.assertEqual(r['waves'][0]['onset'],110)
        self.assertEqual(r['unassignedBoundaries'][0]['sample'],100)

    def test_unknown_code_still_fails(self):
        with self.assertRaises(ValueError): reader.annotations(words([(100,2)]),preserve_unassigned=True)

    def test_truncated_input_still_fails(self):
        for data in (b'\x01', (59<<10).to_bytes(2,'little')+b'\x00', ((63<<10)|4).to_bytes(2,'little')+b'aa'):
            with self.assertRaises(ValueError): reader.annotations(data,preserve_unassigned=True)

    def test_skip_does_not_create_a_wave(self):
        skip=(59<<10).to_bytes(2,'little') + b'\x00\x00\x88\x13'  # 5000 samples
        r=reader.annotations(skip+words([(10,1)]))
        self.assertEqual(r['events'],[{'sample':5010,'symbol':'N'}])


if __name__ == '__main__': unittest.main()
