/* Clutter hider. */
(function () {
  'use strict';
  const YTX = window.YTX;
  const ATTR = 'data-ytx-clutter';

  const LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/shorts/"], a[href*="list="], a[href^="/playlist"]';
  const INNER_TILE_SELECTOR = [
    'ytd-compact-video-renderer', 'ytd-compact-playlist-renderer', 'ytd-compact-radio-renderer', 'yt-lockup-view-model',
    'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-radio-renderer', 'ytd-playlist-renderer',
    'ytm-shorts-lockup-view-model', 'ytd-reel-item-renderer',
  ].join(',');
  // The playlist panel currently being played is never hidden
  const NEVER_HIDE = 'ytd-playlist-panel-video-renderer, ytd-playlist-panel-renderer';

  const PROGRESS_SELECTOR = [
    'ytd-thumbnail-overlay-resume-playback-renderer #progress',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
    'yt-thumbnail-overlay-progress-bar-view-model [style*="width"]',
  ].join(',');
  const BADGE_SELECTOR = [
    'ytd-thumbnail-overlay-time-status-renderer', 'yt-thumbnail-badge-view-model', '.badge-shape-wiz__text',
    '.yt-badge-shape__text', 'ytd-badge-supported-renderer',
  ].join(',');
  const LIVE_TEXT = /^\s*(live|canl[ıiI]|live now|şimdi canlı|jetzt live|en direct)\s*$/i;
  // "1.2K watching" in the meta line is shown only for live streams
  const WATCHING_TEXT = /\b(watching|izliyor|zuschauer|spectateurs|espectadores|osservatori|oglądających)\b|izleyen/i;
  const UPCOMING_TEXT = /^\s*(upcoming|premieres?|yaklaşan|prömiyer|planlandı)/i;
  const MEMBERS_TEXT = /members only|üyelere özel|nur für mitglieder/i;
  const TIME_TEXT = /^\s*(\d+:)?\d{1,2}:\d{2}\s*$/;
  const MIX_TITLE = /^\s*(your mix|mix\b|karışım)/i;
  const SHELF_SELECTOR = 'ytd-rich-section-renderer, ytd-shelf-renderer, ytd-horizontal-card-list-renderer, ytd-rich-shelf-renderer';
  const SHELF_TITLE = /yeni konular|konuları keşfedin|konu keşfet|explore (new )?topics|discover (new )?topics|neue themen|nouveaux sujets|nuevos temas/i;
  const COURSE_PODCAST_SHELF = /podcast|kurs|course/i;
  const COURSE_PODCAST_BADGE = /(^|[\s·•|])(course|courses|kurs|kurslar|podcast|podcasts|podcastler)(?=$|[\s·•|])/i;
  const SURVEY_TEXT = /bu video hoşunuza gitti mi|videoyu beğendiniz mi|did you like this video|are you enjoying this video|how do you like this video/i;
  const SURVEY_SELECTOR = 'ytd-inline-survey-renderer, ytd-rich-section-renderer, ytd-item-section-renderer';
  const META_SELECTOR = '#metadata-line, #byline-container, yt-content-metadata-view-model, [class*="content-metadata"], [class*="metadata-view-model"]';
  const STREAM_ENDED = /streamed|übertragen|diffusé|canl[ıi] yay[ıi]nland[ıi]|yay[ıi]nland[ıi]/i;

  function findTiles() {
    const tiles = new Set();
    document.querySelectorAll(LINK_SELECTOR).forEach((a) => {
      if (a.closest(NEVER_HIDE)) return;
      const tile = a.closest('ytd-rich-item-renderer') || a.closest(INNER_TILE_SELECTOR);
      if (tile) tiles.add(tile);
    });
    return tiles;
  }

  function progressOf(tile) {
    let max = 0;
    for (const el of tile.querySelectorAll(PROGRESS_SELECTOR)) {
      let w = parseFloat(el.style.width);
      if (!(w >= 0)) { const m = /width:\s*([\d.]+)%/.exec(el.getAttribute('style') || ''); w = m ? parseFloat(m[1]) : 0; }
      if (w > max) max = w;
    }
    return max;
  }
  function isLive(tile) {
    if (tile.querySelector('ytd-thumbnail[is-live-video], ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], .badge-style-type-live-now, [class*="badge-shape-wiz--thumbnail-live"], [class*="thumbnail-live"], [class*="ThumbnailLive"], [class*="live-badge"]')) return true;
    for (const el of tile.querySelectorAll(BADGE_SELECTOR)) if (LIVE_TEXT.test(el.textContent)) return true;
    // Modern tiles: no badge, only "N watching" in the meta line
    return metaTexts(tile).some((t) => WATCHING_TEXT.test(t));
  }
  function badgeMatches(tile, re) {
    for (const el of tile.querySelectorAll(BADGE_SELECTOR)) if (re.test(el.textContent)) return true;
    return false;
  }
  function isUpcoming(tile) {
    return !!tile.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]') || badgeMatches(tile, UPCOMING_TEXT);
  }
  const onSubs = () => location.pathname === '/feed/subscriptions';
  const metaTexts = (tile) => [...tile.querySelectorAll(META_SELECTOR + ',' + BADGE_SELECTOR)].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  // Ended live stream: has a duration badge but the meta line says "Streamed … ago"
  function isStreamEnded(tile) {
    if (isLive(tile) || isUpcoming(tile)) return false;
    return metaTexts(tile).some((t) => STREAM_ENDED.test(t));
  }
  // Course / podcast playlists: tiles with a playlist link whose badge/meta line says course/podcast
  function isCoursePodcast(tile) {
    if (!tile.querySelector('a[href*="list="], a[href^="/playlist"]')) return false;
    return metaTexts(tile).some((t) => COURSE_PODCAST_BADGE.test(t));
  }
  function isMembers(tile) {
    return !!tile.querySelector('.badge-style-type-members-only, [class*="members-only"], [class*="membership"]') || badgeMatches(tile, MEMBERS_TEXT);
  }
  // Mix IDs start with "RD" (RDMM, RDGM, RDEM...); RDCLAK (official curated) excluded.
  function isMix(tile) {
    for (const a of tile.querySelectorAll('a[href*="list=RD"]')) if (!/list=RDCLAK/.test(a.getAttribute('href'))) return true;
    const title = titleOf(tile);
    return !!title && MIX_TITLE.test(title);
  }
  function titleOf(tile) {
    const t = tile.querySelector('#video-title, h3, [class*="lockup-metadata-view-model-wiz__title"]');
    return t ? t.textContent.trim() : '';
  }
  function channelOf(tile) {
    return [...tile.querySelectorAll('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], ytd-channel-name a')]
      .map((a) => a.textContent.trim()).filter(Boolean).join(' | ');
  }
  function durationOf(tile) {
    for (const el of tile.querySelectorAll(BADGE_SELECTOR)) {
      const t = el.textContent.trim();
      if (!TIME_TEXT.test(t)) continue;
      return t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
    }
    return 0;
  }

  let kwMatchers = [], chMatchers = [], shelfMatchers = [], excluded = [];
  function compile() {
    shelfMatchers = YTX.matchers(YTX.s.c_shelfTitles);
    kwMatchers = YTX.matchers(YTX.s.c_keywords);
    chMatchers = YTX.matchers(YTX.s.c_channels);
    excluded = YTX.lines(YTX.s.c_excludePaths);
  }

  function shouldHide(tile) {
    const s = YTX.s;
    if (s.c_inProgress) {
      const p = progressOf(tile);
      if (p > 0 && p >= s.c_progressMin && p <= s.c_progressMax) return true;
    }
    if (s.c_live && onSubs() && isLive(tile)) return true;
    if (s.c_liveEnded && onSubs() && isStreamEnded(tile)) return true;
    if (s.c_coursePodcast && isCoursePodcast(tile)) return true;
    if (s.c_upcoming && isUpcoming(tile)) return true;
    if (s.c_mixes && isMix(tile)) return true;
    if (s.c_membersOnly && isMembers(tile)) return true;
    if (s.c_minDuration > 0 || s.c_maxDuration > 0) {
      const d = durationOf(tile);
      if (d > 0 && ((s.c_minDuration > 0 && d < s.c_minDuration) || (s.c_maxDuration > 0 && d > s.c_maxDuration))) return true;
    }
    if (kwMatchers.length) { const t = titleOf(tile); if (t && kwMatchers.some((m) => m(t))) return true; }
    if (chMatchers.length) { const c = channelOf(tile); if (c && chMatchers.some((m) => m(c))) return true; }
    return false;
  }

  function clearAll() { document.querySelectorAll('[' + ATTR + ']').forEach((el) => el.removeAttribute(ATTR)); }

  function scan() {
    if (excluded.some((p) => location.pathname.startsWith(p))) { clearAll(); return; }
    findTiles().forEach((tile) => tile.toggleAttribute(ATTR, shouldHide(tile)));
    const S = YTX.s;
    document.querySelectorAll(SHELF_SELECTOR).forEach((shelf) => {
      const outer = shelf.parentElement && shelf.parentElement.closest(SHELF_SELECTOR);
      if (outer) return; // for nested shelves handle only the outermost
      const t = shelf.querySelector('#title, #title-text, h2, yt-formatted-string.ytd-rich-shelf-renderer');
      const title = t ? t.textContent.trim() : '';
      let hide = false;
      if (title) {
        if (S.c_topicShelves && SHELF_TITLE.test(title)) hide = true;
        else if (S.c_coursePodcast && COURSE_PODCAST_SHELF.test(title)) hide = true;
        else if (S.c_irrelevant && shelfMatchers.some((m) => m(title))) hide = true;
      }
      shelf.toggleAttribute(ATTR, hide);
    });
    // Surveys ("Did you like this video?"): short-text sections, only looked at while the option is on
    if (!S.c_irrelevant) return;
    document.querySelectorAll(SURVEY_SELECTOR).forEach((el) => {
      if (el.matches('ytd-rich-section-renderer') && (el.hasAttribute(ATTR) || el.querySelector(SHELF_SELECTOR.replace('ytd-rich-section-renderer, ', '')))) return;
      const text = shortText(el, 300);
      const hide = text !== null && SURVEY_TEXT.test(text);
      if (hide) el.setAttribute(ATTR, '');
      else if (el.matches('ytd-inline-survey-renderer, ytd-item-section-renderer')) el.removeAttribute(ATTR);
    });
  }

  // Text of an element, or null as soon as it turns out to be long: big sections (comments, results) are not read whole
  function shortText(el, max) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let out = '', n;
    while ((n = w.nextNode())) {
      out += n.nodeValue;
      if (out.length > max * 4) return null;
    }
    out = out.replace(/\s+/g, ' ').trim();
    return out.length < max ? out : null;
  }

  YTX.register({
    id: 'clutter',
    start() { compile(); YTX.onMutate(scan); YTX.onNav(scan); scan(); },
    stop() { YTX.offMutate(scan); YTX.offNav(scan); clearAll(); },
    update() { compile(); clearAll(); scan(); },
  });
})();
