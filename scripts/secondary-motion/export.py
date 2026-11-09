#!/usr/bin/env python3
"""Portable, additive secondary-control export from extracted installer resources."""
import argparse
import hashlib
from importlib import import_module
import json
from pathlib import Path
import struct
import sys
import wave

from portable_source import ROOT, installer_reader, load_ui
sys.path.insert(0, str(ROOT / 'scripts'))
buttons = import_module('button-animation')
drawing = import_module('native-drawing-motion')
decode = import_module('mohawk-script').decode_script
original = import_module('import-original')
sha = lambda data: hashlib.sha256(data).hexdigest()
TABLES = {18400: range(4,13), 18001: range(2), 18002: range(2), 18003: range(2),
          18200: range(3), 18201: range(3), 18202: range(3), 18203: range(2),
          18700: range(4), 9383: range(19), 926: range(2,12)}
SOURCE_HASH = '00e92bdce3a7aaf3b72b18a38928f163ba096e7a6c5a3371b5345a3df4482ae5'


def compile_manifest(archive):
    ui = load_ui()
    result = dict(version=1, source='Data/Tools/Tp.MHK', nativeRuntimeVerified=False,
                  renderMode='ordinary', tables={}, scripts={}, sprites={}, sounds={}, backdrops={})
    for table, rows in TABLES.items():
        records = buttons.button_records(archive[b'MBTN', table])
        chosen = []
        for row in rows:
            button = records[row]
            button['name'] = f'mbtn-{table}-row-{row}'
            button['commandArgument'] = button['rawWords'][8]
            if button['hotspotKind'] == 1:
                button['region'] = buttons.image_button_region(button, archive, ui.sprite)
            elif button['hotspotKind'] == 2:
                button['region'] = buttons.region_rectangles(archive[b'MRGN', button['hotspotResource']])
            else:
                raise ValueError('Unknown secondary hotspot kind')
            button['auxiliaryClipRect'] = button['region']['boundsXYWH'][:]
            # Preserve absent slots and unequal selected programs; no owner behavior inferred.
            chosen.append(button)
        result['tables'][str(table)] = dict(table=table, buttons=chosen, sourceSha256=sha(archive[b'MBTN',table]))
    ids = sorted({n for t in result['tables'].values() for b in t['buttons']
                  for n in [*b['stateScripts'], b['rolloverScript']] if n})
    for resource in ids:
        raw = archive[b'tSCR', resource]
        parsed = decode(raw)
        bank = parsed['collection']
        frames, cues, tick, interval = [], [], 0, None
        for event in parsed['events']:
            op = event['op']
            if op == 'interval':
                if interval is not None and interval != event['ms']:
                    raise ValueError('Variable interval')
                interval = event['ms']
            elif op == 'draw':
                parts = []
                for raw_id, x, y in event['images']:
                    if raw_id & 0xf000 not in (0, 0x8000):
                        raise ValueError('Unaudited secondary image flags')
                    number = raw_id & 0xfff
                    rx = struct.unpack_from('>h', archive[b'REGS',bank], number*2)[0]
                    ry = struct.unpack_from('>h', archive[b'REGS',bank+1], number*2)[0]
                    key = f'{bank}:{number}'
                    parts.append(dict(sprite=key, rawImage=raw_id, sourceXY=[x,y], registrationXY=[rx,ry],
                                      x=parsed['origin'][0]+x-rx, y=parsed['origin'][1]+y-ry))
                    if key not in result['sprites']:
                        w,h,pixels = drawing.argb_pixels(drawing.sprite_payload(archive[b'tBMH',bank],number))
                        stem = f'secondary-motion/sprites/{bank}-{number}'
                        result['sprites'][key] = dict(collection=bank, number=number, image=stem+'.png',
                                                      argb=stem+'.argb', width=w,height=h,argbSha256=sha(pixels))
                frames.append(dict(tick=tick, parts=parts))
            elif op == 'wait' and not event.get('terminal'):
                if not frames:
                    raise ValueError('Wait before draw')
                tick += 1
            elif op == 'sound':
                sound = bank + event['cue']
                result['sounds'][str(sound)] = dict(src=f'secondary-motion/sounds/{sound}.wav',
                                                    sourceSha256=sha(archive[b'tWAV',sound]))
                cues.append(dict(tick=tick,sound=sound,cue=event['cue'],channel=event['channel']))
        if not frames or interval is None:
            raise ValueError('Incomplete secondary program')
        parts = [p for f in frames for p in f['parts']]
        left,top = min(p['x'] for p in parts), min(p['y'] for p in parts)
        right = max(p['x']+result['sprites'][p['sprite']]['width'] for p in parts)
        bottom = max(p['y']+result['sprites'][p['sprite']]['height'] for p in parts)
        result['scripts'][str(resource)] = dict(script=resource,collection=bank,originXY=list(parsed['origin']),
            headerBoundsLTRB=list(struct.unpack_from('>4h',raw,16)),tickMs=interval,frames=frames,sounds=cues,
            endCheckTick=tick+1,boundsXYWH=[left,top,right-left,bottom-top],sourceSha256=sha(raw),
            events=parsed['events'])
    for clip in result['scripts'].values():
        for frame in clip['frames']:
            for part in frame['parts']:
                part['sprite'] = int(part['sprite'].split(':')[1])
    result['sourceHashes'] = {f'{tag.decode()}/{n}':sha(archive[tag,n]) for tag,n in archive
                              if tag in (b'REGS',b'tBMH')}
    return result


