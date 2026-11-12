#!/usr/bin/env python3
"""Builds store-ready packages for Chrome and Firefox from extension/.

  python3 tools/build.py            -> dist/kolay-for-youtube-<ver>-chrome.zip
                                       dist/kolay-for-youtube-<ver>-firefox.zip
                                       dist/kolay-for-youtube-<ver>-source.zip  (for AMO review)

The manifest in extension/ is the development manifest (load unpacked from git).
Store builds differ from it:
  * background.js (self-reload on `git pull`) and the "alarms" permission are
    dropped: stores update the extension themselves, so it is not needed and
    every permission must be justified during review.
  * Firefox gets browser_specific_settings (add-on ID, minimum version and the
    mandatory data-collection declaration) and loses Chrome-only keys.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'extension')
DIST = os.path.join(ROOT, 'dist')
SLUG = 'kolay-for-youtube'

# Never change the add-on ID: AMO ties every update and existing install to it.
GECKO_ID = 'kolay-youtube@makolay322'
# 128: content scripts with "world": "MAIN"; 140: data_collection_permissions without warnings
GECKO_MIN = '140.0'

SKIP_FILES = {'background.js', '.DS_Store', 'Thumbs.db'}


def load_manifest():
    with open(os.path.join(SRC, 'manifest.json'), encoding='utf-8') as f:
        return json.load(f)


def store_manifest(m):
    m = json.loads(json.dumps(m))
    m.pop('background', None)
    m['permissions'] = [p for p in m.get('permissions', []) if p != 'alarms']
    return m


def chrome_manifest(m):
    return store_manifest(m)


def firefox_manifest(m):
    m = store_manifest(m)
    m.pop('minimum_chrome_version', None)
    m['browser_specific_settings'] = {
        'gecko': {
            'id': GECKO_ID,
            'strict_min_version': GECKO_MIN,
            'data_collection_permissions': {'required': ['none']},
        }
    }
    return m


def write_zip(zip_path, manifest):
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(SRC):
            dirs.sort()
            for name in sorted(files):
                if name in SKIP_FILES or name == 'manifest.json' and base == SRC:
                    continue
                full = os.path.join(base, name)
                z.write(full, os.path.relpath(full, SRC))
        z.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')


def write_source_zip(zip_path):
    """AMO asks for the source when it reviews; the code is not minified, but
    attaching the repo snapshot answers that question up front."""
    if os.path.exists(zip_path):
        os.remove(zip_path)
    try:
        files = subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).split('\n')
    except Exception:
        files = []
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            if rel and not rel.startswith('dist/') and os.path.isfile(os.path.join(ROOT, rel)):
                z.write(os.path.join(ROOT, rel), rel)


def main():
    m = load_manifest()
    ver = m['version']
    os.makedirs(DIST, exist_ok=True)
    out = {
        'chrome': os.path.join(DIST, f'{SLUG}-{ver}-chrome.zip'),
        'firefox': os.path.join(DIST, f'{SLUG}-{ver}-firefox.zip'),
        'source': os.path.join(DIST, f'{SLUG}-{ver}-source.zip'),
    }
    write_zip(out['chrome'], chrome_manifest(m))
    write_zip(out['firefox'], firefox_manifest(m))
    write_source_zip(out['source'])
    for k, p in out.items():
        print(f'{k:8} {os.path.relpath(p, ROOT)}  ({os.path.getsize(p) // 1024} KB)')

    if '--unpacked' in sys.argv:
        # dist/unpacked/{chrome,firefox}: handy for `web-ext run` / Load unpacked tests
        for target, fn in (('chrome', chrome_manifest), ('firefox', firefox_manifest)):
            d = os.path.join(DIST, 'unpacked', target)
            shutil.rmtree(d, ignore_errors=True)
            with zipfile.ZipFile(out[target]) as z:
                z.extractall(d)
            print(f'unpacked {os.path.relpath(d, ROOT)}')


if __name__ == '__main__':
    main()
