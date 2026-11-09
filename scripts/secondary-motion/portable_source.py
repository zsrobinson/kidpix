"""Read the original installer on Linux without executing its application."""
import ast
from functools import lru_cache
from pathlib import Path
import types
import zlib

ROOT = Path(__file__).resolve().parents[2]


def load_ui():
    """Reuse unchanged UI codecs, excluding only the Foundation-only reader.

    AST selection avoids fake Foundation modules or changing the shared importer.
    No import-time export or command-line entrypoint is executed.
    """
    path = ROOT / 'scripts/import-ui.py'
    tree = ast.parse(path.read_text(), filename=str(path))
    tree.body = [node for node in tree.body
                 if not (isinstance(node, ast.ImportFrom) and node.module == 'Foundation')
                 and not (isinstance(node, ast.FunctionDef) and node.name == 'app_resources')
                 and not isinstance(node, ast.If)]
    module = types.ModuleType('secondary_source_ui')
    module.__file__ = str(path)
    exec(compile(tree, str(path), 'exec'), module.__dict__)
    return module


def plain(value):
    if hasattr(value, 'contents'):
        return {plain(k): plain(v) for k, v in value.contents.items()}
    if hasattr(value, 'elements'):
        return [plain(item) for item in value.elements]
    if hasattr(value, 'data'):
        return value.data
    if hasattr(value, 'value'):
        return value.value
    if value is None or isinstance(value, (str, int, float, bytes)):
        return value
    raise ValueError(f'Unsupported installer index value {type(value)}')


def installer_reader(resources):
    import typedstream
    resources = Path(resources)
    index = plain(typedstream.unarchive_from_data(zlib.decompress((resources / 'Archive.zplist').read_bytes())))
    app = next(task for task in index['YAAllTasksRepresentationsKey']
               if task['kInstallSubpathKey'] == 'Kid Pix Deluxe 3D.app')
    key = app['PluginClassProperties']['YAPluginClassUniquieKey']
    files = {f['EntryPath']: f for f in index['YAAllObjectsPropertiesKey'][key]['FilesList']}

    @lru_cache
    def read(path):
        entry = files[path if path.startswith('Contents/') else 'Contents/Resources/' + path]
        fork = next(f for f in entry['Forks'] if not f['ForkName'])
        chunks = []
        with (resources / 'Archive.zp').open('rb') as stream:
            for segment in fork['Segments']:
                offset, length = int(segment['OffsLO']), int(segment['Length'])
                if segment.get('OffsHI', 0) or offset < 0 or length < 9:
                    raise ValueError('Unsupported installer segment')
                stream.seek(offset)
                packed = stream.read(length)
                if len(packed) != length:
                    raise ValueError('Truncated installer payload')
                chunks.append(zlib.decompress(packed) if packed[-9] else packed[:-9])
        result = b''.join(chunks)
        if len(result) != entry['Attributes']['NSFileSize']:
            raise ValueError(f'Installer file size mismatch: {path}')
        return result
    return read
