"""Independent audit pins and actual installer roundtrip checks for secondary export."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('secondary_export',Path(__file__).with_name('export.py'))
exporter=importlib.util.module_from_spec(spec); spec.loader.exec_module(exporter)
ROOT=exporter.ROOT
ART=Path(os.environ.get('KIDPIX_SECONDARY_INPUTS', ROOT/'artifacts/t3/secondary-motion'))
MEDIA=Path(os.environ.get('KIDPIX_SECONDARY_MEDIA', ROOT/'public/original'))


class Fixtures(unittest.TestCase):
    def test_missing_end_rejected(self):
        with self.assertRaisesRegex(ValueError,'Missing tSCR end'):
            exporter.decode(bytes(26)+b'\x04\x04\x00\x64')

    def test_unknown_opcode_rejected(self):
        with self.assertRaisesRegex(ValueError,'Unsupported tSCR command'):
            exporter.decode(bytes(26)+b'\xfe\x02')

    def test_terminal_wait_is_not_tick(self):
        raw=bytearray(26)
        raw.extend(b'\x04\x04\x00\x64\x10\x01'+struct.pack('>Hhh',0x8001,0,0)+b'\x01\x02\x00\x02')
        self.assertTrue(exporter.decode(raw)['events'][-1]['terminal'])

    def test_malformed_region_rejected(self):
        with self.assertRaises(ValueError): exporter.buttons.region_rectangles(b'RGN '+bytes(12))


@unittest.skipUnless((ART/'inputs/Tp.MHK').exists(),'separate installer extraction absent')
class Source(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw=(ART/'inputs/Tp.MHK').read_bytes()
        assert exporter.sha(raw)==exporter.SOURCE_HASH
        cls.archive=exporter.load_ui().mohawk(raw)
        cls.manifest=exporter.compile_manifest(cls.archive)
        cls.oracle=json.loads(Path(os.environ.get('KIDPIX_SECONDARY_ORACLE',ROOT/'artifacts/t3/tool-motion-coverage/source-oracles.json')).read_text())
        category=json.loads((ROOT/'tests/fixtures/library-category-source.json').read_text())
        cls.oracle['tables']['18901']={b['index']:b for b in category['tables']['18901']['buttons']}
        cls.oracle['scripts'].update({k:{**v,'sha256':v['sourceSha256']} for k,v in category['scripts'].items()})

    def test_all_table_words_match_preexisting_audit(self):
        for key,table in self.manifest['tables'].items():
            for b in table['buttons']:
                self.assertEqual(b['rawWords'],self.oracle['tables'][key][b['index']]['rawWords'])

    def test_all_programs_match_preexisting_audit(self):
        for key,clip in self.manifest['scripts'].items():
            with self.subTest(script=key):
                old=self.oracle['scripts'][key]
                self.assertEqual(clip['sourceSha256'],old['sha256'])
                self.assertEqual(clip['frames'],old['frames'])
                self.assertEqual(clip['endCheckTick'],old['endCheckTick'])
                self.assertEqual(clip['sounds'],old['sounds'])

    def test_category_raw_mutations_fail_independent_pins(self):
        from check_category_source import assert_source
        fixture=json.loads((ROOT/'tests/fixtures/library-category-source.json').read_text())
        assert_source(self.archive,self.manifest,fixture)
        for mutation in ('slot','duplicate-group','registration','cue'):
            with self.subTest(mutation=mutation):
                archive=dict(self.archive)
                if mutation=='slot':
                    data=bytearray(archive[b'MBTN',18901]);struct.pack_into('>H',data,32+6,18316);archive[b'MBTN',18901]=bytes(data)
                elif mutation=='duplicate-group':
                    archive[b'tSCR',18291]=archive[b'tSCR',18291][:38]+b'\x01\x02\x00\x02'
                elif mutation=='registration':
                    data=bytearray(archive[b'REGS',18000]);struct.pack_into('>h',data,560*2,237);archive[b'REGS',18000]=bytes(data)
                else:
                    data=bytearray(archive[b'tSCR',18291]);struct.pack_into('>H',data,42,0);archive[b'tSCR',18291]=bytes(data)
                compiled=exporter.compile_manifest(archive)
                with self.assertRaises(AssertionError):assert_source(archive,compiled,fixture)

    def test_geometry_is_full_initial_rollover_bounds(self):
        for table in self.manifest['tables'].values():
            for b in table['buttons']:
                region=b['region']
                self.assertEqual(region['status'],'exact')
                self.assertEqual(region['boundsSelection'],'rollover-initial-group' if b['rolloverScript'] else 'rest-state1-initial-group-union')
                x,y,w,h=region['boundsXYWH']
                self.assertGreater(w,0); self.assertGreater(h,0)
                for x0,y0,x1,y1 in region['rectsLTRB']:
                    self.assertTrue(x<=x0<x1<=x+w and y<=y0<y1<=y+h)

    def test_unflagged_stamp_registration_is_retained(self):
        clip=self.manifest['scripts']['18054']
        part=clip['frames'][0]['parts'][0]
        self.assertEqual(part['rawImage'],451)
        self.assertEqual(part['registrationXY'],[227,-274])
        self.assertEqual([part['x'],part['y']],[clip['originXY'][0]+part['sourceXY'][0]-227,
                                                 clip['originXY'][1]+part['sourceXY'][1]+274])

    def test_payloads_match_source_channels_and_wavs(self):
        import wave
        from PIL import Image
        data=json.loads((MEDIA/'ui/secondary-motion/manifest.json').read_text())
        for sprite in data['sprites'].values():
            raw=(MEDIA/'ui'/sprite['argb']).read_bytes()
            self.assertEqual(exporter.sha(raw),sprite['argbSha256'])
            payload=exporter.drawing.sprite_payload(self.archive[b'tBMH',sprite['collection']],sprite['number'])
            self.assertEqual(raw,exporter.drawing.argb_pixels(payload)[2])
            png=(MEDIA/'ui'/sprite['image']).read_bytes()
            self.assertEqual(png,exporter.original.bitmap(payload)[1])
            self.assertEqual(exporter.sha(png),sprite['pngSha256'])
        for key,sound in data['sounds'].items():
            rate,channels,pcm=exporter.original.decode_sound(self.archive[b'tWAV',int(key)])
            with wave.open(str(MEDIA/'ui'/sound['src'])) as stream:
                self.assertEqual((stream.getframerate(),stream.getnchannels()),(rate,channels))
                self.assertEqual(stream.readframes(stream.getnframes()),pcm)
        for view,backdrop in data['backdrops'].items():
            if view == 'library-category':
                self.assertEqual(backdrop['rect'],[320,690,43,62])
                self.assertEqual(len(set(r['rgbaSha256'] for r in backdrop['recipes'].values())),1)
                for page in backdrop['pages']:
                    path=MEDIA/'ui'/page['image']
                    self.assertEqual(exporter.sha(path.read_bytes()),page['sha256'])
                    with Image.open(path) as im:self.assertEqual(im.size,(43,62))
                continue
            self.assertFalse(set(backdrop['omittedScripts']) & set(backdrop['retainedScripts']))
            for page in backdrop['pages']:
                path=MEDIA/'ui'/page['image']
                self.assertEqual(exporter.sha(path.read_bytes()),page['sha256'])
                with Image.open(path) as im:self.assertEqual(im.size,(817,168))

    def test_clean_pages_restore_existing_independent_import(self):
        from PIL import Image, ImageChops
        ui=exporter.load_ui()
        data=json.loads((MEDIA/'ui/secondary-motion/manifest.json').read_text())
        for name,backdrop in data['backdrops'].items():
            if name not in ui.TRAYS: continue
            for index,page in enumerate(backdrop['pages']):
                with self.subTest(view=name,page=index):
                    frame=Image.new('RGBA',(1024,768))
                    frame.alpha_composite(Image.open(MEDIA/'ui'/page['image']),(113,608))
                    for n in ui.TRAYS[name][0]:
                        if n in backdrop['omittedScripts']:
                            ui.render_script(frame,self.archive,n,color_key=18072<=n<=18083)
                    suffix=f'-{index+1}' if index else ''
                    reference=Image.open(MEDIA/f'ui/trays/{name}{suffix}.png').convert('RGBA')
                    # Inspect all RGBA channels; RGBA getbbox alone ignores RGB-only differences.
                    diff=ImageChops.difference(frame.crop((113,608,930,776)),reference)
                    self.assertTrue(all(channel.getbbox() is None for channel in diff.split()))

    def test_compile_is_deterministic(self):
        self.assertEqual(self.manifest,exporter.compile_manifest(self.archive))

    def test_stamp_actor_pixels_and_every_restoration_transition(self):
        from PIL import Image
        pins=json.loads(Path(__file__).with_name('stamp-pose-oracles.json').read_text())
        self.assertEqual(pins['sourceTpSha256'],exporter.SOURCE_HASH)
        data=json.loads((MEDIA/'ui/secondary-motion/manifest.json').read_text())
        base=MEDIA/'ui'
        backing=Image.new('RGBA',(1024,776))
        backing.alpha_composite(Image.open(base/'paint-empty.png').convert('RGBA'))
        backing.alpha_composite(Image.open(base/data['backdrops']['stamps']['pages'][0]['image']).convert('RGBA'),(113,608))
        def overlay(image,pose):
            clip=data['scripts'][str(pose['script'])]
            for part in clip['frames'][pose['frame']]['parts']:
                sprite=data['sprites'][f"{clip['collection']}:{part['sprite']}"]
                image.alpha_composite(Image.open(base/sprite['image']).convert('RGBA'),(part['x'],part['y']))
            return image
        def posed(pose):
            return overlay(backing.copy(),pose)
        transitions=0
        for row in pins['rows']:
            x,y,w,h=row['boundsXYWH']; box=(x,y,x+w,y+h)
            for pose in row['poses']:
                with self.subTest(table=row['table'],row=row['row'],script=pose['script'],frame=pose['frame']):
                    target=posed(pose)
                    self.assertEqual(exporter.sha(target.crop(box).tobytes()),pose['rgbaSha256'])
                    for prior in row['poses']:
                        image=posed(prior)
                        image.paste(backing.crop(box),(x,y))
                        overlay(image,pose)
                        self.assertEqual(exporter.sha(image.crop(box).tobytes()),pose['rgbaSha256'])
                        self.assertEqual(exporter.sha(image.tobytes()),exporter.sha(target.tobytes()))
                        transitions+=1
        self.assertEqual(transitions,123)

    def test_unsupported_image_flags_fail_closed(self):
        archive=dict(self.archive)
        raw=bytearray(archive[b'tSCR',18201])
        # First authored image id, found by decoding the event boundary.
        pos=raw.index(b'\x10\x01',26)+2
        raw[pos] |= 0x40
        archive[b'tSCR',18201]=raw
        with self.assertRaisesRegex(ValueError,'Unaudited secondary image flags'):
            exporter.compile_manifest(archive)


if __name__=='__main__':unittest.main()
