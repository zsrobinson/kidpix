#!/usr/bin/env python3
"""Independent raw-byte/registration and source-composition category oracle."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image
from portable_source import installer_reader, load_ui
sha=lambda data:hashlib.sha256(data).hexdigest()

def assert_source(archive,m,f):
    for section in ('tables','scripts','sprites'):
        for key,value in f[section].items():
            actual=json.loads(json.dumps(m[section][key]))
            assert all(actual[k]==v for k,v in value.items() if k!='pngSha256'), (section,key)
    for key,program in f['rawPrograms'].items():
        assert archive[b'tSCR',int(key)].hex()==program['hex']

def check(resources, media, fixture):
    f=json.loads(fixture.read_text());ui=load_ui();read=installer_reader(resources)
    raw=read('Data/Tools/Tp.MHK');assert sha(raw)==f['sourceSha256'];a=ui.mohawk(raw)
    spec=importlib.util.spec_from_file_location('category_export',Path(__file__).with_name('export.py'))
    e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
    m=e.compile_manifest(a)
    assert_source(a,m,f)
    staged=json.loads((media/'ui/secondary-motion/manifest.json').read_text())
    backdrop=staged['backdrops']['library-category'];clean=Image.open(media/'ui'/backdrop['pages'][0]['image']).convert('RGBA')
    groups=0;reds=0
    for name,(base,start,columns,tabs,controls) in ui.LIBRARY_TRAYS.items():
        if name=='stamps':continue
        source=Image.new('RGBA',(1024,768))
        for n in [base,18034,18028,18031,*tabs.values(),*controls.values(),18289,18037]:ui.render_script(source,a,n)
        expected=source.crop((320,690,363,752));assert expected.tobytes()==clean.tobytes(),name
        dirty=source.copy()
        for number,xy in [(450,(320,690)),(453,(320,721))]:dirty.alpha_composite(ui.sprite(a[b'tBMH',18000],number),xy)
        dirty=dirty.crop((320,690,363,752))
        for key,p in f['rawPrograms'].items():
            for group in p['groups']:
                want=expected.copy();got=clean.copy();bad=dirty.copy()
                for part in group['parts']:
                    x,y,w,h=part['rect'];xy=(x-320,y-690)
                    source_sprite=ui.sprite(a[b'tBMH',18000],part['sprite']-1)
                    image=Image.open(media/'ui'/f['sprites'][f"18000:{part['sprite']}"]['image']).convert('RGBA')
                    assert sha(source_sprite.tobytes())==part['rgbaSha256']
                    want.alpha_composite(source_sprite,xy);got.alpha_composite(image,xy);bad.alpha_composite(image,xy)
                assert want.tobytes()==got.tobytes(),(name,key,group['tick'])
                assert bad.tobytes()!=want.tobytes(),('old baked background control',name,key)
                reds+=1
        groups+=len([g for p in f['rawPrograms'].values() for g in p['groups']])
    return dict(sourceGroups=10,profileGroups=groups,oldBakedRedControls=reds,recipes=backdrop['recipes'])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('resources',type=Path);p.add_argument('media',type=Path);p.add_argument('fixture',type=Path)
    a=p.parse_args();print(json.dumps(check(a.resources,a.media,a.fixture),indent=2))
