"""Fail-closed source boundary for the isolated NORMAL export."""
import importlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class StampEditorSourceTests(unittest.TestCase):
    def test_unknown_archive_rejected_before_any_export(self):
        exporter = importlib.import_module('native-stamp-editor')
        def unexpected(*args):
            self.fail('unknown source reached decoding')
        modules = {'import-ui': SimpleNamespace(mohawk=unexpected),
                   'mohawk-script': SimpleNamespace(decode_script=unexpected)}
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / 'not-created'
            with patch.object(exporter, 'import_module', side_effect=modules.__getitem__):
                with self.assertRaisesRegex(ValueError, 'Unsupported StampEd source'):
                    exporter.export_stamp_editor(lambda name: b'future source', output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
