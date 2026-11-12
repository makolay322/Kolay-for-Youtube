#!/usr/bin/env bash
# One-time: stores the store API credentials as GitHub repo secrets. Values are typed
# interactively (hidden) and never written to disk or shell history.
set -euo pipefail
REPO=makolay322/Kolay-for-Youtube
for name in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN AMO_JWT_ISSUER AMO_JWT_SECRET; do
  read -rsp "$name: " v; echo
  printf '%s' "$v" | gh secret set "$name" -R "$REPO"
done
gh variable set CWS_EXTENSION_ID -R "$REPO" --body jlbgeidkdbpnbpimklbcgdblidlbgiff
gh variable set AMO_ADDON_ID -R "$REPO" --body kolay-youtube@makolay322
echo "done"
