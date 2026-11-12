#!/usr/bin/env bash
# One-time: AMO API credentials -> GitHub repo secrets (typed hidden, never stored).
set -euo pipefail
REPO=makolay322/Kolay-for-Youtube
read -rsp "AMO JWT issuer (user:...): " a; echo; printf '%s' "$a" | gh secret set AMO_JWT_ISSUER -R "$REPO"
read -rsp "AMO JWT secret: " b; echo; printf '%s' "$b" | gh secret set AMO_JWT_SECRET -R "$REPO"
gh variable set AMO_ADDON_ID -R "$REPO" --body kolay-youtube@makolay322
echo "Firefox secrets saved."
