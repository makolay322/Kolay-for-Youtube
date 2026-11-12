#!/usr/bin/env python3
"""Uploads a zip to addons.mozilla.org and creates a new listed version (API v5, stdlib only).

Env: AMO_JWT_ISSUER, AMO_JWT_SECRET, AMO_ADDON_ID  (add-on GUID or slug)
Usage: publish-firefox.py dist/kolay-for-youtube-<ver>-firefox.zip
"""
import base64, hashlib, hmac, json, os, sys, time, urllib.request, uuid

API = 'https://addons.mozilla.org/api/v5'
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=')

def jwt():
    now = int(time.time())
    head = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    body = b64(json.dumps({'iss': os.environ['AMO_JWT_ISSUER'], 'jti': str(uuid.uuid4()),
                           'iat': now, 'exp': now + 240}).encode())
    sig = b64(hmac.new(os.environ['AMO_JWT_SECRET'].encode(), head + b'.' + body, hashlib.sha256).digest())
    return (head + b'.' + body + b'.' + sig).decode()

def call(path, data=None, ctype=None, method=None):
    h = {'Authorization': f'JWT {jwt()}'}
    if ctype: h['Content-Type'] = ctype
    r = urllib.request.Request(API + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code} on {path}: {e.read().decode()[:500]}')

path = sys.argv[1]
boundary = uuid.uuid4().hex
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="channel"\r\n\r\nlisted\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="upload"; filename="{os.path.basename(path)}"\r\n'
        f'Content-Type: application/zip\r\n\r\n').encode() + open(path, 'rb').read() + f'\r\n--{boundary}--\r\n'.encode()
up = call('/addons/upload/', body, f'multipart/form-data; boundary={boundary}', 'POST')
print('uploaded:', up['uuid'])

for _ in range(60):  # wait for validation
    st = call(f'/addons/upload/{up["uuid"]}/')
    if st.get('processed'):
        break
    time.sleep(5)
else:
    sys.exit('AMO validation timed out')
if not st.get('valid'):
    sys.exit('AMO validation failed: ' + json.dumps(st.get('validation'))[:1500])

ver = call(f'/addons/addon/{os.environ["AMO_ADDON_ID"]}/versions/',
           json.dumps({'upload': up['uuid']}).encode(), 'application/json', 'POST')
print('version created:', ver.get('version'), ver.get('id'))
