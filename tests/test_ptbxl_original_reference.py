import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('original',Path(__file__).resolve().parents[1]/'scripts/ptbxl-original-reference.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def header():
    return ('12667_hr 12 500 5000\n'+'\n'.join(f'12667_hr.dat 16 1000.0(0)/mV 16 0 0 0 0 {l}' for l in m.m.LEADS)+'\n').encode()

class OriginalCalibrationTests(unittest.TestCase):
    def test_explicit_original_domain(self):
        m.validate_original_header(header(),'records500/12000/12667_hr')
    def test_wrong_gain_unit_offset_format_and_length_are_not_repaired(self):
        for before,after in [(b'1000.0',b'1.0'),(b'/mV',b'/uV'),(b'(0)',b'(12)'),(b'.dat 16 ',b'.dat 32 '),(b'5000',b'600')]:
            with self.subTest(after=after),self.assertRaises(ValueError):m.validate_original_header(header().replace(before,after),'records500/12000/12667_hr')
    def test_identity_and_filename_must_match(self):
        for h in [header().replace(b'12667_hr 12',b'12668_hr 12'),header().replace(b'12667_hr.dat',b'other.dat')]:
            with self.assertRaises(ValueError):m.validate_original_header(h,'records500/12000/12667_hr')
    def test_metadata_path_is_restricted_and_identified(self):
        self.assertEqual(m.original_path({'filename_hr':'records500/12000/12667_hr'},12667),'records500/12000/12667_hr')
        for p in ['../12667_hr','records100/12000/12667_lr','records500/12000/12668_hr']:
            with self.assertRaises(ValueError):m.original_path({'filename_hr':p},12667)
    def test_range_keeps_physical_scale_and_sign(self):
        self.assertEqual(m.finite_range([-.4,0,.8]),1.2000000000000002)
        self.assertEqual(m.finite_range([0,0]),0)
        for a in [[],[None,1],[float('nan'),1],[float('inf'),0]]:
            with self.assertRaises(ValueError):m.finite_range(a)

if __name__=='__main__':unittest.main()
