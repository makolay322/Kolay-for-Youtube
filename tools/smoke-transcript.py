#!/usr/bin/env python3
"""Smoke test for the Gemini summary: can the transcript of a few fixed videos still be fetched the way
content/summarize.js does it (YouTube player endpoint with the Android client, then the timedtext URL)?

Exit codes: 0 = works (or inconclusive because YouTube blocks this network), 1 = broken.
Run:  python3 tools/smoke-transcript.py"""
import json
import re
import sys
import time
import urllib.request

# Keep in sync with CLIENTS in extension/content/summarize.js
CLIENT = {"clientName": "ANDROID", "clientVersion": "20.10.38", "androidSdkVersion": 34, "hl": "en"}
VIDEOS = ["jNQXAC9IVRw", "dQw4w9WgXcQ", "kJQP7kiw5Fk"]
UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"


def post_player(video_id):
    body = json.dumps({"context": {"client": CLIENT}, "videoId": video_id}).encode()
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", data=body,
        headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def check(video_id):
    """-> ('ok'|'blocked'|'broken', detail)"""
    last = ""
    for attempt in range(3):
        try:
            p = post_player(video_id)
            status = (p.get("playabilityStatus") or {}).get("status")
            if status == "LOGIN_REQUIRED":
                return "blocked", "LOGIN_REQUIRED (YouTube is asking this network to sign in)"
            tracks = (((p.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks")) or []
            if not tracks:
                last = f"no captionTracks (status {status})"
            else:
                track = next((t for t in tracks if t.get("kind") == "asr"), tracks[0])
                req = urllib.request.Request(track["baseUrl"], headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    xml = r.read().decode("utf-8", "replace")
                text = " ".join(re.findall(r"<(?:text|p)\b[^>]*>([^<]*)", xml)).strip()
                if len(text) > 50:
                    return "ok", f"{len(text)} characters, track {track.get('languageCode')}"
                last = f"timedtext came back empty ({len(xml)} bytes)"
        except Exception as e:  # noqa: BLE001 - report anything
            last = f"{type(e).__name__}: {e}"
        time.sleep(2 * (attempt + 1))
    return "broken", last


def main():
    results = {v: check(v) for v in VIDEOS}
    for v, (state, detail) in results.items():
        print(f"{state:8} {v}  {detail}")
    states = {s for s, _ in results.values()}
    if "broken" in states:
        print("\nTranscript fetching is broken for at least one video.", file=sys.stderr)
        return 1
    if states == {"blocked"}:
        print("\nInconclusive: YouTube blocks this network. Not counted as a failure.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
