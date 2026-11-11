#!/usr/bin/env python3
"""Export in an owned directory, prove old records/bytes unchanged, retain delta only."""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('secondary_export', Path(__file__).with_name('export.py'))
e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)

def stage(resources, original, output):
    if output.resolve().is_relative_to(original.resolve()):
        raise ValueError('Staging must not be inside originals')
    if output.exists(): raise ValueError('Use a new owned output directory')
    new = json.loads(json.dumps(e.export(resources, output / 'ui')))
    old = json.loads((original / 'ui/secondary-motion/manifest.json').read_text())
    sections = ('tables','scripts','sprites','sounds','backdrops','sourceHashes')
    for key,value in old.items():
        if key not in sections and new.get(key) != value: raise ValueError(f'Changed old metadata {key}')
    for section in sections:
        for key, value in old[section].items():
            if new[section].get(key) != value: raise ValueError(f'Changed old record {section}:{key}')
    delta = []
    for path in sorted(output.rglob('*')):
        if not path.is_file(): continue
        key = path.relative_to(output).as_posix(); data = path.read_bytes(); prior = original / key
        if prior.exists() and prior.read_bytes() == data:
            path.unlink(); continue
        if prior.exists() and key != 'ui/secondary-motion/manifest.json':
            raise ValueError(f'Changed old payload {key}')
        delta.append(dict(key=key,size=len(data),sha256=e.sha(data),kind='changed' if prior.exists() else 'new'))
    receipt = dict(sourceSha256=new['sourceSha256'], objects=delta,
        addedRecords={section:sorted(set(new[section])-set(old[section])) for section in ('tables','scripts','sprites','sounds','backdrops')})
    (output.parent/'export-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('resources',type=Path);p.add_argument('original',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args(); print(json.dumps(stage(a.resources,a.original,a.output),indent=2))
