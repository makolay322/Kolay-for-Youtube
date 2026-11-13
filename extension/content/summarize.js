/* Gemini summary: adds buttons to video tiles and the watch page. A click fetches the transcript and hands a
 * ready-made prompt to gemini.google.com (filled in there by content/gemini.js). Nothing is sent anywhere else.
 *   ✦ click          summarize in Gemini          copy button   copy prompt + transcript (for any chatbot)
 *   Shift+click ✦    select several videos, then "Summarize together" in the bar that appears
 * Diagnostics (last error, history) are kept in chrome.storage.local and shown on the settings page. */
(function () {
  'use strict';
  const YTX = window.YTX;
  const KEY_PREFIX = 'ytxGemini:';        // one record per run: ytxGemini:<token>
  const IDX_KEY = 'ytxGeminiIdx';         // { token: ts } so stale records can be cleaned up
  const LAST_KEY = 'ytxGeminiLast';       // last failure, for the diagnostics section
  const HIST_KEY = 'ytxGeminiHistory';    // last runs
  const HIST_MAX = 20;
  const STALE_MS = 10 * 60 * 1000;
  const MAX_CHARS = 1500000;              // the transcript travels as an attached .txt file (the chat box itself holds 32,000 characters)
  const MAX_BATCH = 10;
  const GESTURE_WAIT_MS = 2500;           // open the Gemini tab after the fetch only if it is quick (the click gesture expires after ~5 s)
  const TILE_ATTR = 'data-ytx-gem';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // YouTube clients used to read the caption list, tried in order. Keep client versions here, in one place.
  const CLIENTS = [
    ['android', { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' }],
    ['ios', { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en' }],
    ['tv', { clientName: 'TVHTML5', clientVersion: '7.20250120.19.00', hl: 'en' }],
  ];

  const LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/shorts/"]';
  const INNER_TILE_SELECTOR = [
    'ytd-compact-video-renderer', 'yt-lockup-view-model', 'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-reel-item-renderer',
  ].join(',');
  const NEVER = 'ytd-playlist-panel-video-renderer, ytd-playlist-panel-renderer';
  const VIDEO_ID = /(?:[?&]v=|\/shorts\/)([A-Za-z0-9_-]{11})/;

  const STR = {
    en: {
      tip: 'Summarize with Gemini', copyTip: 'Copy prompt and transcript', shift: 'Shift+click: select several videos', busy: 'Fetching transcript…',
      none: 'This video has no transcript.', fail: 'Could not fetch the transcript.',
      login: 'This video needs sign-in (age-restricted or members-only), so no transcript could be read.',
      unplayable: 'This video cannot be played here, so there is no transcript.', live: 'Live streams have no transcript until they end.',
      empty: 'The video has captions, but YouTube returned them empty. Try again later.',
      copied: 'Prompt and transcript copied.', copyFail: 'Could not copy.', bar: '{n} selected', barGo: 'Summarize together', barClear: 'Clear',
      limit: 'At most {n} videos at once.', partial: '{n} video(s) without a transcript were skipped.', ready: 'Transcript ready.', openIt: 'Open Gemini',
    },
    tr: {
      tip: 'Gemini ile özetle', copyTip: 'İstemi ve transkripti kopyala', shift: 'Shift+tık: birden çok video seç', busy: 'Transkript alınıyor…',
      none: 'Bu videoda transkript yok.', fail: 'Transkript alınamadı.',
      login: 'Bu video için giriş gerekiyor (yaş sınırı veya üyelere özel); transkript okunamadı.',
      unplayable: 'Bu video burada oynatılamıyor, transkript yok.', live: 'Canlı yayınların transkripti yayın bitene kadar yoktur.',
      empty: 'Videoda altyazı var ama YouTube boş döndürdü. Biraz sonra tekrar dene.',
      copied: 'İstem ve transkript kopyalandı.', copyFail: 'Kopyalanamadı.', bar: '{n} video seçildi', barGo: 'Birlikte özetle', barClear: 'Temizle',
      limit: 'Aynı anda en fazla {n} video.', partial: '{n} videonun transkripti yok, atlandı.', ready: 'Transkript hazır.', openIt: 'Gemini\'yi aç',
    },
    de: {
      tip: 'Mit Gemini zusammenfassen', copyTip: 'Prompt und Transkript kopieren', shift: 'Umschalt+Klick: mehrere Videos auswählen', busy: 'Transkript wird geladen…',
      none: 'Dieses Video hat kein Transkript.', fail: 'Transkript konnte nicht geladen werden.',
      login: 'Für dieses Video ist eine Anmeldung nötig (Altersbeschränkung oder nur für Mitglieder); das Transkript konnte nicht gelesen werden.',
      unplayable: 'Dieses Video kann hier nicht abgespielt werden, daher gibt es kein Transkript.', live: 'Livestreams haben erst nach dem Ende ein Transkript.',
      empty: 'Das Video hat Untertitel, YouTube lieferte sie aber leer. Versuche es später erneut.',
      copied: 'Prompt und Transkript kopiert.', copyFail: 'Kopieren fehlgeschlagen.', bar: '{n} ausgewählt', barGo: 'Gemeinsam zusammenfassen', barClear: 'Leeren',
      limit: 'Höchstens {n} Videos gleichzeitig.', partial: '{n} Video(s) ohne Transkript wurden übersprungen.', ready: 'Transkript bereit.', openIt: 'Gemini öffnen',
    },
    es: {
      tip: 'Resumir con Gemini', copyTip: 'Copiar prompt y transcripción', shift: 'Mayús+clic: seleccionar varios vídeos', busy: 'Obteniendo la transcripción…',
      none: 'Este vídeo no tiene transcripción.', fail: 'No se pudo obtener la transcripción.',
      login: 'Este vídeo requiere iniciar sesión (restricción de edad o solo miembros); no se pudo leer la transcripción.',
      unplayable: 'Este vídeo no se puede reproducir aquí, así que no hay transcripción.', live: 'Las transmisiones en directo no tienen transcripción hasta que terminan.',
      empty: 'El vídeo tiene subtítulos, pero YouTube los devolvió vacíos. Inténtalo más tarde.',
      copied: 'Prompt y transcripción copiados.', copyFail: 'No se pudo copiar.', bar: '{n} seleccionados', barGo: 'Resumir juntos', barClear: 'Limpiar',
      limit: 'Máximo {n} vídeos a la vez.', partial: 'Se omitieron {n} vídeo(s) sin transcripción.', ready: 'Transcripción lista.', openIt: 'Abrir Gemini',
    },
    pt: {
      tip: 'Resumir com o Gemini', copyTip: 'Copiar prompt e transcrição', shift: 'Shift+clique: selecionar vários vídeos', busy: 'Obtendo a transcrição…',
      none: 'Este vídeo não tem transcrição.', fail: 'Não foi possível obter a transcrição.',
      login: 'Este vídeo exige login (restrição de idade ou só para membros); não foi possível ler a transcrição.',
      unplayable: 'Este vídeo não pode ser reproduzido aqui, então não há transcrição.', live: 'Transmissões ao vivo só têm transcrição depois de terminar.',
      empty: 'O vídeo tem legendas, mas o YouTube as devolveu vazias. Tente de novo mais tarde.',
      copied: 'Prompt e transcrição copiados.', copyFail: 'Não foi possível copiar.', bar: '{n} selecionados', barGo: 'Resumir juntos', barClear: 'Limpar',
      limit: 'No máximo {n} vídeos de uma vez.', partial: '{n} vídeo(s) sem transcrição foram ignorados.', ready: 'Transcrição pronta.', openIt: 'Abrir o Gemini',
    },
    fr: {
      tip: 'Résumer avec Gemini', copyTip: 'Copier le prompt et la transcription', shift: 'Maj+clic : sélectionner plusieurs vidéos', busy: 'Récupération de la transcription…',
      none: "Cette vidéo n'a pas de transcription.", fail: 'Impossible de récupérer la transcription.',
      login: "Cette vidéo nécessite une connexion (limite d'âge ou réservée aux membres) ; la transcription n'a pas pu être lue.",
      unplayable: "Cette vidéo ne peut pas être lue ici, il n'y a donc pas de transcription.", live: "Les diffusions en direct n'ont de transcription qu'une fois terminées.",
      empty: 'La vidéo a des sous-titres, mais YouTube les a renvoyés vides. Réessayez plus tard.',
      copied: 'Prompt et transcription copiés.', copyFail: 'Copie impossible.', bar: '{n} sélectionnées', barGo: 'Résumer ensemble', barClear: 'Effacer',
      limit: '{n} vidéos maximum à la fois.', partial: '{n} vidéo(s) sans transcription ont été ignorées.', ready: 'Transcription prête.', openIt: 'Ouvrir Gemini',
    },
    ru: {
      tip: 'Кратко пересказать в Gemini', copyTip: 'Скопировать запрос и транскрипт', shift: 'Shift+клик: выбрать несколько видео', busy: 'Получение транскрипта…',
      none: 'У этого видео нет транскрипта.', fail: 'Не удалось получить транскрипт.',
      login: 'Для этого видео нужен вход (возрастное ограничение или только для участников); транскрипт не удалось прочитать.',
      unplayable: 'Это видео нельзя воспроизвести здесь, поэтому транскрипта нет.', live: 'У прямых трансляций нет транскрипта, пока они не закончатся.',
      empty: 'У видео есть субтитры, но YouTube вернул их пустыми. Попробуйте позже.',
      copied: 'Запрос и транскрипт скопированы.', copyFail: 'Не удалось скопировать.', bar: 'Выбрано: {n}', barGo: 'Пересказать вместе', barClear: 'Сбросить',
      limit: 'Не более {n} видео сразу.', partial: 'Пропущено видео без транскрипта: {n}.', ready: 'Транскрипт готов.', openIt: 'Открыть Gemini',
    },
    ja: {
      tip: 'Gemini で要約', copyTip: 'プロンプトと文字起こしをコピー', shift: 'Shift+クリック: 複数の動画を選択', busy: '文字起こしを取得中…',
      none: 'この動画には文字起こしがありません。', fail: '文字起こしを取得できませんでした。',
      login: 'この動画はログインが必要（年齢制限またはメンバー限定）なため、文字起こしを読み取れませんでした。',
      unplayable: 'この動画はここでは再生できないため、文字起こしがありません。', live: 'ライブ配信は終了するまで文字起こしがありません。',
      empty: '字幕はありますが、YouTube が空で返しました。後でもう一度お試しください。',
      copied: 'プロンプトと文字起こしをコピーしました。', copyFail: 'コピーできませんでした。', bar: '{n} 件選択中', barGo: 'まとめて要約', barClear: 'クリア',
      limit: '一度に選べるのは最大 {n} 本です。', partial: '文字起こしのない {n} 本をスキップしました。', ready: '文字起こしの準備ができました。', openIt: 'Gemini を開く',
    },
  };
  // Same rule as the settings page: the chosen language, or the browser's UI language when set to automatic
  const uiLang = () => {
    let l = YTX.s.ui_lang;
    if (!l || l === 'auto') {
      try { l = chrome.i18n.getUILanguage(); } catch (e) { l = ''; }
      l = (l || navigator.language || 'en').toLowerCase().split(/[-_]/)[0];
    }
    return STR[l] ? l : 'en';
  };
  const str = () => STR[uiLang()];
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  // Language of the summary: its own setting, or the interface language
  const summaryLang = () => (YTX.s.g_lang && YTX.s.g_lang !== 'ui' ? YTX.s.g_lang : uiLang());
  function languageName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || 'English'; } catch (e) { return 'English'; }
  }

  // ---------- Diagnostics ----------
  const version = () => { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } };
  const rand = () => Math.random().toString(36).slice(2) + Date.now().toString(36).slice(-4);
  async function storageSet(obj) { try { await chrome.storage.local.set(obj); return true; } catch (e) { console.warn('[YTX][gemini] storage_set', e); return false; } }
  async function storageGet(k) { try { return (await chrome.storage.local.get(k))[k]; } catch (e) { return undefined; } }

  // Always logs (not only with the debug switch); the final failure is also kept for the settings page
  function warn(stage, err, extra) { console.warn('[YTX][gemini]', stage, err && err.message ? err.message : err, extra || ''); }
  async function recordFailure(id, err, trail) {
    await storageSet({ [LAST_KEY]: { id, code: (err && err.code) || 'fail', message: String(err && err.message || err), trail: trail || [], ts: Date.now(), ver: version(), lang: uiLang(), side: 'youtube' } });
  }
  async function addHistory(rec) {
    const list = (await storageGet(HIST_KEY)) || [];
    list.unshift(rec);
    await storageSet({ [HIST_KEY]: list.slice(0, HIST_MAX) });
  }

  // ---------- Transcript ----------
  const unescapeXml = (s) => s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  // Auto-generated captions are often escaped twice ("&amp;#39;"): the second pass resolves only numeric entities and &amp;,
  // so a real "&lt;" in the speech stays as it is
  const unescapeAgain = (s) => s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');

  // -> [{ t: seconds, s: text }]
  function parseCues(xml) {
    const out = [];
    for (const m of xml.matchAll(/<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const s = unescapeAgain(unescapeXml(m[3].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
      if (!s) continue;
      const a = /\bstart="([\d.]+)"/.exec(m[2]);
      const b = /\bt="(\d+)"/.exec(m[2]);
      out.push({ t: a ? parseFloat(a[1]) : b ? parseInt(b[1], 10) / 1000 : 0, s });
    }
    return out;
  }
  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p2 = (n) => String(n).padStart(2, '0');
    return h ? h + ':' + p2(m) + ':' + p2(s) : p2(m) + ':' + p2(s);
  }
  // With timestamps: one "[mm:ss] text" line per ~30 seconds, so the summary can point back into the video
  function cuesToText(cues, withTime) {
    if (!withTime) return cues.map((c) => c.s).join(' ');
    const lines = [];
    let start = -1e9, buf = [];
    const flush = () => { if (buf.length) lines.push('[' + mmss(start) + '] ' + buf.join(' ')); buf = []; };
    for (const c of cues) {
      if (c.t - start >= 30) { flush(); start = c.t; }
      buf.push(c.s);
    }
    flush();
    return lines.join('\n');
  }

  // The spoken-language track: a manual track in the language of the auto-generated one is the most accurate;
  // else the auto-generated (original) one; else the default audio track's caption; else the first.
  const baseLang = (t) => String(t.languageCode || '').toLowerCase().split('-')[0];
  function pickTrack(pr) {
    const tracks = pr.captionTracks || [];
    const asr = tracks.find((t) => t.kind === 'asr');
    if (asr) return tracks.find((t) => t.kind !== 'asr' && baseLang(t) === baseLang(asr)) || asr;
    const audios = pr.audioTracks || [];
    const audio = audios.find((a) => a.hasDefaultTrack) || audios[0];
    const idx = audio && Number.isInteger(audio.defaultCaptionTrackIndex) ? audio.defaultCaptionTrackIndex : 0;
    return tracks[idx] || tracks[0];
  }

  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  // One retry for rate limits and server errors
  async function fetchRetry(url, opts) {
    let res;
    for (let i = 0; i < 2; i++) {
      res = await fetch(url, opts);
      if (res.status !== 429 && res.status < 500) return res;
      await YTX.sleep(500);
    }
    return res;
  }

  // Bridge to the player API in the page world (content/main-world.js)
  let seq = 0;
  const waiting = new Map();
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (e.source !== window || !m || m.ytxr !== 1) return;
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); w(m.result); }
  });
  function bridge(cmd, ...args) {
    return new Promise((resolve) => {
      const id = 's' + (++seq);
      waiting.set(id, resolve);
      window.postMessage({ ytx: 1, id, cmd, args }, '*');
      setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 1500);
    });
  }

  async function playerFromClient(id, client) {
    const res = await fetchRetry('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client }, videoId: id }),
    });
    if (!res.ok) throw err('http', 'HTTP ' + res.status);
    const p = await res.json();
    const r = p.captions && p.captions.playerCaptionsTracklistRenderer;
    return {
      status: p.playabilityStatus && p.playabilityStatus.status,
      live: !!(p.videoDetails && (p.videoDetails.isLive || p.videoDetails.isLiveContent)),
      captionTracks: (r && r.captionTracks) || [],
      audioTracks: (r && r.audioTracks) || [],
    };
  }

  async function cuesFromTrack(track, credentials) {
    const res = await fetchRetry(track.baseUrl, { credentials });
    if (!res.ok) throw err('http', 'timedtext HTTP ' + res.status);
    return parseCues(await res.text());
  }

  // Last resort: read the "Show transcript" panel of the page
  async function domCues(id) {
    if (location.pathname !== '/watch' || new URLSearchParams(location.search).get('v') !== id) return null;
    const segs = () => document.querySelectorAll('ytd-transcript-segment-renderer');
    let opened = false;
    if (!segs().length) {
      const btn = document.querySelector('ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer yt-button-shape button');
      if (!btn) return null;
      btn.click(); opened = true;
    }
    const found = await YTX.waitFor(() => (segs().length ? segs() : null), 6000);
    let cues = null;
    if (found) {
      cues = [...found].map((el) => {
        const ts = (el.querySelector('.segment-timestamp') || {}).textContent || '';
        const s = ((el.querySelector('.segment-text') || {}).textContent || '').replace(/\s+/g, ' ').trim();
        const t = ts.trim().split(':').reduce((acc, p) => acc * 60 + (Number(p) || 0), 0);
        return { t, s };
      }).filter((c) => c.s);
    }
    if (opened) {
      const close = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button');
      if (close) close.click();
    }
    return cues && cues.length ? cues : null;
  }

  // Fallback chain: the page's own player response (signed in), then the Android, iOS and TV clients, then the page's transcript panel.
  async function fetchTranscript(id, withTime) {
    const trail = [];
    let status = '', live = false, sawTracks = false, sawNoTracks = false, lastErr = null;
    const stages = [['page', async () => {
      const r = await bridge('getCaptionTracks', id);
      return r ? { pr: r, credentials: 'include' } : null;
    }]].concat(CLIENTS.map(([name, client]) => [name, async () => ({ pr: await playerFromClient(id, client), credentials: 'omit' })]));

    for (const [name, fn] of stages) {
      try {
        const got = await fn();
        if (!got) { trail.push(name + ':unavailable'); continue; }
        const pr = got.pr;
        if (pr.live) live = true;
        if (pr.status && pr.status !== 'OK') { status = status || pr.status; trail.push(name + ':' + pr.status); if (!pr.captionTracks.length) continue; }
        if (!pr.captionTracks.length) { sawNoTracks = true; trail.push(name + ':no_captions'); continue; }
        sawTracks = true;
        const track = pickTrack(pr);
        const cues = await cuesFromTrack(track, got.credentials);
        if (!cues.length) { trail.push(name + ':timedtext_empty'); continue; }
        return { text: cuesToText(cues, withTime).slice(0, MAX_CHARS), lang: track.languageCode || '', via: name };
      } catch (e) { lastErr = e; trail.push(name + ':' + (e.code || 'error')); warn(name, e); }
    }
    try {
      const cues = await domCues(id);
      if (cues) return { text: cuesToText(cues, withTime).slice(0, MAX_CHARS), lang: '', via: 'dom' };
      trail.push('dom:none');
    } catch (e) { trail.push('dom:error'); warn('dom', e); }

    let code = 'fail';
    if (sawTracks) code = 'empty';
    else if (status === 'LOGIN_REQUIRED') code = 'login';
    else if (status === 'UNPLAYABLE' || status === 'ERROR') code = 'unplayable';
    else if (live) code = 'live';
    else if (sawNoTracks) code = 'none';
    const e = err(code, code + (lastErr ? ': ' + lastErr.message : ''));
    e.trail = trail;
    throw e;
  }
  const messageFor = (e) => { const s = str(); return s[e && e.code] || s.fail; };

  // ---------- Prompts ----------
  const link = (id) => 'https://www.youtube.com/watch?v=' + id;

  // attached: the transcript is a file attached to the chat; otherwise it follows in the same message
  function buildPrompt(info, tr, attached) {
    const s = YTX.s;
    const lang = languageName(summaryLang());
    const withTime = !!s.g_timestamps;
    const where = attached ? 'The attached text file is' : 'The text below the line "--- TRANSCRIPT ---" is';
    const intro = `${where} the transcript of a YouTube video (spoken language: ${tr.lang || 'unknown'})${withTime ? ', with [mm:ss] timestamps' : ''}.`;
    const meta = [`Video: ${info.title || '(untitled)'}${info.channel ? ' — ' + info.channel : ''}`, `Link: ${link(info.id)}`];
    const timeline = withTime ? [
      '## Timeline',
      `5-12 lines, one per topic, in order. Format each line as: [mm:ss](https://www.youtube.com/watch?v=${info.id}&t=SECONDSs) — topic, where SECONDS is the timestamp converted to seconds.`,
    ] : [];
    const rules = [
      'Rules:',
      '- Write only what is in the transcript; add no opinions or outside knowledge.',
      '- Keep important numbers, names, dates and terms.',
      '- Skip greetings, ads, calls to subscribe and repetition.',
      '- The transcript may be auto-generated: silently fix obvious spelling or recognition mistakes without changing the meaning.',
      '- Use plain, short sentences.',
    ];
    const tpl = s.g_template || 'summary';
    let body;
    if (tpl === 'custom' && String(s.g_customPrompt || '').trim()) {
      const vars = { title: info.title || '', channel: info.channel || '', link: link(info.id), language: lang };
      body = [fmt(String(s.g_customPrompt), vars)];
      return [intro, '', ...meta, '', ...body].join('\n');
    }
    if (tpl === 'notes') {
      body = [
        `Turn the video into study notes in ${lang} (write the headings in ${lang}).`, '',
        'Use this structure:',
        '## Overview', 'Two sentences.',
        '## Notes', '- Group the content under short ### topic headings; under each, concise bullets with the key facts, steps and examples.',
        '## Key terms', '- term: one-line definition (only terms the video explains).',
        '## Review questions', '- 3-5 questions that check understanding.',
        ...timeline,
      ];
    } else if (tpl === 'qa') {
      body = [
        `Turn the video into question-and-answer pairs in ${lang} (write the headings in ${lang}).`, '',
        'Use this structure:',
        '## Questions and answers', '- 8-12 pairs. **Q:** the question a curious viewer would ask. **A:** a one-to-three sentence answer taken from the video.',
        '## Remember this', 'One sentence.',
        ...timeline,
      ];
    } else if (tpl === 'worth') {
      body = [
        `Help me decide whether this video is worth watching. Answer in ${lang} (write the headings in ${lang}).`, '',
        'Use this structure:',
        '## Verdict', 'Watch / Skim / Skip, plus one sentence why.',
        '## What it offers', '- 3-5 bullets of the real substance.',
        '## Best parts', '- The most valuable segments' + (withTime ? ', each with its timestamp link (same format as in the timeline).' : '.'),
        '## Who it is for', 'One sentence.',
      ];
    } else {
      body = [
        `Summarize the video in ${lang}, in a way that can be scanned quickly.`, '',
        `Use exactly this structure (write the headings in ${lang}):`,
        '## Short summary', 'What the video is about and its conclusion: at most 3 short sentences.',
        '## Key points',
        '- One idea per line, at most 2 short sentences, most important first. 5-8 bullets (up to 10 for a very long video).',
        '- Mark the most important phrase of each bullet in **bold** (once per bullet).',
        '## Remember this', 'One sentence: the one thing a viewer should remember.',
        ...timeline,
      ];
    }
    return [intro, '', ...meta, '', ...body, '', ...rules].join('\n');
  }

  // Several videos in one file: a short summary of each plus a comparison
  function buildBatchPrompt(items) {
    const lang = languageName(summaryLang());
    const list = items.map((it, i) => `${i + 1}. ${it.info.title || '(untitled)'}${it.info.channel ? ' — ' + it.info.channel : ''} (${link(it.info.id)})`);
    return [
      `The attached text file holds the transcripts of ${items.length} YouTube videos, each starting with a line "=== VIDEO n ===". Write in ${lang} (write the headings in ${lang}).`,
      '', 'Videos:', ...list, '',
      'Use exactly this structure:',
      '## Per video', 'For each video: "### n. title", then a one-sentence summary and 3-5 key bullets (most important phrase in **bold**).',
      '## Comparison', '- What the videos agree on.', '- Where they differ or contradict each other.', '- Which one to watch first, and why.',
      '', 'Rules:',
      '- Write only what is in the transcripts; add no outside knowledge.',
      '- Keep important numbers, names, dates and terms.',
      '- The transcripts may be auto-generated: silently fix obvious recognition mistakes.',
    ].join('\n');
  }

  // ---------- Notices in the YouTube tab ----------
  let toastEl = null, toastTimer = null;
  function toast(text, action, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'ytx-gem-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = '';
    const span = document.createElement('span');
    span.textContent = text;
    toastEl.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { hideToast(); action.fn(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('ytx-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms || 6000);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove('ytx-on'); }

  // ---------- Hand-off to the Gemini tab ----------
  async function track(token) {
    const idx = (await storageGet(IDX_KEY)) || {};
    const now = Date.now();
    const dead = Object.keys(idx).filter((k) => now - idx[k] > STALE_MS);
    dead.forEach((k) => delete idx[k]);
    if (dead.length) { try { await chrome.storage.local.remove(dead.map((k) => KEY_PREFIX + k)); } catch (e) { /* ignore */ } }
    idx[token] = now;
    await storageSet({ [IDX_KEY]: idx });
  }
  const put = (token, v) => storageSet({ [KEY_PREFIX + token]: Object.assign({ token, ts: Date.now(), lang: uiLang() }, v) });

  function openGemini(token) {
    const n = parseInt(YTX.s.g_account, 10) || 0;
    const a = document.createElement('a');
    a.href = 'https://gemini.google.com/' + (n > 0 ? 'u/' + n + '/' : '') + 'app#ytx=' + token;
    a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  const busyIds = new Set();
  const settle = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e }));

  // mode: 'gemini' (open Gemini), 'copy' (clipboard), 'prepare' (fetch now, open Gemini on the next click: used by "retry" links)
  async function run(id, info, btn, mode) {
    if (busyIds.has(id)) return;
    busyIds.add(id);
    if (btn) btn.classList.add('ytx-gem-busy');
    const token = rand();
    const hist = { id, title: info.title || '', ts: Date.now() };
    try {
      await track(token);
      const p = settle(fetchTranscript(id, !!YTX.s.g_timestamps));
      let first = null;
      if (mode === 'gemini') first = await Promise.race([p, YTX.sleep(GESTURE_WAIT_MS).then(() => null)]);
      else first = await p;

      const record = (tr) => ({ state: 'ready', kind: 'single', prompt: buildPrompt(info, tr, true), transcript: tr.text, fileName: 'transcript-' + id + '.txt', autoSend: !!YTX.s.g_autoSend });

      if (first && first.err) throw first.err; // quick failure: no empty Gemini tab is opened
      if (mode === 'copy') {
        const tr = first.ok;
        const ok = await copyText(buildPrompt(info, tr, false) + '\n\n--- TRANSCRIPT ---\n' + tr.text);
        toast(ok ? str().copied : str().copyFail);
        hist.state = ok ? 'ok' : 'error'; hist.mode = 'copy';
      } else if (mode === 'prepare') {
        const tr = first.ok;
        toast(str().ready, { label: str().openIt, fn: async () => { openGemini(token); await put(token, record(tr)); } }, 30000);
        hist.state = 'ok'; hist.mode = 'prepare';
      } else {
        openGemini(token);                                   // inside the click gesture, so the popup blocker allows it
        if (first) await put(token, record(first.ok));
        else {
          await put(token, { state: 'loading' });
          const r = await p;
          if (r.err) {
            await put(token, { state: 'error', code: r.err.code || 'fail', message: messageFor(r.err) });
            throw r.err;
          }
          await put(token, record(r.ok));
        }
        hist.state = 'ok'; hist.mode = 'gemini';
      }
    } catch (e) {
      warn('run', e, e && e.trail);
      toast(messageFor(e));
      hist.state = 'error'; hist.code = (e && e.code) || 'fail';
      await recordFailure(id, e, e && e.trail);
    } finally {
      await addHistory(hist);
      busyIds.delete(id);
      if (btn) btn.classList.remove('ytx-gem-busy');
    }
  }

  // ---------- Several videos ----------
  const sel = new Map(); // id -> info
  let bar = null;
  function renderBar() {
    document.querySelectorAll('[' + TILE_ATTR + ']').forEach((t) => t.classList.toggle('ytx-gem-sel', sel.has(t.getAttribute(TILE_ATTR))));
    if (!sel.size) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ytx-gem-bar';
      const label = document.createElement('span');
      const go = document.createElement('button'); go.type = 'button'; go.className = 'ytx-go';
      const clr = document.createElement('button'); clr.type = 'button';
      go.addEventListener('click', () => runBatch());
      clr.addEventListener('click', () => { sel.clear(); renderBar(); });
      bar.append(label, go, clr);
      document.body.appendChild(bar);
    }
    const [label, go, clr] = bar.children;
    label.textContent = fmt(str().bar, { n: sel.size });
    go.textContent = str().barGo;
    clr.textContent = str().barClear;
  }
  function toggleSelect(id, info) {
    if (sel.has(id)) sel.delete(id);
    else if (sel.size >= MAX_BATCH) { toast(fmt(str().limit, { n: MAX_BATCH })); return; }
    else sel.set(id, info);
    renderBar();
  }
  async function runBatch() {
    if (!sel.size || busyIds.has('batch')) return;
    busyIds.add('batch');
    const items = [...sel].map(([id, info]) => ({ id, info }));
    const token = rand();
    if (bar) bar.classList.add('ytx-busy');
    try {
      await track(token);
      openGemini(token);
      await put(token, { state: 'loading' });
      const results = await Promise.all(items.map((it) => settle(fetchTranscript(it.id, false))));
      const good = items.map((it, i) => Object.assign({}, it, { tr: results[i].ok })).filter((it) => it.tr);
      const skipped = items.length - good.length;
      if (!good.length) {
        const e = results[0].err || err('fail');
        await put(token, { state: 'error', code: e.code || 'fail', message: messageFor(e) });
        await recordFailure(items[0].id, e, e.trail);
        toast(messageFor(e));
        return;
      }
      const text = good.map((it, i) => `=== VIDEO ${i + 1} === ${it.info.title || it.id} (${link(it.id)}) ===\n${it.tr.text}`).join('\n\n');
      await put(token, { state: 'ready', kind: 'batch', prompt: buildBatchPrompt(good), transcript: text, fileName: 'transcripts-' + good.length + '-videos.txt', autoSend: !!YTX.s.g_autoSend });
      if (skipped) toast(fmt(str().partial, { n: skipped }));
      await addHistory({ id: good[0].id, title: good.map((g) => g.info.title).join(' + ').slice(0, 120), ts: Date.now(), state: 'ok', mode: 'batch' });
      sel.clear(); renderBar();
    } catch (e) {
      warn('batch', e);
      toast(messageFor(e));
      await recordFailure(items[0].id, e, e && e.trail);
    } finally {
      busyIds.delete('batch');
      if (bar) bar.classList.remove('ytx-busy');
    }
  }

  // ---------- Buttons ----------
  function svgIcon(d, fill, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || '16'); svg.setAttribute('height', size || '16');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    svg.appendChild(p);
    return svg;
  }
  const SPARK = 'M12 1.5C12.6 7.6 16.4 11.4 22.5 12 16.4 12.6 12.6 16.4 12 22.5 11.4 16.4 7.6 12.6 1.5 12 7.6 11.4 11.4 7.6 12 1.5Z';
  const COPY = 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z';
  const icon = () => svgIcon(SPARK, '#8ab4f8');

  const titleOf = (tile) => {
    const t = tile.querySelector('#video-title, h3, [class*="lockup-metadata-view-model-wiz__title"]');
    return t ? (t.getAttribute('title') || t.textContent).trim() : '';
  };
  const channelOf = (tile) => {
    const a = tile.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], ytd-channel-name a');
    return a ? a.textContent.trim() : '';
  };
  function watchInfo(id) {
    const meta = document.querySelector('ytd-watch-metadata');
    const h1 = meta && meta.querySelector('h1');
    const ch = meta && meta.querySelector('#owner a[href^="/@"], #owner a[href^="/channel/"], ytd-channel-name a');
    return { id, title: h1 ? h1.textContent.trim() : document.title.replace(/ - YouTube$/, ''), channel: ch ? ch.textContent.trim() : '' };
  }

  function addButton(tile, id) {
    const info = () => ({ id, title: titleOf(tile), channel: channelOf(tile) });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ytx-gem-btn';
    btn.title = str().tip + '\n' + str().shift;
    btn.setAttribute('aria-label', str().tip);
    btn.appendChild(icon());
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) toggleSelect(id, info());
      else run(id, info(), btn, 'gemini');
    }, true);
    const cp = document.createElement('button');
    cp.type = 'button';
    cp.className = 'ytx-gem-btn ytx-gem-copy';
    cp.title = str().copyTip;
    cp.setAttribute('aria-label', str().copyTip);
    cp.appendChild(svgIcon(COPY, '#bdc1c6', '14'));
    cp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(id, info(), cp, 'copy'); }, true);
    tile.append(btn, cp);
    tile.setAttribute(TILE_ATTR, id);
    tile.classList.toggle('ytx-gem-sel', sel.has(id));
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
      // Tiles are recycled for other videos: replace the old buttons
      tile.querySelectorAll(':scope > .ytx-gem-btn').forEach((b) => b.remove());
      addButton(tile, m[1]);
    });
  }

  // Watch page: a pill button (and a copy button) in the action row under the player
  let autoRan = '';
  function scanWatch() {
    const host = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (!host || !id) return;
    const cur = host.querySelector(':scope > .ytx-gem-watch');
    if (!cur || cur.dataset.id !== id) {
      host.querySelectorAll(':scope > .ytx-gem-watch, :scope > .ytx-gem-watch-copy').forEach((b) => b.remove());
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ytx-gem-watch';
      btn.dataset.id = id;
      btn.title = str().tip;
      btn.appendChild(icon());
      const label = document.createElement('span');
      label.textContent = str().tip;
      btn.appendChild(label);
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(id, watchInfo(id), btn, 'gemini'); }, true);
      const cp = document.createElement('button');
      cp.type = 'button';
      cp.className = 'ytx-gem-watch-copy';
      cp.title = str().copyTip;
      cp.setAttribute('aria-label', str().copyTip);
      cp.appendChild(svgIcon(COPY, 'currentColor', '16'));
      cp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(id, watchInfo(id), cp, 'copy'); }, true);
      host.prepend(cp);
      host.prepend(btn);
    }
    // "Retry" links on the settings page open the video with #ytx-sum: fetch now, open Gemini on the next click
    if (location.hash === '#ytx-sum' && autoRan !== id) {
      autoRan = id;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      run(id, watchInfo(id), host.querySelector(':scope > .ytx-gem-watch'), 'prepare');
    }
  }

  // Keyboard shortcut (watch page)
  function onKey(e) {
    const key = YTX.s.g_key;
    if (!key) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (YTX.comboFromEvent(e) !== key) return;
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (!id) return;
    e.preventDefault(); e.stopPropagation();
    run(id, watchInfo(id), document.querySelector('.ytx-gem-watch'), 'gemini');
  }

  function scanAll() { scan(); scanWatch(); }

  function clearAll() {
    document.querySelectorAll('.ytx-gem-watch, .ytx-gem-watch-copy').forEach((b) => b.remove());
    document.querySelectorAll('.ytx-gem-btn').forEach((b) => b.remove());
    document.querySelectorAll('[' + TILE_ATTR + ']').forEach((el) => { el.removeAttribute(TILE_ATTR); el.classList.remove('ytx-gem-sel'); });
    sel.clear(); renderBar(); hideToast();
  }

  YTX.register({
    id: 'gemini',
    start() { YTX.onMutate(scanAll); YTX.onNav(scanAll); window.addEventListener('keydown', onKey, true); scanAll(); },
    stop() { YTX.offMutate(scanAll); YTX.offNav(scanAll); window.removeEventListener('keydown', onKey, true); clearAll(); },
    update() { scanAll(); },
  });
})();
