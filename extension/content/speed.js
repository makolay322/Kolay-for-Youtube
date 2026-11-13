/* Video speed on all sites: G = preset speed, R = 1x, O = slower, P = faster.
 * The last speed is remembered browser-wide (chrome.storage.local) and applied to every video. */
(function () {
  'use strict';
  const YTX = window.YTX;
  if (!YTX || !window.chrome || !chrome.storage || window.__ytxSpeed) return;
  window.__ytxSpeed = true;

  const KEY = 'ytxSpeed';
  const SITES_KEY = 'ytxSpeedSites'; // { hostname: speed } when "remember separately for each site" is on
  let sites = {};
  let s = Object.assign({}, YTX.DEFAULTS);
  // On-screen label; kept here so the all-sites script stays tiny (no locale files)
  const SPEED_WORD = { en: 'Speed', tr: 'Hız', es: 'Velocidad', pt: 'Velocidade', de: 'Geschwindigkeit', fr: 'Vitesse', ru: 'Скорость', ja: '速度' };
  function speedWord() {
    let l = s.ui_lang;
    if (!l || l === 'auto') { try { l = chrome.i18n.getUILanguage(); } catch (e) { l = navigator.language; } }
    return SPEED_WORD[String(l).toLowerCase().split(/[-_]/)[0]] || SPEED_WORD.en;
  }
  let rate = 1;
  let gen = 0;                 // bumped when the user changes speed; cancels pending automatic applies
  const seen = new WeakMap();  // video -> last applied source key
  let osdEl = null, osdTimer = null;

  const active = () => !!(s.enabled && s.sp_on);
  const clamp = (r) => Math.round(Math.min(16, Math.max(0.1, r)) * 100) / 100;
  const area = (v) => v.clientWidth * v.clientHeight;

  function pickVideo() {
    const all = [...document.querySelectorAll('video')];
    if (!all.length) return null;
    const playing = all.filter((v) => !v.paused && !v.ended);
    return (playing.length ? playing : all).sort((a, b) => area(b) - area(a))[0];
  }

  function osd(v, text) {
    if (!s.sp_osd) return;
    if (!osdEl) {
      osdEl = document.createElement('div');
      osdEl.setAttribute('style', 'position:fixed;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.75);color:#fff;' +
        'padding:6px 12px;border-radius:8px;font:600 16px/1.2 system-ui,sans-serif;transition:opacity .15s;opacity:0');
    }
    const host = document.fullscreenElement || document.body;
    if (osdEl.parentElement !== host) host.appendChild(osdEl);
    const r = v.getBoundingClientRect();
    osdEl.style.left = Math.max(8, r.left + 12) + 'px';
    osdEl.style.top = Math.max(8, r.top + 12) + 'px';
    osdEl.textContent = text;
    osdEl.style.opacity = '1';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => { if (osdEl) osdEl.style.opacity = '0'; }, 900);
  }

  function setRate(v, r) {
    v.playbackRate = r;
    v.preservesPitch = v.webkitPreservesPitch = !!s.sp_pitch;
  }

  // User action: apply, save and show the speed
  function userSet(r) {
    const v = pickVideo();
    if (!v) return false;
    r = clamp(r);
    gen++;
    rate = r;
    setRate(v, r);
    try {
      if (s.sp_perSite) { sites[location.hostname] = r; chrome.storage.local.set({ [SITES_KEY]: sites }); }
      else chrome.storage.local.set({ [KEY]: r });
    } catch (e) { /* extension was reloaded */ }
    osd(v, `${speedWord()}: ${r}×`);
    return true;
  }

  // New video: apply the remembered speed (again shortly after if the site resets it)
  function autoApply(v) {
    if (!active() || !s.sp_remember || !(v instanceof HTMLVideoElement)) return;
    const key = (v.currentSrc || v.src || '') + '|' + location.href;
    if (seen.get(v) === key) return;
    seen.set(v, key);
    const myGen = gen;
    const go = () => { if (gen === myGen && active() && Math.abs(v.playbackRate - rate) > 0.001) setRate(v, rate); };
    setRate(v, rate);
    [300, 1200].forEach((ms) => setTimeout(go, ms));
  }

  function onMedia(e) { autoApply(e.target); }

  function onKey(e) {
    if (!active()) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const combo = YTX.comboFromEvent(e);
    if (!combo) return;
    const acts = [
      ['sp_kPreset', () => s.sp_preset], ['sp_kReset', () => 1],
      ['sp_kSlow', (v) => v.playbackRate - s.sp_step], ['sp_kFast', (v) => v.playbackRate + s.sp_step],
    ];
    for (const [key, calc] of acts) {
      if (!s[key] || s[key] !== combo) continue;
      const v = pickVideo();
      if (!v) return; // no video on the page: leave the key alone
      e.preventDefault(); e.stopPropagation();
      userSet(calc(v));
      return;
    }
  }

  function start() {
    ['loadedmetadata', 'loadstart', 'playing'].forEach((n) => document.addEventListener(n, onMedia, true));
    window.addEventListener('keydown', onKey, true);
    document.querySelectorAll('video').forEach((v) => { if (v.readyState >= 1) autoApply(v); });
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch[YTX.STORE_KEY]) s = Object.assign({}, YTX.DEFAULTS, ch[YTX.STORE_KEY].newValue || {});
    if (ch[SITES_KEY]) {
      sites = ch[SITES_KEY].newValue || {};
      if (s.sp_perSite && typeof sites[location.hostname] === 'number') rate = clamp(sites[location.hostname]);
    }
    if (ch[KEY] && typeof ch[KEY].newValue === 'number' && !s.sp_perSite) rate = clamp(ch[KEY].newValue); // changed in another tab: for upcoming videos
  });

  (async function boot() {
    try {
      const [a, b] = await Promise.all([YTX.loadSettings(), chrome.storage.local.get([KEY, SITES_KEY])]);
      s = a;
      sites = b[SITES_KEY] || {};
      if (typeof b[KEY] === 'number') rate = clamp(b[KEY]);
      if (s.sp_perSite) rate = typeof sites[location.hostname] === 'number' ? clamp(sites[location.hostname]) : 1;
    } catch (e) { return; }
    start();
  })();
})();
