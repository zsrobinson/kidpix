"""Verify Mac MBTN75 rows4..11, registrations and existing media read-only.

Parses complete source programs independently of production metadata and compares
the compact fixture without exporting artwork or running an original executable."""
import sys,struct,json,hashlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
import argparse
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--resources',required=True,type=Path)
p.add_argument('--media',required=True,type=Path)
args=p.parse_args()
sys.path.insert(0,str(ROOT/'scripts/secondary-motion'))
from portable_source import installer_reader,load_ui
H=lambda b:hashlib.sha256(b).hexdigest()
resources=args.resources
raw=installer_reader(resources)('Data/Easel.MHK')
assert H(raw)=='6ed6b36a445cb61c5b26e0f9436bcdb55d2cc9c2539af3e4437134fcad6bfd6c'
ui=load_ui();a=ui.mohawk(raw);bank=a[b'tBMH',1000]
out={'macEaselSha256':H(raw),'resourceHashes':{str(k):H(a[k]) for k in [(b'MBTN',75),(b'REGS',1000),(b'REGS',1001),(b'tBMH',1000)]},'buttons':[],'scripts':{},'mediaKeys':['ui/ui.json','ui/button-animations.json','ui/easel-1001.wav','ui/easel-1002.wav']}
names=['mixer','grab','eraser','text','stamp','draw','paint','fill']
starts=[1021,1030,1033,1027,1024,1012,1015,1018]
# Expectation is raw bytes and interpreter contract, never the production manifest.
for row,(name,start) in enumerate(zip(names,starts),4):
 w=list(struct.unpack_from('>16H',a[b'MBTN',75],row*32));assert w[:5]==[start,start+1,start+1,start+1,1];assert w[10:15]==[start+2,1,0,0,1]
 b={'row':row,'name':name,'rawWords':w,'rowSha256':H(a[b'MBTN',75][row*32:(row+1)*32]),'initialBounds':{}}
 for sid in range(start,start+3):
  p=a[b'tSCR',sid];assert struct.unpack_from('>H',p,2)[0]==1000
  origin=struct.unpack_from('>hh',p,16);assert p[26:30]==bytes.fromhex('04040064');pos=30;cues=[]
  if p[pos:pos+2]==b'\x03\x06':
   sound,ch=struct.unpack_from('>HH',p,pos+2);cues=[{'tick':0,'index':sound,'sound':1000+sound,'channel':ch}];pos+=6
  groups=[];frames=[]
  while p[pos:pos+2]==b'\x10\x01':
   rid,x,y=struct.unpack_from('>Hhh',p,pos+2);pos+=8;assert rid&0xf000==0x8000
   num=rid&0xfff;rx=struct.unpack_from('>h',a[b'REGS',1000],num*2)[0];ry=struct.unpack_from('>h',a[b'REGS',1001],num*2)[0]
   im=ui.sprite(bank,num-1);left=origin[0]+x-rx;top=origin[1]+y-ry
   groups.append({'tick':len(groups),'rawImage':rid,'image':num,'sourceXY':[x,y],'registrationXY':[rx,ry],'boundsLTRB':[left,top,left+im.width,top+im.height]});frames.append((left,top,im))
   assert p[pos:pos+2]==b'\x01\x02';pos+=2
  assert p[pos:]==b'\x00\x02';assert len(groups)==(4 if sid==start+2 else 3)
  l=min(f[0] for f in frames);t=min(f[1] for f in frames);r=max(x+im.width for x,y,im in frames);bt=max(y+im.height for x,y,im in frames);rect=[l,t,r-l,bt-t];hashes=[]
  for i,(x,y,im) in enumerate(frames):
   expected=Image.new('RGBA',(r-l,bt-t));expected.alpha_composite(im,(x-l,y-t));key=f'ui/button-animations/{sid}-{i}.png';actual=Image.open(args.media/key).convert('RGBA')
   assert actual.size==expected.size and actual.tobytes()==expected.tobytes(),key
   hashes.append(H(expected.tobytes()));out['mediaKeys'].append(key)
  out['scripts'][str(sid)]={'rawSha256':H(p),'originXY':origin,'rectXYWH':rect,'groups':groups,'tickMs':100,'waitTicks':[1]*(len(groups)-1)+[0],'endCheckTick':len(groups),'sounds':cues,'rgbaSha256':hashes}
  b['initialBounds'][str(sid)]=groups[0]['boundsLTRB']
 b['hitBoundsLTRB']=b['initialBounds'][str(start+2)]
 # Static importer indices are zero-based. Compare selected sprite and terminal source bitmap directly.
 static=ui.PAINT_BUTTONS[name];selected=ui.sprite(bank,static[5]) # Tracking terminal is compared separately below.
 track=out['scripts'][str(start+1)]['groups'][-1]['image'];trackImage=ui.sprite(bank,track-1)
 b['staticIndicesZeroBased']=static[2:];b['selectedStaticVsTrackingTerminal']={'staticImage':static[5]+1,'trackingTerminalImage':track,'rgbaEqual':selected.size==trackImage.size and selected.tobytes()==trackImage.tobytes()}
 out['mediaKeys'] += [f'ui/{name}-{i}.png' for i in range(4)]
 out['buttons'].append(b)
out['mediaKeys']=sorted(set(out['mediaKeys']))
out['mediaFiles']={key:{'size':(args.media/key).stat().st_size,'sha256':H((args.media/key).read_bytes())} for key in out['mediaKeys']}
assert json.loads(json.dumps(out)) == json.loads((ROOT/'tests/fixtures/tool-tab-motion-source.json').read_text())
print('Verified 8 raw rows, 24 complete programs, 80 RGBA frames and 116 media files.')
