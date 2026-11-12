/* Settings schema: the options page, popup and content scripts all use this definition.
 * To add a setting, add a line here; the options page is generated automatically. */
(function (g) {
  'use strict';
  const YTX = (g.YTX = g.YTX || {});

  // --- Helpers (item builders) ---
  const tg = (key, label, def, desc, o) => ({ type: 'toggle', key, label, def, desc, ...o });
  const nm = (key, label, def, min, max, step, desc, o) => ({ type: 'number', key, label, def, min, max, step, desc, ...o });
  const rg = (key, label, def, min, max, step, desc, o) => ({ type: 'range', key, label, def, min, max, step, desc, ...o });
  const sl = (key, label, def, options, desc, o) => ({ type: 'select', key, label, def, options, desc, ...o });
  const tx = (key, label, def, desc, o) => ({ type: 'text', key, label, def, desc, ...o });
  const ta = (key, label, def, desc, o) => ({ type: 'textarea', key, label, def, desc, ...o });
  const co = (key, label, def, desc, o) => ({ type: 'color', key, label, def, desc, ...o });
  const sc = (key, label, def, desc, o) => ({ type: 'shortcut', key, label, def, desc, ...o });
  const ac = (id, label, desc, o) => ({ type: 'action', id, label, desc, ...o });
  const sec = (id, title, module, desc, items, group) => ({ id, title, module, desc, items, group: group || 'other' });
  const TOP = 'top';
  const GROUPS = { top: 'Most used', other: 'Other' };

  // UI languages. Option tuples with a third element `0` are shown as-is (not translated).
  const LANGS = [['en', 'English'], ['tr', 'Türkçe'], ['es', 'Español'], ['pt', 'Português'], ['de', 'Deutsch'], ['fr', 'Français'], ['ru', 'Русский'], ['ja', '日本語']];

  const QUALITIES = [
    ['auto', 'Let YouTube decide (auto)'], ['highres', 'Highest available'], ['hd2160', '4K (2160p)', 0], ['hd1440', '2K (1440p)', 0],
    ['hd1080', '1080p', 0], ['hd720', '720p', 0], ['large', '480p', 0], ['medium', '360p', 0], ['small', '240p', 0], ['tiny', '144p', 0],
  ];

  const SCHEMA = [
    // ============ MOST USED ============
    sec('speed', 'Video speed (all sites)', 'speed', 'Works on videos on every site, including YouTube. Shortcuts are disabled while typing in text fields.', [
      tg('sp_on', 'Enable speed shortcuts', true, '', { quick: true }),
      sc('sp_kPreset', 'Jump to preset speed', 'G', 'Applies the “Preset speed” value below.'),
      sc('sp_kReset', 'Back to normal speed (1x)', 'R'),
      sc('sp_kSlow', 'Slower', 'O'),
      sc('sp_kFast', 'Faster', 'P'),
      nm('sp_preset', 'Preset speed', 1.5, 0.1, 16, 0.05, 'The value the preset shortcut applies.', { quick: true }),
      nm('sp_step', 'Slower / faster step', 0.1, 0.05, 2, 0.05),
      tg('sp_remember', 'Remember the last speed browser-wide', true, 'The last speed you chose is applied automatically to every video on every site.', { quick: true }),
      tg('sp_pitch', 'Preserve pitch when speed changes', true),
      tg('sp_osd', 'Show speed on screen when it changes', true),
    ], TOP),

    sec('quality', 'Video quality (YouTube)', 'enhancer', 'If the chosen quality is unavailable, the next highest one is picked automatically (e.g. 4K → 2K → 1080p → 720p…).', [
      sl('e_quality', 'Automatic quality', 'auto', QUALITIES, 'Applied to every video.', { quick: true }),
      tg('e_premium', 'Prefer the high-bitrate version when available', true, 'If a “Premium / enhanced bitrate” option exists at the chosen resolution, it is used; otherwise falls back to the regular one.', { quick: true, dep: 'e_quality!=auto' }),
    ], TOP),

    sec('gemini', 'Gemini summary (YouTube)', 'gemini', 'Adds a ✦ button to video tiles. It fetches the video’s transcript and opens Gemini in a new tab with a ready prompt that asks for a short summary.', [
      tg('m_gemini', 'Show the Gemini summary button on video tiles', true, 'Appears when you hover over a video. The transcript is read from YouTube and only handed to the Gemini tab you open.', { quick: true }),
      tg('g_autoSend', 'Send the prompt to Gemini automatically', true, 'When off, the prompt is only typed into the chat box and you press send yourself.', { dep: 'm_gemini' }),
    ], TOP),

    sec('hide', 'Hiding (YouTube)', 'clutter', 'Each item can be turned on or off separately. Detailed filters are in the “Other” sections below.', [
      tg('c_shorts', 'Shorts (everywhere)', false, 'Home, search, subscriptions, recommendations, channel pages and the side menu.', { cls: 'hideShorts', quick: true }),
      tg('c_topicShelves', '“Explore new topics” row on the home page', true, '', { quick: true }),
      tg('c_irrelevant', 'Surveys, YouTube Playables and other irrelevant items', false, 'The “Did you like this video?” survey, game/Playables shelves, promo strips, etc. Extra shelf titles can be added under “Other › Hiding details”.', { cls: 'hideIrrelevant', quick: true }),
      tg('m_repeat', 'Repeated videos', true, 'Hides recommendations that have already been shown several times.', { quick: true }),
      nm('r_max', 'Hide after how many impressions', 3, 1, 50, 1, '', { dep: 'm_repeat' }),
      tg('c_mixes', 'YouTube Mix', true, '“Your Mix” and “Mix – ...” (official RDCLAK lists excluded).', { quick: true }),
      tg('c_coursePodcast', 'Playlists shown as courses and podcasts', false, '', { quick: true }),
      tg('c_inProgress', 'Previously watched videos', true, 'Those with a progress bar on the thumbnail. The percentage range is under “Other › Hiding details”.', { quick: true }),
      tg('c_live', 'Ongoing live streams (Subscriptions only)', true, '', { quick: true }),
      tg('c_liveEnded', 'Ended live streams (Subscriptions only)', false, '', { quick: true }),
    ], TOP),

    // ============ OTHER ============
    sec('clutter', 'Hiding details', 'clutter', 'Fine-tune the rules in the Hiding section and add extra filters.', [
      rg('c_progressMin', 'Minimum watched percentage (%)', 1, 1, 100, 1, 'Videos watched less than this are not counted as “watched”.', { dep: 'c_inProgress' }),
      rg('c_progressMax', 'Maximum watched percentage (%)', 100, 1, 100, 1, 'Set the minimum to 90 to hide only fully watched videos.', { dep: 'c_inProgress' }),
      tg('c_upcoming', 'Hide upcoming streams / premieres', false),
      tg('c_membersOnly', 'Hide members-only videos', false),
      nm('c_minDuration', 'Hide videos shorter than (sec)', 0, 0, 36000, 10, '0 = off.'),
      nm('c_maxDuration', 'Hide videos longer than (sec)', 0, 0, 360000, 60, '0 = off.'),
      ta('c_keywords', 'Keywords in the title', '', 'One keyword per line. /regex/i format is also supported. Matching tiles are hidden.'),
      ta('c_channels', 'Channels to hide', '', 'One channel name per line (case-insensitive).'),
      ta('c_shelfTitles', 'Extra shelf titles to treat as irrelevant', 'playables\nyoutube oyun\nyoutube games\nilgili aramalar\nrelated searches', 'One title fragment per line. When “Surveys, Playables and irrelevant items” is on, shelves whose title contains these are hidden.', { dep: 'c_irrelevant' }),
      tg('c_dim', 'Dim instead of hide', false, 'Tiles do not disappear, they are only faded.', { cls: 'dimClutter' }),
      ta('c_excludePaths', 'Pages to leave untouched', '/feed/history\n/playlist\n/feed/library\n/feed/you', 'One path prefix per line. Nothing is hidden on these pages.'),
    ]),

    sec('repeat', 'Repeat hider details', 'repeat', 'Which pages it applies to and how impressions are counted.', [
      tg('r_home', 'Apply on the home page', true),
      tg('r_watch', 'Apply to watch-page recommendations', true),
      tg('r_search', 'Apply to search results', false),
      tg('r_subs', 'Apply on the Subscriptions page', false),
      tg('r_shorts', 'Count Shorts too', true),
      rg('r_visibility', 'Impression visibility threshold (%)', 10, 1, 100, 1, 'A tile counts as “shown” once at least this much of it is on screen.'),
      nm('r_ageDays', 'Record retention (days)', 30, 1, 365, 1, 'Older records are deleted.'),
      nm('r_maxEntries', 'Maximum number of records', 20000, 500, 200000, 500),
      tg('r_dim', 'Dim instead of hide', false, '', { cls: 'dimRepeat' }),
      ac('repeatStats', 'Statistics', 'Shows how many videos have been counted and how many are hidden.'),
      ac('repeatReset', 'Reset counters', 'Deletes all impression counters.', { danger: true }),
    ]),

    sec('playlist', 'Playlist cleaner', 'playlist', 'To start it, open a playlist page, click the extension icon and press “Clear list”.', [
      tg('p_confirm', 'Ask for confirmation before starting', true),
      nm('p_limit', 'Maximum videos to remove', 0, 0, 100000, 10, '0 = unlimited. Stops when this number is reached.'),
      nm('p_stepDelay', 'Delay between removals (ms)', 700, 100, 10000, 50),
      nm('p_waitMenu', 'Max wait for the menu item (ms)', 3000, 500, 15000, 100),
      nm('p_waitRemoved', 'Max wait for the tile to disappear (ms)', 4000, 500, 20000, 100),
      nm('p_scrollDelay', 'Wait for new videos to load (ms)', 1200, 300, 10000, 100),
      nm('p_maxLoadTries', 'Scroll attempts for new videos', 5, 1, 50, 1),
      nm('p_maxFailStreak', 'Stop after how many failures in a row', 3, 1, 50, 1),
      tx('p_extraText', 'Extra “remove” words', '', 'For other languages, separate with |. E.g. rimuovi|usuń'),
    ]),

    sec('player', 'Player (YouTube)', 'enhancer', 'Volume, captions and automatic behaviors.', [
      sl('e_volMode', 'Default volume', 'off', [['off', 'Leave to YouTube'], ['fixed', 'Fixed volume'], ['remember', 'Remember the last one I used']]),
      rg('e_volume', 'Fixed volume (%)', 50, 0, 100, 1, '', { dep: 'e_volMode=fixed' }),
      sl('e_captions', 'Captions', 'off', [['off', 'Leave to YouTube'], ['on', 'Always on'], ['never', 'Always off']]),
      tx('e_captionLang', 'Caption language code', '', 'Empty = default. E.g. tr, en, de', { dep: 'e_captions=on' }),
      tg('e_noAutonext', 'Turn off autoplay of the next video', false),
      tg('e_noAutoplay', 'Do not autoplay when a video loads (pause)', false, 'Pauses a video opened in a new tab.'),
      tg('e_noAutoplayList', 'Do not apply this rule in playlists', true, '', { dep: 'e_noAutoplay' }),
      tg('e_pauseHidden', 'Pause when the tab is hidden', false),
      tg('e_resumeVisible', 'Resume when the tab becomes visible', false, '', { dep: 'e_pauseHidden' }),
      tg('e_pauseOthers', 'Pause YouTube in other tabs', false, 'When a new video starts, videos in other tabs are paused.'),
      tg('e_autoLoop', 'Loop videos automatically', false),
      tg('e_autoTheater', 'Start in theater (wide) mode', false),
      tg('e_expandDesc', 'Expand the description automatically', false),
      tg('e_focus', 'Focus the player', false, 'So keyboard shortcuts work right away.'),
    ]),

    sec('page', 'Page layout (YouTube)', 'enhancer', 'Hide unwanted parts of the interface.', [
      tg('h_comments', 'Hide comments', false, '', { cls: 'hideComments' }),
      tg('h_related', 'Hide the recommended videos sidebar', false, '', { cls: 'hideRelated' }),
      tg('h_chat', 'Hide live chat', false, '', { cls: 'hideChat' }),
      tg('h_endcards', 'Hide end cards / end screen', false, '', { cls: 'hideEndCards' }),
      tg('h_cards', 'Hide info cards, notes and the channel logo', false, '', { cls: 'hideCards' }),
      tg('h_watermark', 'Hide the channel watermark in the player', false, '', { cls: 'hideWatermark' }),
      tg('h_merch', 'Hide merch / donation / ticket shelves', false, '', { cls: 'hideMerch' }),
      tg('h_info', 'Hide info panels', false, 'Topic description boxes, etc.', { cls: 'hideInfoPanel' }),
      tg('h_promos', 'Hide Premium and other promo strips', false, '', { cls: 'hidePromos' }),
      tg('h_ambient', 'Turn off ambient (glow) mode', false, '', { cls: 'hideAmbient' }),
      tg('h_autoplayBtn', 'Hide the autoplay button', false, '', { cls: 'hideAutoplayBtn' }),
      tg('h_notif', 'Hide the notification count badge', false, '', { cls: 'hideNotif' }),
      tg('h_voice', 'Hide the voice search button', false, '', { cls: 'hideVoice' }),
      nm('h_cols', 'Videos per row on the home page', 0, 0, 10, 1, '0 = YouTube’s own layout.'),
      tg('h_accentOn', 'Customize the progress bar color', false),
      co('h_accent', 'Progress bar color', '#ff0000', '', { dep: 'h_accentOn' }),
    ]),

    sec('keys', 'Volume shortcuts (YouTube)', 'enhancer', 'Click the box and press a key. Esc or Backspace clears the shortcut. (Speed shortcuts are in the “Video speed” section at the top.)', [
      tg('s_on', 'Enable shortcuts', true),
      sc('s_volUp', 'Volume up', ''),
      sc('s_volDown', 'Volume down', ''),
      nm('s_volStep', 'Volume shortcut step (%)', 5, 1, 25, 1),
    ]),

    sec('general', 'General', null, 'Language, the extension’s master switch and advanced settings.', [
      sl('ui_lang', 'Language', 'auto', [['auto', 'Automatic (browser language)']].concat(LANGS.map(([c, n]) => [c, n, 0])), 'Language of the settings page, the popup and the on-screen speed display.'),
      tg('enabled', 'Extension enabled', true, 'When off, no feature runs.', { quick: true }),
      tg('x_debug', 'Debug log', false, 'Writes [YTX] logs to the browser console.'),
      nm('x_scanMs', 'Scan interval (ms)', 250, 50, 3000, 50, 'How often page changes are scanned. Lower = faster but uses more CPU.'),
    ]),
  ];

  // --- Derived data ---
  const DEFAULTS = {};
  const ITEMS = {};
  for (const s of SCHEMA) for (const it of s.items) {
    it.section = s.id; it.module = s.module;
    if (it.key) { DEFAULTS[it.key] = it.def; ITEMS[it.key] = it; }
  }

  // Key combo: "Ctrl+Alt+Shift+Meta+Key". Single-character keys are uppercased.
  function comboFromEvent(e) {
    const k = e.key;
    if (['Control', 'Shift', 'Alt', 'Meta', 'Dead', 'Unidentified'].includes(k)) return '';
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    const isLetter = k.length === 1 && k.toLowerCase() !== k.toUpperCase();
    if (e.shiftKey && (k.length > 1 || isLetter || k === ' ')) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
    return parts.join('+');
  }

  // dep: "key" | "key=value" | "key!=value"
  function depOk(item, s) {
    if (!item.dep) return true;
    const m = item.dep.match(/^([^!=]+)(!?=)?(.*)$/);
    if (!m[2]) return !!s[m[1]];
    const eq = String(s[m[1]]) === m[3];
    return m[2] === '=' ? eq : !eq;
  }

  const STORE_KEY = 'settings';
  const api = (g.chrome && g.chrome.storage && g.chrome.storage.local) || null;

  Object.assign(YTX, {
    SCHEMA, DEFAULTS, ITEMS, STORE_KEY, GROUPS, LANGS, comboFromEvent, depOk,
    async loadSettings() {
      const r = await api.get(STORE_KEY);
      return Object.assign({}, DEFAULTS, r[STORE_KEY] || {});
    },
    async saveSettings(patch) {
      const cur = await YTX.loadSettings();
      await api.set({ [STORE_KEY]: Object.assign(cur, patch) });
    },
    async replaceSettings(obj) {
      await api.set({ [STORE_KEY]: Object.assign({}, DEFAULTS, obj) });
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
