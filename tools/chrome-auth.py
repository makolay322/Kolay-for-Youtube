#!/usr/bin/env python3
"""One-time helper: prints a Chrome Web Store refresh token.

Create an OAuth client of type "Desktop app" in Google Cloud (Chrome Web Store API enabled), then:
  CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... python3 tools/chrome-auth.py
"""
import http.server, json, os, urllib.parse, urllib.request, webbrowser

cid, sec = os.environ['CWS_CLIENT_ID'], os.environ['CWS_CLIENT_SECRET']
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
http.server.HTTPServer(('localhost', PORT), H).handle_request()
r = json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', urllib.parse.urlencode({
    'client_id': cid, 'client_secret': sec, 'code': code[0], 'redirect_uri': redir,
    'grant_type': 'authorization_code'}).encode()))
print('CWS_REFRESH_TOKEN =', r['refresh_token'])