def write_payloads(archive, result, output):
    for sprite in result['sprites'].values():
        payload = drawing.sprite_payload(archive[b'tBMH',sprite['collection']],sprite['number'])
        w,h,pixels = drawing.argb_pixels(payload)
        extension,png,pw,ph = original.bitmap(payload)
        if extension != 'png' or (pw,ph) != (w,h):
            raise ValueError('Nonlossless sprite decode')
        for field,data in [('argb',pixels),('image',png)]:
            target = output / sprite[field]
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
        sprite['pngSha256'] = sha(png)
    for key,sound in result['sounds'].items():
        rate,channels,pcm = original.decode_sound(archive[b'tWAV',int(key)])
        path = output / sound['src']; path.parent.mkdir(parents=True,exist_ok=True)
        with wave.open(str(path),'wb') as stream:
            stream.setnchannels(channels); stream.setsampwidth(2); stream.setframerate(rate); stream.writeframes(pcm)
        sound.update(sampleRate=rate,channels=channels,sampleFrames=len(pcm)//(2*channels),sha256=sha(path.read_bytes()))


def export_backdrops(read, archive, result, output):
    """Source-compose full option pages, omitting both primary and secondary actors.

    Draw remains a separate chrome integration; it has no TRAYS recipe.
    """
    from PIL import Image
    ui = load_ui()
    easel = ui.mohawk(read('Data/Easel.MHK'))
    sources = {'Tp':archive, **{n:ui.mohawk(read(f'Data/Tools/{n}.MHK')) for n in ('Icons','Anims','Cyclic','CutRgns')}}
    controlled = set(map(int,result['scripts']))
    primary_tables = {18400:range(4),18000:range(3),18300:range(3),18600:range(2),18500:range(2),926:range(2)}
    for table,rows in primary_tables.items():
        for b in buttons.button_records(archive[b'MBTN',table]):
            if b['index'] in rows:
                controlled.update(n for n in [*b['stateScripts'],b['rolloverScript']] if n)
    for name,(programs,source,ids,start,columns) in ui.TRAYS.items():
        base = Image.new('RGBA',(1024,768))
        retained = [n for n in programs if n not in controlled] + [18034]
        for n in retained:
            ui.render_script(base,archive,n)
        ids = list(ids); pages=[]
        for row,first in enumerate(range(0,len(ids),columns or 1)):
            shown=base.copy()
            if row: ui.render_script(shown,archive,18028)
            if first+columns<len(ids): ui.render_script(shown,archive,18031)
            for offset,digit in enumerate(f'{row+1:02}'):
                shown.alpha_composite(ui.sprite(easel[b'tBMH',1000],74+int(digit)),(875+offset*17,676))
            for col,number in enumerate(ids[first:first+columns]):
                data=sources[source][b'tBMP',number]
                w,h,stride,flags=struct.unpack_from('>4H',data)
                if flags==2:
                    image=Image.new('RGBA',(w,h),'#0084f4')
                    image.putalpha(Image.frombytes('L',(w,h),data[8:],'raw','L',stride))
                else: image=ui.bitmap(data)
                x,y=start+col*63,660
                shown.alpha_composite(ui.sprite(archive[b'tBMH',18000],738),(x,y))
                shown.alpha_composite(image,(x+(56-w)//2,y+(56-h)//2))
            pages.append(shown)
        if not pages: pages=[base]
        entries=[]
        for i,image in enumerate(pages):
            path=f'secondary-motion/backdrops/{name}-{i+1}.png'
            target=output/path; target.parent.mkdir(parents=True,exist_ok=True)
            image.crop((113,608,930,776)).save(target)
            entries.append(dict(image=path,sha256=sha(target.read_bytes())))
        result['backdrops'][name]=dict(rect=[113,608,817,168],pages=entries,
            omittedScripts=[n for n in programs if n in controlled],retainedScripts=retained,
            requiresPrimaryActors=True)
    # Drawing's source panel base, without options, sizes or primary actors.
    base=Image.new('RGBA',(1024,768))
    for n in (18044,18034): ui.render_script(base,archive,n)
    path='secondary-motion/backdrops/draw-1.png'; target=output/path
    base.crop((113,608,930,776)).save(target)
    result['backdrops']['draw']=dict(rect=[113,608,817,168],pages=[dict(image=path,sha256=sha(target.read_bytes()))],
        retainedScripts=[18044,18034],omittedScripts=sorted({n for table in (18400,18200) for b in buttons.button_records(archive[b'MBTN',table]) for n in [*b['stateScripts'],b['rolloverScript']] if n}),
        requiresPrimaryActors=True,sourceRecipe='Tp panel18044 + shared chrome18034; overlay active Drawing and size table')
    # Stamp's library chrome has a distinct category selector recipe.
    base=Image.new('RGBA',(1024,768))
    for n in (18048,18034,18028,18031): ui.render_script(base,archive,n)
    for index,y in [(450,665),(453,665+ui.sprite(archive[b'tBMH',18000],450).height)]:
        base.alpha_composite(ui.sprite(archive[b'tBMH',18000],index),(329,y))
    path='secondary-motion/backdrops/stamps-1.png'; target=output/path
    base.crop((113,608,930,776)).save(target)
    result['backdrops']['stamps']=dict(rect=[113,608,817,168],pages=[dict(image=path,sha256=sha(target.read_bytes()))],
        omittedScripts=[18236,18053,18149,18144],retainedScripts=[18048,18034,18028,18031],requiresPrimaryActors=False,
        dynamicLibraryContent=True)


def export(resources, output):
    read=installer_reader(resources); ui=load_ui(); raw=read('Data/Tools/Tp.MHK')
    if sha(raw)!=SOURCE_HASH: raise ValueError('Unaudited Tp.MHK source hash')
    archive=ui.mohawk(raw)
    result=compile_manifest(archive); result['sourceSha256']=sha(raw)
    write_payloads(archive,result,output)
    export_backdrops(read,archive,result,output)
    path=output/'secondary-motion/manifest.json'
    path.write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('resources',type=Path,help='Extracted installer Contents/Resources directory')
    parser.add_argument('--output',type=Path,default=ROOT/'public/original/ui')
    args=parser.parse_args()
    result=export(args.resources,args.output)
    print(json.dumps({k:len(result[k]) for k in ('tables','scripts','sprites','sounds','backdrops')}))
