#!/usr/bin/env python3
"""Extract only installer payload/index into a NEW separate directory using 7-Zip."""
import argparse
from pathlib import Path
import subprocess
from portable_source import installer_reader


def extract(dmg, destination, sevenzip):
    destination=Path(destination).resolve()
    # Refuse reuse rather than overwrite an earlier research extraction.
    destination.mkdir(parents=True,exist_ok=False)
    subprocess.run([str(Path(sevenzip).resolve()),'x','-y',f'-o{destination}',str(Path(dmg).resolve()),
                    'Kid Pix Deluxe 3D/Kid Pix Installer.app/Contents/Resources/Archive.zp*'],check=True)
    index=next(destination.rglob('Archive.zplist'))
    read=installer_reader(index.parent)
    # One explicitly named source fixture, never any imported media.
    (destination/'Tp.MHK').write_bytes(read('Data/Tools/Tp.MHK'))
    return index.parent


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('dmg',type=Path);p.add_argument('destination',type=Path)
    p.add_argument('--sevenzip',required=True,type=Path)
    a=p.parse_args();print(extract(a.dmg,a.destination,a.sevenzip))
