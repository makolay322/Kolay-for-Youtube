#!/usr/bin/env python3
"""Uploads a zip to the Chrome Web Store and submits it for review (API v1.1, stdlib only).

Env: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID
Usage: publish-chrome.py dist/kolay-for-youtube-<ver>-chrome.zip
"""
import json, os, sys, urllib.parse, urllib.request

def req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code} from {url}: {e.read().decode()[:500]}')

env = lambda k: os.environ[k]
tok = req('https://oauth2.googleapis.com/token', urllib.parse.urlencode({
    'client_id': env('CWS_CLIENT_ID'), 'client_secret': env('CWS_CLIENT_SECRET'),
    'refresh_token': env('CWS_REFRESH_TOKEN'), 'grant_type': 'refresh_token'}).encode())['access_token']
auth = {'Authorization': f'Bearer {tok}', 'x-goog-api-version': '2'}
item = env('CWS_EXTENSION_ID')

up = req(f'https://www.googleapis.com/upload/chromewebstore/v1.1/items/{item}',
         open(sys.argv[1], 'rb').read(), auth, 'PUT')
print('upload:', up.get('uploadState'), up.get('itemError') or '')
if up.get('uploadState') != 'SUCCESS':
    sys.exit('Chrome upload failed')
pub = req(f'https://www.googleapis.com/chromewebstore/v1.1/items/{item}/publish', b'', auth, 'POST')
print('publish:', pub.get('status'), pub.get('statusDetail') or '')
if not any(s in ('OK', 'ITEM_PENDING_REVIEW') for s in pub.get('status', [])):
    sys.exit('Chrome publish failed')
