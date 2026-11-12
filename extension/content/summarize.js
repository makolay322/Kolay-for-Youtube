/* Gemini summary: adds a button to video tiles. A click fetches the transcript and hands a ready-made
 * prompt to gemini.google.com (filled in there by content/gemini.js). Nothing is sent anywhere else. */
(function () {
  'use strict';
  const YTX = window.YTX;
  const PENDING_KEY = 'ytxGemini';
  const GEMINI_URL = 'https://gemini.google.com/app';
  // Gemini's chat box silently cuts text at 32,000 characters, so the transcript has to fit in what is left after the instructions
  const MAX_CHARS = 26000;
  const TILE_ATTR = 'data-ytx-gem';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/shorts/"]';
  const INNER_TILE_SELECTOR = [
    'ytd-compact-video-renderer', 'yt-lockup-view-model', 'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-reel-item-renderer',
  ].join(',');
  const NEVER = 'ytd-playlist-panel-video-renderer, ytd-playlist-panel-renderer';
  const VIDEO_ID = /(?:[?&]v=|\/shorts\/)([A-Za-z0-9_-]{11})/;

  const STR = {
    en: { tip: 'Summarize with Gemini', busy: 'Fetching transcript…', none: 'This video has no transcript.', fail: 'Could not fetch the transcript.' },
    tr: { tip: 'Gemini ile özetle', busy: 'Transkript alınıyor…', none: 'Bu videoda transkript yok.', fail: 'Transkript alınamadı.' },
    de: { tip: 'Mit Gemini zusammenfassen', busy: 'Transkript wird geladen…', none: 'Dieses Video hat kein Transkript.', fail: 'Transkript konnte nicht geladen werden.' },
    es: { tip: 'Resumir con Gemini', busy: 'Obteniendo la transcripción…', none: 'Este vídeo no tiene transcripción.', fail: 'No se pudo obtener la transcripción.' },
    pt: { tip: 'Resumir com o Gemini', busy: 'Obtendo a transcrição…', none: 'Este vídeo não tem transcrição.', fail: 'Não foi possível obter a transcrição.' },
    fr: { tip: 'Résumer avec Gemini', busy: 'Récupération de la transcription…', none: "Cette vidéo n'a pas de transcription.", fail: 'Impossible de récupérer la transcription.' },
    ru: { tip: 'Кратко пересказать в Gemini', busy: 'Получение транскрипта…', none: 'У этого видео нет транскрипта.', fail: 'Не удалось получить транскрипт.' },
    ja: { tip: 'Gemini で要約', busy: '文字起こしを取得中…', none: 'この動画には文字起こしがありません。', fail: '文字起こしを取得できませんでした。' },
  };
  const uiLang = () => {
    let l = YTX.s.ui_lang;
    if (!l || l === 'auto') l = (navigator.language || 'en').toLowerCase().split(/[-_]/)[0];
    return STR[l] ? l : 'en';
  };
  const str = () => STR[uiLang()];

  // ---------- Transcript (same approach as the Kolay Android Toolkit) ----------
  const unescapeXml = (s) => s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  function parseCues(xml) {
    const out = [];
    for (const m of xml.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)) {
      const line = unescapeXml(unescapeXml(m[1].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
      if (line) out.push(line);
    }
    return out.join(' ');
  }

  // The spoken-language track: auto-generated (asr) is by definition the original; else the audio default; else the first.
  function pickTrack(pr) {
    const tracks = pr.captionTracks || [];
    const asr = tracks.find((t) => t.kind === 'asr');
    if (asr) return asr;
    const audio = pr.audioTracks && pr.audioTracks[0];
    const idx = audio && Number.isInteger(audio.defaultCaptionTrackIndex) ? audio.defaultCaptionTrackIndex : 0;
    return tracks[idx] || tracks[0];
  }

  async function fetchTranscript(id) {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' } },
        videoId: id,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const player = await res.json();
    const pr = player.captions && player.captions.playerCaptionsTracklistRenderer;
    if (!pr || !pr.captionTracks || !pr.captionTracks.length) { const e = new Error('no transcript'); e.none = true; throw e; }
    const track = pickTrack(pr);
    const cres = await fetch(track.baseUrl, { credentials: 'omit' });
    if (!cres.ok) throw new Error('HTTP ' + cres.status);
    const text = parseCues(await cres.text());
    if (!text) { const e = new Error('empty'); e.none = true; throw e; }
    return { text, lang: track.languageCode || '' };
  }

  // ---------- Prompt ----------
  function languageName() {
    let code = YTX.s.ui_lang;
    if (!code || code === 'auto') code = (navigator.language || 'en').split(/[-_]/)[0];
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || 'English'; } catch (e) { return 'English'; }
  }

  function buildPrompt(info, tr) {
    let text = tr.text, cut = false;
    if (text.length > MAX_CHARS) { // keep the beginning and the end, drop the middle
      const head = Math.floor(MAX_CHARS * 0.55);
      text = text.slice(0, head) + ' […] ' + text.slice(text.length - (MAX_CHARS - head));
      cut = true;
    }
    const lang = languageName();
    return [
      `Below is the transcript of a YouTube video (spoken language: ${tr.lang || 'unknown'}). Summarize the video in ${lang}, in a way that can be scanned quickly.`,
      '',
      `Video: ${info.title || '(untitled)'}${info.channel ? ' — ' + info.channel : ''}`,
      `Link: https://www.youtube.com/watch?v=${info.id}`,
      '',
      'Use exactly this structure (write the headings in ' + lang + '):',
      '## Short summary',
      'What the video is about and its conclusion: at most 3 short sentences.',
      '## Key points',
      '- One idea per line, at most 2 short sentences, most important first. 5-8 bullets (up to 10 for a very long video).',
      '- Mark the most important phrase of each bullet in **bold** (once per bullet).',
      '## Remember this',
      'One sentence: the one thing a viewer should remember.',
      '',
      'Rules:',
      '- Write only what is in the transcript; add no opinions or outside knowledge.',
      '- Keep important numbers, names, dates and terms.',
      '- Skip greetings, ads, calls to subscribe and repetition.',
      '- The transcript may be auto-generated: silently fix obvious spelling or recognition mistakes without changing the meaning.',
      '- Use plain, short sentences.',
      ...(cut ? ['- The transcript is very long, so the middle part was left out (marked […]); summarize what is given and mention that the middle is missing.'] : []),
      '',
      'TRANSCRIPT:',
      text,
    ].join('\n');
  }

  // ---------- Hand-off to the Gemini tab ----------
  const store = (v) => { try { return chrome.storage.local.set({ [PENDING_KEY]: v }); } catch (e) { return Promise.resolve(); } };

  function openGemini() {
    const a = document.createElement('a');
    a.href = GEMINI_URL; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const busyIds = new Set();
  async function run(id, info, btn) {
    if (busyIds.has(id)) return;
    busyIds.add(id);
    btn.classList.add('ytx-gem-busy');
    const token = Math.random().toString(36).slice(2);
    openGemini(); // inside the click gesture, so the popup blocker allows it
    await store({ token, state: 'loading', ts: Date.now(), lang: uiLang() });
    try {
      const tr = await fetchTranscript(id);
      await store({ token, state: 'ready', ts: Date.now(), lang: uiLang(), prompt: buildPrompt(info, tr), autoSend: !!YTX.s.g_autoSend });
    } catch (e) {
      YTX.log('gemini transcript error', e);
      await store({ token, state: 'error', ts: Date.now(), lang: uiLang(), message: e && e.none ? str().none : str().fail });
    } finally {
      busyIds.delete(id);
      btn.classList.remove('ytx-gem-busy');
    }
  }

  // ---------- Tiles ----------
  function icon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M12 1.5C12.6 7.6 16.4 11.4 22.5 12 16.4 12.6 12.6 16.4 12 22.5 11.4 16.4 7.6 12.6 1.5 12 7.6 11.4 11.4 7.6 12 1.5Z');
    p.setAttribute('fill', '#8ab4f8');
    svg.appendChild(p);
    return svg;
  }

  const titleOf = (tile) => {
    const t = tile.querySelector('#video-title, h3, [class*="lockup-metadata-view-model-wiz__title"]');
    return t ? (t.getAttribute('title') || t.textContent).trim() : '';
  };
  const channelOf = (tile) => {
    const a = tile.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], ytd-channel-name a');
    return a ? a.textContent.trim() : '';
  };

  function addButton(tile, id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ytx-gem-btn';
    btn.title = str().tip;
    btn.setAttribute('aria-label', str().tip);
    btn.appendChild(icon());
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      run(id, { id, title: titleOf(tile), channel: channelOf(tile) }, btn);
    }, true);
    tile.appendChild(btn);
    tile.setAttribute(TILE_ATTR, id);
  }

  function scan() {
    document.querySelectorAll(LINK_SELECTOR).forEach((a) => {
      if (a.closest(NEVER)) return;
      const tile = a.closest('ytd-rich-item-renderer') || a.closest(INNER_TILE_SELECTOR);
      if (!tile) return;
      const m = VIDEO_ID.exec(a.getAttribute('href') || '');
      if (!m) return;
      const cur = tile.getAttribute(TILE_ATTR);
      if (cur === m[1] && tile.querySelector(':scope > .ytx-gem-btn')) return;
      // Tiles are recycled for other videos: replace the old button
      tile.querySelectorAll(':scope > .ytx-gem-btn').forEach((b) => b.remove());
      addButton(tile, m[1]);
    });
  }

  // Watch page: a pill button in the action row under the player
  function scanWatch() {
    const host = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (!host || !id) return;
    const cur = host.querySelector(':scope > .ytx-gem-watch');
    if (cur && cur.dataset.id === id) return;
    if (cur) cur.remove();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ytx-gem-watch';
    btn.dataset.id = id;
    btn.title = str().tip;
    btn.appendChild(icon());
    const label = document.createElement('span');
    label.textContent = str().tip;
    btn.appendChild(label);
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const meta = document.querySelector('ytd-watch-metadata');
      const h1 = meta && meta.querySelector('h1');
      const ch = meta && meta.querySelector('#owner a[href^="/@"], #owner a[href^="/channel/"], ytd-channel-name a');
      run(id, { id, title: h1 ? h1.textContent.trim() : document.title.replace(/ - YouTube$/, ''), channel: ch ? ch.textContent.trim() : '' }, btn);
    }, true);
    host.prepend(btn);
  }

  function scanAll() { scan(); scanWatch(); }

  function clearAll() {
    document.querySelectorAll('.ytx-gem-watch').forEach((b) => b.remove());
    document.querySelectorAll('.ytx-gem-btn').forEach((b) => b.remove());
    document.querySelectorAll('[' + TILE_ATTR + ']').forEach((el) => el.removeAttribute(TILE_ATTR));
  }

  YTX.register({
    id: 'gemini',
    start() { YTX.onMutate(scanAll); YTX.onNav(scanAll); scanAll(); },
    stop() { YTX.offMutate(scanAll); YTX.offNav(scanAll); clearAll(); },
    update() { scanAll(); },
  });
})();
