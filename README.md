<p align="center"><img src="assets/icon256.png" width="96" height="96" alt=""></p>
<h1 align="center">Kolay for YouTube</h1>
<p align="center"><b>A calmer, faster YouTube — plus speed hotkeys for every video on the web.</b></p>
<p align="center">
<a href="https://makolay322.github.io/Kolay-for-Youtube/">Website</a> ·
<a href="#install">Install</a> ·
<a href="#features">Features</a> ·
<a href="https://makolay322.github.io/Kolay-for-Youtube/privacy.html">Privacy</a> ·
<a href="https://github.com/makolay322/Kolay-for-Youtube/issues">Report a problem</a>
</p>

<p align="center"><img src="docs/img/og.png" width="760" alt="Kolay for YouTube settings page"></p>

Kolay for YouTube is a free, open-source browser extension for **Chrome, Edge, Brave, Opera, Vivaldi** and **Firefox**. Every feature has its own switch, the toolbar popup keeps the most used ones one click away, and the interface speaks English, Türkçe, Español, Português, Deutsch, Français, Русский and 日本語.

- 🎚️ **Speed hotkeys on every site.** `G` preset · `R` 1× · `O` slower · `P` faster. The last speed is remembered browser-wide.
- 🎞️ **Quality that sticks.** Pick 4K or 1080p once; if it isn't available the next best is chosen, and Premium's high-bitrate version is preferred when there is one.
- 🧹 **A quieter feed.** Hide Shorts, Mixes, surveys, Playables, "Explore new topics", watched videos and live streams, each on its own switch.
- 🔁 **Repeat hider.** Recommendations you've scrolled past three times disappear.
- 🗑️ **Playlist cleaner.** Empty Watch Later or any of your own playlists with one click.
- ✦ **Gemini summary.** A button on video tiles and the watch page reads the transcript and opens Gemini with a ready prompt. Several templates, any summary language, timestamps, batch mode, and a copy button for other chatbots.
- 🔒 **No tracking.** No servers, no analytics, no account. Settings stay in your browser. The only network use is the optional Gemini summary (see below).

## Install

| Browser | |
|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | [**Chrome Web Store**](https://chromewebstore.google.com/detail/kolay-for-youtube/jlbgeidkdbpnbpimklbcgdblidlbgiff) |
| Firefox 140+ (desktop) | [**Firefox Add-ons**](https://addons.mozilla.org/en-US/firefox/addon/kolay-for-youtube/) |

The store versions update themselves. To install a specific version by hand, download it from [Releases](https://github.com/makolay322/Kolay-for-Youtube/releases):

- **Chromium:** extract `kolay-for-youtube-<ver>-chrome.zip` into a permanent folder, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `kolay-for-youtube-<ver>-firefox.zip`. Firefox removes temporary add-ons when it restarts.

> **Why does it need `gemini.google.com`?** Only for the Gemini summary: a small script there types the prompt you asked for into the chat box. The transcript is read from YouTube and handed to that tab through the browser's extension storage; nothing goes to any server of ours.

> **Why "read and change data on all websites"?** The speed hotkeys work on videos on every site. That script only listens for your shortcut keys and changes the speed of `<video>` elements. It reads nothing else and sends nothing anywhere. You can limit site access in your browser's extension settings.

## Features

**Most used** (top of the settings page and in the popup)

| Section | What it does |
|---|---|
| Video speed (all sites) | `G` preset speed, `R` 1×, `O` slower, `P` faster; keys and step are configurable. The last speed is remembered and applied to every video (optionally per site). |
| Video quality | Steps down automatically when the chosen quality is unavailable (4K → 1440p → 1080p → …). Prefers the high-bitrate (Premium) variant. |
| Gemini summary | A ✦ button on tiles and the watch page (and a copy button). Templates: short summary, study notes, Q&A, "worth watching?", or your own prompt. Summary language, optional timestamps with links into the video, Shift+click to summarize several videos together, `Shift+S` on the watch page, Google account number. Falls back to a copy button when Gemini can't be filled; the last problem and a history are in the diagnostics section. |
| Hiding | Shorts (everywhere), "Explore new topics", surveys and Playables, repeated videos, Mixes, course and podcast playlists, watched videos, live and ended streams (Subscriptions page). |

**More** (lower on the settings page)

| Section | What it does |
|---|---|
| Hiding details | Watched-percentage range, upcoming premieres, members-only, duration filter, keyword and channel blocklist (regex supported), extra shelf titles, dim instead of hide, excluded pages. |
| Repeat hider | Pages it applies to, visibility threshold, retention, statistics and reset. |
| Playlist cleaner | On a playlist page, click the toolbar icon and press "Clear list". Delays, limit and confirmation are configurable. |
| Player | Default or remembered volume, captions, no autoplay, pause when the tab is hidden, pause other tabs, theater mode, expanded description. |
| Page layout | Hide comments, recommendations, live chat, end cards, watermark, shelves, info panels and ambient mode. Set videos per row and the progress bar color. |
| Volume keys | Volume up and down. |
| Gemini diagnostics | Last problem, recent summaries with "Retry", and a copy-diagnostics button for bug reports. |

Settings can be searched, and exported or imported as a JSON file.

> YouTube changes its layout often. If something stops working, turn on **Settings → General → Debug log**, check the browser console, and [open an issue](https://github.com/makolay322/Kolay-for-Youtube/issues).

## Development

The extension is plain JavaScript, HTML and CSS with no bundler or build step. Load the `extension/` folder unpacked in Chrome, or run `npx web-ext run --source-dir extension` for Firefox.

When loaded unpacked, the extension checks its own `manifest.json` every 15 minutes and reloads when the version changes, so `git pull` is enough to update. Store builds drop this check and the `alarms` permission.

```bash
./tools/build.sh             # dist/kolay-for-youtube-<ver>-{chrome,firefox,source}.zip
./tools/build.sh --unpacked  # also extracts to dist/unpacked/{chrome,firefox}
node tools/check-i18n.js     # every locale has every string
```

`tools/build.py` writes a separate manifest for each store from `extension/manifest.json`. The Firefox manifest gets the add-on ID and the data-collection declaration. CI builds, checks translations and runs `web-ext lint` on every push. Pushing a `v*` tag attaches the zips to a GitHub release.

| Path | What's there |
|---|---|
| `extension/content/` | Content scripts: `speed.js` (all sites), YouTube features, `main-world.js` (player API) |
| `extension/shared/` | Settings schema, i18n and translations (`locales/*.js`) |
| `extension/options/`, `extension/popup/` | Settings page and toolbar popup |
| `docs/` | Website and privacy policy (GitHub Pages) |
| `tools/` | Build, translation check and image rendering (`render-all.sh`, needs Playwright) |

### Releasing

Bump `version` in `extension/manifest.json` and push to `main`. CI uploads the Chrome and Firefox packages to both stores, tags `v<ver>` and publishes the GitHub release. A push without a version bump releases nothing. One-time setup of the store credentials is described in [AGENTS.md](AGENTS.md).

### Translations

UI strings live in `extension/shared/locales/<lang>.js`; English is written inline in the code (`schema.js` and the `t()` fallbacks). The store name and description are in `extension/_locales/<lang>/messages.json`. Corrections and new languages are welcome: open a pull request and make sure `node tools/check-i18n.js` passes.

## License

[MIT](LICENSE). Kolay for YouTube is an independent project and is not affiliated with, endorsed or sponsored by YouTube or Google LLC.
