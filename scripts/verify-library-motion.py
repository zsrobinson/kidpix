"""Verify existing library PNGs against Mac installer programs in memory.

No original executable is run, and no original artwork is exported or changed.
Uses the shared read-only archive/bitmap codecs, independently parses these twelve
small programs rather than using the animation exporter or production manifest.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent / 'secondary-motion'))
from portable_source import installer_reader, load_ui


def verify(resources, media):
    raw = installer_reader(resources)('Data/Easel.MHK')
    assert hashlib.sha256(raw).hexdigest() == '6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c'
    ui = load_ui()
    archive = ui.mohawk(raw)
    rows = [struct.unpack_from('>16H', archive[b'MBTN', 75], i * 32) for i in range(4)]
    assert [r[:7] for r in rows] == [(1003,1004,1004,1004,2,1003,222),(1006,1007,1007,1007,2,1006,223),(1000,1001,1001,1001,2,375,224),(1009,1010,1010,1010,2,1009,225)]
    regions = {375:(34,18,113,61),1003:(41,90,120,133),1006:(45,155,127,198),1009:(17,226,101,269)}
    for rid, bounds in regions.items():
        region=archive[b'MRGN',rid]
        assert region[:4] == b'RGN ' and len(region) == 24
        assert struct.unpack_from('>4h2H4h',region,4) == (*bounds,1,1,*bounds)
    assert all(r[10:15] == (r[0]+2,1,0,0,1) for r in rows)
    rects = [[27,15,105,61],[36,85,91,55],[38,148,106,70],[14,222,103,67]]
    sprites = [[3,2,3],[2,1,2],[4,3,5,3],[6,7,8],[7,6,7],[9,8,10,8],[11,12,13],[12,11,12],[14,13,15,13],[16,17,18],[17,16,17],[19,18,20,18]]
    result = {'macEaselSha256': hashlib.sha256(raw).hexdigest(), 'scripts': {}}
    keys = ['ui/ui.json','ui/button-animations.json','ui/easel-1000.wav']
    keys += [f'ui/{name}-{i}.png' for name in ['backgrounds','stickers','animations','media'] for i in range(4)]
    for sid in range(1000,1012):
        program = archive[b'tSCR',sid]
        assert struct.unpack_from('>H',program,2)[0] == 1000
        origin = struct.unpack_from('>hh',program,16)
        assert program[26:30] == bytes.fromhex('04040064')
        p=30
        sounds=[]
        if sid%3 == 2: #1001,1004,... tracking
            assert program[p:p+6] == bytes.fromhex('030600000001')
            sounds=[{'tick':0,'sound':1000,'channel':1}]; p+=6
        groups=[]; ids=[]
        while program[p:p+2] == b'\x10\x01':
            image,x,y=struct.unpack_from('>Hhh',program,p+2);p+=8
            assert image & 0x8000
            image &= 0x7fff;ids.append(image)
            x+=origin[0]-struct.unpack_from('>h',archive[b'REGS',1000],image*2)[0]
            y+=origin[1]-struct.unpack_from('>h',archive[b'REGS',1001],image*2)[0]
            bitmap=ui.sprite(archive[b'tBMH',1000],image-1)
            groups.append((x,y,bitmap))
            assert program[p:p+2] == b'\x01\x02';p+=2
        assert program[p:] == b'\x00\x02'
        assert ids == sprites[sid-1000]
        left=min(x for x,y,b in groups);top=min(y for x,y,b in groups)
        rect=[left,top,max(x+b.width for x,y,b in groups)-left,max(y+b.height for x,y,b in groups)-top]
        assert rect == rects[(sid-1000)//3]
        hashes=[]
        for i,(x,y,b) in enumerate(groups):
            image=Image.new('RGBA',tuple(rect[2:]));image.alpha_composite(b,(x-left,y-top))
            key=f'ui/button-animations/{sid}-{i}.png';keys.append(key)
            actual=Image.open(media/key).convert('RGBA')
            assert actual.size == image.size and actual.tobytes() == image.tobytes(), key
            hashes.append(hashlib.sha256(image.tobytes()).hexdigest())
        result['scripts'][sid]={'rect':rect,'ids':ids,'tickMs':100,'ticks':[1]*(len(groups)-1)+[0],'endCheckTick':len(groups),'sounds':sounds,'rgbaSha256':hashes,'rawSha256':hashlib.sha256(program).hexdigest()}
    result['mediaKeys']=keys
    return result

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resources',required=True,type=Path)
    parser.add_argument('--media',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(verify(args.resources,args.media),indent=2))
