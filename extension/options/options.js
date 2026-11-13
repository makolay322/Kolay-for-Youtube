/* Settings page: generated from the schema, changes are saved instantly. */
(function () {
  'use strict';
  const YTX = window.YTX;
  const { t, tr } = YTX;
  const REPEAT_KEY = 'repeatCounts';
  const GEM_LAST = 'ytxGeminiLast', GEM_HEALTH = 'ytxGeminiHealth', GEM_HIST = 'ytxGeminiHistory';
  let settings = Object.assign({}, YTX.DEFAULTS);
  let rows = {}; // key -> { item, el }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const h = YTX.h;
  let toastTimer;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms || 2400);
  }

  let savedTimer;
  function flashSaved() {
    const el = $('#saved');
    el.classList.add('on');
    clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove('on'), 1400);
  }

  // Batch changes and write once (sliders fire many events)
  let patch = {}, saveTimer = null;
  function set(key, value) {
    settings[key] = value;
    patch[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { const p = patch; patch = {}; await YTX.saveSettings(p); flashSaved(); }, 150);
    updateDeps();
    if (YTX.ITEMS[key].type === 'shortcut') updateConflicts();
    if (key === 'ui_lang') applyLang();
  }

  const ctx = { get: (k) => settings[k], set, run: (id) => runAction(id) };

  async function runAction(id) {
    if (id === 'repeatStats') {
      const r = (await chrome.storage.local.get(REPEAT_KEY))[REPEAT_KEY] || {};
      const ids = Object.keys(r);
      const hidden = ids.filter((k) => r[k].c >= settings.r_max).length;
      toast(t('ui.statsMsg', 'Tracked videos: {n}\nHidden (≥{max} impressions): {hidden}', { n: ids.length, max: settings.r_max, hidden }));
    } else if (id === 'repeatReset') {
      if (!confirm(t('ui.confirmCounters', 'Delete all impression counters?'))) return;
      await chrome.storage.local.remove(REPEAT_KEY);
      toast(t('ui.countersReset', 'Counters reset.'));
    } else if (id === 'gemLast') {
      const last = (await chrome.storage.local.get(GEM_LAST))[GEM_LAST];
      if (!last) { toast(t('ui.gemNone', 'No problem recorded.')); return; }
      toast(t('ui.gemLast', '{when} · {side} · {stage}: {msg}', {
        when: new Date(last.ts).toLocaleString(), side: last.side || 'youtube', stage: last.stage || last.code || '', msg: last.message || '',
      }), 12000);
    } else if (id === 'gemCopy') {
      const r = await chrome.storage.local.get([GEM_LAST, GEM_HEALTH, GEM_HIST]);
      const info = { version: chrome.runtime.getManifest().version, browser: navigator.userAgent, last: r[GEM_LAST] || null, geminiPageCheck: r[GEM_HEALTH] || null, recent: (r[GEM_HIST] || []).slice(0, 5) };
      try { await navigator.clipboard.writeText(JSON.stringify(info, null, 2)); toast(t('ui.gemCopied', 'Diagnostics copied.')); }
      catch (e) { toast(t('ui.gemCopyFail', 'Could not copy.')); }
    } else if (id === 'gemClear') {
      if (!confirm(t('ui.gemConfirmClear', 'Delete the summary history and the stored problem?'))) return;
      await chrome.storage.local.remove([GEM_LAST, GEM_HEALTH, GEM_HIST]);
      renderHistory();
      toast(t('ui.gemCleared', 'History cleared.'));
    }
  }

  // Recent Gemini summaries under the diagnostics section; "Retry" opens the video, fetches the transcript and offers to open Gemini
  async function renderHistory() {
    const box = $('#gemHist');
    if (!box) return;
    const list = (await chrome.storage.local.get(GEM_HIST))[GEM_HIST] || [];
    box.textContent = '';
    box.append(h('div', { class: 'gem-hist-title' }, t('ui.gemHist', 'Recent summaries')));
    if (!list.length) { box.append(h('div', { class: 'desc' }, t('ui.gemHistEmpty', 'Nothing yet.'))); return; }
    for (const it of list) {
      const retry = it.mode === 'batch' ? null : h('a', { href: 'https://www.youtube.com/watch?v=' + encodeURIComponent(it.id) + '#ytx-sum', target: '_blank', rel: 'noopener' }, t('ui.gemRetry', 'Retry'));
      box.append(h('div', { class: 'gem-hist-row' + (it.state === 'error' ? ' bad' : '') },
        h('span', { class: 'gem-hist-mark' }, it.state === 'error' ? '✗' : '✓'),
        h('span', { class: 'gem-hist-name' }, it.title || it.id),
        h('span', { class: 'gem-hist-when' }, new Date(it.ts).toLocaleString() + (it.code ? ' · ' + it.code : '')),
        retry));
    }
  }

  function build() {
    const nav = $('#nav'), main = $('#main');
    nav.textContent = ''; main.textContent = ''; rows = {};
    let lastGroup = null;
    YTX.SCHEMA.forEach((sec) => {
      const title = tr.secTitle(sec);
      if (sec.group !== lastGroup) { lastGroup = sec.group; nav.append(h('div', { class: 'nav-group' }, tr.group(sec.group))); }
      const a = h('a', { href: '#sec_' + sec.id, onclick: (e) => { e.preventDefault(); $('#sec_' + sec.id).scrollIntoView({ behavior: 'smooth' }); } }, title);
      a.dataset.sec = sec.id;
      nav.append(a);
      const card = h('section', { id: 'sec_' + sec.id, class: sec.group === 'other' ? 'minor' : '' },
        h('div', { class: 'sec-head' }, h('h2', null, title),
          h('button', { class: 'sec-reset', onclick: () => resetSection(sec) }, t('ui.resetSection', 'Reset section'))),
        h('p', { class: 'sec-desc' }, tr.secDesc(sec)));
      for (const item of sec.items) {
        const wide = item.type === 'textarea';
        const lab = tr.label(item), dsc = tr.desc(item);
        const label = h('div', null,
          h(item.key ? 'label' : 'div', { class: 'label', for: item.key && item.type !== 'shortcut' ? 'f_' + item.key : null }, lab),
          dsc ? h('div', { class: 'desc' }, dsc) : null,
          item.type === 'shortcut' ? h('div', { class: 'conflict-msg' }) : null);
        const ctl = h('div', { class: 'ctl' }, YTX.control(item, ctx));
        const row = h('div', { class: 'row' + (wide ? ' wide' : '') }, label, ctl);
        // Search matches the current language and English
        row.dataset.text = [lab, dsc, title, item.label, item.desc, sec.title].join(' ').toLowerCase();
        if (item.key) rows[item.key] = { item, el: row };
        card.append(row);
      }
      if (sec.id === 'geminiDiag') card.append(h('div', { id: 'gemHist', class: 'gem-hist' }));
      main.append(card);
    });
    renderHistory();
    updateDeps();
    updateConflicts();
    observeSections();
    filter();
  }

  function updateDeps() {
    for (const { item, el } of Object.values(rows)) el.classList.toggle('disabled', !YTX.depOk(item, settings));
  }

  // Two shortcuts on the same key: mark both
  function updateConflicts() {
    const sc = Object.values(rows).filter(({ item }) => item.type === 'shortcut');
    for (const { item, el } of sc) {
      const v = settings[item.key];
      const other = v && sc.find((o) => o.item.key !== item.key && settings[o.item.key] === v);
      el.classList.toggle('conflict', !!other);
      el.querySelector('.conflict-msg').textContent = other ? t('ui.conflict', 'Also used by “{name}”.', { name: tr.label(other.item) }) : '';
    }
  }

  async function resetSection(sec) {
    if (!confirm(t('ui.confirmSection', 'Reset the settings in “{title}” to defaults?', { title: tr.secTitle(sec) }))) return;
    const p = {};
    sec.items.forEach((it) => { if (it.key) p[it.key] = it.def; });
    await YTX.saveSettings(p);
    settings = await YTX.loadSettings();
    applyLang(); toast(t('ui.sectionReset', 'Section reset.'));
  }

  // Search
  const search = $('#search');
  function filter() {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll('.row').forEach((r) => r.classList.toggle('hidden', !!q && !r.dataset.text.includes(q)));
    let any = false;
    document.querySelectorAll('#main section').forEach((s) => {
      const vis = !q || !!s.querySelector('.row:not(.hidden)');
      s.style.display = vis ? '' : 'none';
      any = any || vis;
    });
    const nr = $('#noresults');
    nr.hidden = any;
    if (!any) nr.textContent = t('ui.noResults', 'No settings match “{q}”.', { q: search.value.trim() });
  }
  search.addEventListener('input', filter);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; filter(); search.blur(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.classList.contains('keybox')) {
      e.preventDefault(); search.focus();
    }
  });

  // Language picker in the header (same setting as General › Language)
  const langSel = $('#lang');
  langSel.append(...YTX.ITEMS.ui_lang.options.map((o) => h('option', { value: o[0] }, tr.option(YTX.ITEMS.ui_lang, o))));
  langSel.addEventListener('change', () => set('ui_lang', langSel.value));

  function applyLang() {
    YTX.setLang(settings.ui_lang);
    document.title = 'Kolay for YouTube – ' + t('ui.settings', 'Settings');
    YTX.applyStatic();
    langSel.value = settings.ui_lang;
    langSel.options[0].textContent = tr.option(YTX.ITEMS.ui_lang, YTX.ITEMS.ui_lang.options[0]);
    build();
  }

  // Export / import / reset
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'kolay-youtube-settings.json' });
    document.body.append(a); a.click(); a.remove();
  });
  $('#import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const clean = {};
      for (const k of Object.keys(YTX.DEFAULTS)) if (k in obj && typeof obj[k] === typeof YTX.DEFAULTS[k]) clean[k] = obj[k];
      await YTX.replaceSettings(clean);
      settings = await YTX.loadSettings(); applyLang();
      toast(t('ui.imported', '{n} settings imported.', { n: Object.keys(clean).length }));
    } catch (err) { toast(t('ui.badFile', 'Invalid settings file.')); }
  });
  $('#reset').addEventListener('click', async () => {
    if (!confirm(t('ui.confirmAll', 'Reset all settings to defaults?'))) return;
    await YTX.replaceSettings({});
    settings = await YTX.loadSettings(); applyLang(); toast(t('ui.allReset', 'Settings reset.'));
  });

  // Highlight the active section in the side menu while scrolling
  const obs = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) {
      document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.sec === e.target.id.slice(4)));
    } });
  }, { rootMargin: '-20% 0px -70% 0px' });
  function observeSections() { obs.disconnect(); document.querySelectorAll('#main section').forEach((s) => obs.observe(s)); }

  // Refresh the page if settings change elsewhere (popup, shortcut)
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch[YTX.STORE_KEY] || Object.keys(patch).length) return;
    const next = Object.assign({}, YTX.DEFAULTS, ch[YTX.STORE_KEY].newValue || {});
    const changed = Object.keys(next).filter((k) => next[k] !== settings[k]);
    if (!changed.length || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    settings = next; applyLang();
  });

  (async function init() {
    settings = await YTX.loadSettings();
    $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
    applyLang();
    if (location.hash.startsWith('#sec_')) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  })();
})();
