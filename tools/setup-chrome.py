#!/usr/bin/env python3
"""One-time: Chrome Web Store credentials -> GitHub repo secrets. Nothing is printed or saved.

  python3 tools/setup-chrome.py ~/Downloads/client_secret_<id>.json
Opens the Google consent page; approve with the account that owns the extension.
"""
import http.server, json, subprocess, sys, urllib.parse, urllib.request, webbrowser

REPO = 'makolay322/Kolay-for-Youtube'
c = json.load(open(sys.argv[1]))['installed']
cid, sec = c['client_id'], c['client_secret']
PORT = 8765
redir = f'http://localhost:{PORT}'
webbrowser.open('https://accounts.google.com/o/oauth2/auth?' + urllib.parse.urlencode({
    'client_id': cid, 'redirect_uri': redir, 'response_type': 'code',
    'scope': 'https://www.googleapis.com/auth/chromewebstore', 'access_type': 'offline', 'prompt': 'consent'}))
code = []
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        code.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('code', [''])[0])
        self.send_response(200); self.end_headers(); self.wfile.write(b'Done, you can close this tab.')
    def log_message(self, *a): pass
print('Waiting for Google consent in the browser...')
http.server.HTTPServer(('localhost', PORT), H).handle_request()
r = json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', urllib.parse.urlencode({
    'client_id': cid, 'client_secret': sec, 'code': code[0], 'redirect_uri': redir,
    'grant_type': 'authorization_code'}).encode()))
for k, v in [('CWS_CLIENT_ID', cid), ('CWS_CLIENT_SECRET', sec), ('CWS_REFRESH_TOKEN', r['refresh_token'])]:
    subprocess.run(['gh', 'secret', 'set', k, '-R', REPO], input=v.encode(), check=True)
subprocess.run(['gh', 'variable', 'set', 'CWS_EXTENSION_ID', '-R', REPO, '--body', 'jlbgeidkdbpnbpimklbcgdblidlbgiff'], check=True)
print('Chrome secrets saved.')
