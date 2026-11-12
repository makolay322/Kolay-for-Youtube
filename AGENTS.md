# Notes for AI agents (Claude Code, Codex, …)

Kolay for YouTube: a plain JS browser extension (`extension/`), one codebase for Chrome and Firefox.

## Shipping an update (works from any machine)
1. Make the change, run `node tools/check-i18n.js` (every locale must have every string).
2. **Bump `version` in `extension/manifest.json`.** This is what triggers a release.
3. Commit and push to `main`. That is all.

CI (`.github/workflows/build.yml`, job `publish`) then: builds the Chrome and Firefox zips,
uploads them to the Chrome Web Store (`tools/publish-chrome.py`) and AMO
(`tools/publish-firefox.py`), then creates the tag `v<version>` and the GitHub release.
If the version already has a tag, nothing is published, so pushes without a version bump are safe.
Store review still takes time on Google's / Mozilla's side.

## Rules
- Never change the Firefox add-on ID (`GECKO_ID` in `tools/build.py`).
- Credentials live only in GitHub repo secrets (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`,
  `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`) and variables (`CWS_EXTENSION_ID`, `AMO_ADDON_ID`).
  Never write them into files, commits, issues or chat. Setup: `tools/setup-secrets.sh`;
  new Chrome refresh token: `tools/chrome-auth.py`.
- Check the Actions tab after pushing; if `publish` fails, read its log before retrying.
