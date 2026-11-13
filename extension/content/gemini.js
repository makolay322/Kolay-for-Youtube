/* Runs on gemini.google.com: picks up the prompt prepared by the YouTube tab (content/summarize.js),
 * attaches the transcript as a .txt file, types the prompt into the chat box and, if enabled, sends it.
 * Whatever goes wrong is shown in a banner that stays until it is closed, with "copy" buttons as a way out. */
(function () {
  'use strict';
  if (window.top !== window) return;
  const KEY_PREFIX = 'ytxGemini:';
  const IDX_KEY = 'ytxGeminiIdx';
  const LAST_KEY = 'ytxGeminiLast';
  const HEALTH_KEY = 'ytxGeminiHealth';
  const FRESH_MS = 3 * 60 * 1000;
  const BOX_LIMIT = 31000; // the chat box holds 32,000 characters and silently drops the rest

  // Everything that depends on Gemini's markup lives here, so a change on their side is a one-line fix
  const SELECTORS = {
    editor: [
      'rich-textarea .ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'rich-textarea [contenteditable="true"]',
    ],
    send: [
      'button.send-button',
      '.send-button-container button',
      'button:has(mat-icon[fonticon="send"])',
      'button:has([data-mat-icon-name="send"])',
      // labels of the send button in the languages we know of
      'button[aria-label*="Send" i]', 'button[aria-label*="Gönder" i]', 'button[aria-label*="senden" i]', 'button[aria-label*="Enviar" i]',
      'button[aria-label*="Envoyer" i]', 'button[aria-label*="Отправ" i]', 'button[aria-label*="送信"]', 'button[aria-label*="Invia" i]',
      'button[aria-label*="Verzend" i]', 'button[aria-label*="Wyślij" i]', 'button[aria-label*="发送"]', 'button[aria-label*="보내기"]',
      'button[aria-label*="إرسال"]',
    ],
    inputArea: 'input-area-v2, .input-area-container, [class*="input-area"], rich-textarea',
    preview: 'uploader-file-preview, [data-test-id="file-preview"]',
    dialog: 'upload-image-disclaimer-dialog, mat-dialog-container',
    fileInput: 'input[type="file"]',
  };

  const STR = {
    en: { busy: 'Kolay: fetching the transcript…', copy: 'Copy prompt', copyTr: 'Copy transcript', copied: 'Copied. Paste it into the chat box.', close: 'Close',
      manual: 'Could not fill the chat box. Copy the prompt and paste it.',
      noAttach: 'The transcript could not be attached.', partial: 'The transcript is long, so only the first {n}% was typed in. Copy the full transcript if you need it. Not sent automatically.',
      dialog: 'Gemini is asking for permission to use files. Accept it and the transcript will be attached.',
      noSend: 'The prompt is typed in, but the send button was not found. Press send yourself.' },
    tr: { busy: 'Kolay: transkript alınıyor…', copy: 'İstemi kopyala', copyTr: 'Transkripti kopyala', copied: 'Kopyalandı. Sohbet kutusuna yapıştır.', close: 'Kapat',
      manual: 'Sohbet kutusu doldurulamadı. İstemi kopyalayıp yapıştır.',
      noAttach: 'Transkript eklenemedi.', partial: 'Transkript uzun olduğu için yalnızca ilk %{n} kadarı yazıldı. Tamamı gerekirse transkripti kopyala. Otomatik gönderilmedi.',
      dialog: 'Gemini dosya kullanma izni istiyor. Kabul edersen transkript eklenecek.',
      noSend: 'İstem yazıldı ama gönder düğmesi bulunamadı. Gönder tuşuna kendin bas.' },
    de: { busy: 'Kolay: Transkript wird geladen…', copy: 'Prompt kopieren', copyTr: 'Transkript kopieren', copied: 'Kopiert. Im Chatfeld einfügen.', close: 'Schließen',
      manual: 'Das Chatfeld konnte nicht gefüllt werden. Prompt kopieren und einfügen.',
      noAttach: 'Das Transkript konnte nicht angehängt werden.', partial: 'Das Transkript ist lang, daher wurden nur die ersten {n} % eingefügt. Kopiere bei Bedarf das ganze Transkript. Nicht automatisch gesendet.',
      dialog: 'Gemini bittet um Erlaubnis, Dateien zu verwenden. Nimm sie an, dann wird das Transkript angehängt.',
      noSend: 'Der Prompt ist eingetragen, aber der Senden-Button wurde nicht gefunden. Sende ihn selbst ab.' },
    es: { busy: 'Kolay: obteniendo la transcripción…', copy: 'Copiar prompt', copyTr: 'Copiar transcripción', copied: 'Copiado. Pégalo en el chat.', close: 'Cerrar',
      manual: 'No se pudo rellenar el chat. Copia el prompt y pégalo.',
      noAttach: 'No se pudo adjuntar la transcripción.', partial: 'La transcripción es larga, así que solo se escribió el primer {n} %. Copia la transcripción completa si la necesitas. No se envió automáticamente.',
      dialog: 'Gemini pide permiso para usar archivos. Acéptalo y se adjuntará la transcripción.',
      noSend: 'El prompt está escrito, pero no se encontró el botón de enviar. Envíalo tú.' },
    pt: { busy: 'Kolay: obtendo a transcrição…', copy: 'Copiar prompt', copyTr: 'Copiar transcrição', copied: 'Copiado. Cole no chat.', close: 'Fechar',
      manual: 'Não foi possível preencher o chat. Copie o prompt e cole.',
      noAttach: 'Não foi possível anexar a transcrição.', partial: 'A transcrição é longa, então só os primeiros {n}% foram digitados. Copie a transcrição completa se precisar. Não foi enviado automaticamente.',
      dialog: 'O Gemini está pedindo permissão para usar arquivos. Aceite e a transcrição será anexada.',
      noSend: 'O prompt foi digitado, mas o botão de enviar não foi encontrado. Envie você mesmo.' },
    fr: { busy: 'Kolay : récupération de la transcription…', copy: 'Copier le prompt', copyTr: 'Copier la transcription', copied: 'Copié. Collez-le dans le chat.', close: 'Fermer',
      manual: 'Impossible de remplir le chat. Copiez le prompt et collez-le.',
      noAttach: "La transcription n'a pas pu être jointe.", partial: 'La transcription est longue : seuls les {n} % premiers ont été saisis. Copiez la transcription complète si besoin. Non envoyé automatiquement.',
      dialog: "Gemini demande l'autorisation d'utiliser des fichiers. Acceptez et la transcription sera jointe.",
      noSend: "Le prompt est saisi, mais le bouton d'envoi est introuvable. Envoyez-le vous-même." },
    ru: { busy: 'Kolay: получение транскрипта…', copy: 'Скопировать запрос', copyTr: 'Скопировать транскрипт', copied: 'Скопировано. Вставьте в чат.', close: 'Закрыть',
      manual: 'Не удалось заполнить чат. Скопируйте запрос и вставьте.',
      noAttach: 'Не удалось прикрепить транскрипт.', partial: 'Транскрипт длинный, поэтому введены только первые {n}%. При необходимости скопируйте весь транскрипт. Автоматически не отправлено.',
      dialog: 'Gemini просит разрешение на использование файлов. Примите его, и транскрипт будет прикреплён.',
      noSend: 'Запрос введён, но кнопка отправки не найдена. Отправьте сами.' },
    ja: { busy: 'Kolay: 文字起こしを取得中…', copy: 'プロンプトをコピー', copyTr: '文字起こしをコピー', copied: 'コピーしました。チャット欄に貼り付けてください。', close: '閉じる',
      manual: 'チャット欄に入力できませんでした。コピーして貼り付けてください。',
      noAttach: '文字起こしを添付できませんでした。', partial: '文字起こしが長いため、最初の {n}% のみ入力しました。全文が必要ならコピーしてください。自動送信はしていません。',
      dialog: 'Gemini がファイル利用の許可を求めています。承認すると文字起こしが添付されます。',
      noSend: 'プロンプトは入力しましたが、送信ボタンが見つかりません。手動で送信してください。' },
  };
  let S = STR.en;
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }
  const first = (list, root) => { for (const s of list) { try { const el = (root || document).querySelector(s); if (el) return el; } catch (e) { /* selector not supported */ } } return null; };

  // ---------- Diagnostics ----------
  const health = { ts: Date.now(), editor: null, attach: null, fill: null, send: null };
  const saveHealth = () => { try { chrome.storage.local.set({ [HEALTH_KEY]: Object.assign({}, health, { ts: Date.now() }) }); } catch (e) { /* ignore */ } };
  function fail(stage, message) {
    console.warn('[YTX][gemini]', stage, message || '');
    try {
      chrome.storage.local.set({ [LAST_KEY]: { side: 'gemini', stage, code: stage, message: message || stage, ts: Date.now(), ver: chrome.runtime.getManifest().version, trail: [] } });
    } catch (e) { /* ignore */ }
    saveHealth();
  }

  // ---------- Banner (stays until closed, except while loading) ----------
  let bar = null;
  function banner(text, actions) {
    if (!bar) {
      bar = document.createElement('div');
      Object.assign(bar.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 2147483647,
        background: '#202124', color: '#e8eaed', font: '14px/1.4 system-ui, sans-serif', padding: '10px 14px',
        borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.4)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '90vw',
      });
      document.documentElement.appendChild(bar);
    }
    bar.textContent = '';
    const span = document.createElement('span');
    span.textContent = text;
    bar.appendChild(span);
    const btnStyle = { border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', font: 'inherit' };
    for (const a of actions || []) {
      const b = document.createElement('button');
      b.textContent = a.label;
      Object.assign(b.style, btnStyle, { background: '#8ab4f8', color: '#202124' });
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(a.text); span.textContent = S.copied; }
        catch (e) { span.textContent = S.manual; }
      });
      bar.appendChild(b);
    }
    if (actions) {
      const x = document.createElement('button');
      x.textContent = S.close;
      Object.assign(x.style, btnStyle, { background: 'transparent', color: '#9aa0a6' });
      x.addEventListener('click', hideBanner);
      bar.appendChild(x);
    }
  }
  function hideBanner() { if (bar) { bar.remove(); bar = null; } }

  // ---------- Chat box ----------
  const editor = () => first(SELECTORS.editor);

  // execCommand('insertText') takes tens of seconds for long text; building paragraphs directly is instant
  // and the editor (Quill) picks the change up from the DOM.
  function fill(el, text) {
    el.focus();
    const frag = document.createDocumentFragment();
    for (const line of text.split('\n')) {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.appendChild(document.createElement('br'));
      frag.appendChild(p);
    }
    el.replaceChildren(frag);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    return !!el.textContent.trim();
  }
  // Gemini's page may finish loading after the first fill and swap the editor: check again and refill if needed
  async function fillVerified(text) {
    for (let i = 0; i < 4; i++) {
      const el = editor();
      if (el) {
        fill(el, text);
        await sleep(1000);
        const cur = editor();
        if (cur && cur.textContent.trim().length >= Math.min(20, text.length)) return cur;
      } else await sleep(500);
    }
    return null;
  }

  const usable = (b) => b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b.offsetParent;
  function sendButton() {
    for (const s of SELECTORS.send) {
      let list;
      try { list = document.querySelectorAll(s); } catch (e) { continue; }
      for (const b of list) if (usable(b)) return b;
    }
    // Fallback: the last enabled button in the input area (it turns into "send" once there is text)
    const ed = editor();
    const area = ed && ed.closest(SELECTORS.inputArea);
    if (area && area.parentElement) {
      const all = [...area.parentElement.querySelectorAll('button')].filter(usable);
      return all[all.length - 1] || null;
    }
    return null;
  }

  // ---------- Attaching the transcript ----------
  const previews = () => document.querySelectorAll(SELECTORS.preview).length;

  async function pasteFile(el, file, before) {
    el.focus();
    const dt = new DataTransfer();
    dt.items.add(file);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return !!(await waitFor(() => previews() > before, 6000));
  }
  async function inputFile(file, before) {
    const input = first([SELECTORS.fileInput]);
    if (!input) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    try { input.files = dt.files; } catch (e) { return false; }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return !!(await waitFor(() => previews() > before, 6000));
  }
  // 1) synthetic paste  2) if Gemini shows its file-permission dialog, wait for the user, then paste again  3) the hidden file input
  async function attachFile(el, name, text) {
    const before = previews();
    const file = new File([text], name, { type: 'text/plain' });
    if (await pasteFile(el, file, before)) return true;
    if (first([SELECTORS.dialog])) {
      banner(S.dialog);
      await waitFor(() => !first([SELECTORS.dialog]), 120000);
      if (await waitFor(() => previews() > before, 4000)) return true;
      if (await pasteFile(el, file, before)) return true;
    }
    return inputFile(file, before);
  }

  // ---------- Delivery ----------
  let handled = false;
  async function deliver(p, removeKey) {
    if (handled) return;
    handled = true;
    try { chrome.storage.local.remove(removeKey); } catch (e) { /* ignore */ }
    const copyActions = [{ label: S.copy, text: p.prompt }];
    if (p.transcript) copyActions.push({ label: S.copyTr, text: p.transcript });

    const el = await waitFor(editor, 25000);
    health.editor = !!el;
    if (!el) { fail('gemini_editor_missing'); banner(S.manual, copyActions); return; }

    let text = p.prompt, degraded = false, note = '';
    if (p.transcript) {
      let ok = false;
      try { ok = await attachFile(el, p.fileName || 'transcript.txt', p.transcript); } catch (e) { console.warn('[YTX][gemini] attach', e); }
      health.attach = ok;
      if (ok) await sleep(1200);
      else {
        fail('attach_failed');
        // No attachment: the transcript goes into the message, as much as the box can hold
        const lead = p.prompt.replace(/^The attached text file/, 'The text below the line "--- TRANSCRIPT ---"');
        const room = BOX_LIMIT - lead.length - 24;
        text = lead + '\n\n--- TRANSCRIPT ---\n' + p.transcript.slice(0, Math.max(0, room));
        if (p.transcript.length > room) {
          degraded = true;
          note = S.noAttach + ' ' + fmt(S.partial, { n: Math.max(1, Math.floor(room / p.transcript.length * 100)) });
        }
      }
    }
    const box = await fillVerified(text);
    health.fill = !!box;
    if (!box) { fail('fill_failed'); banner(S.manual, copyActions); return; }
    if (degraded) { banner(note, copyActions); saveHealth(); return; }
    hideBanner();
    if (!p.autoSend) { saveHealth(); return; }

    await sleep(800); // let an upload in progress disable the send button
    const btn = await waitFor(sendButton, 30000);
    health.send = !!btn;
    if (btn) btn.click();
    else {
      const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      box.dispatchEvent(new KeyboardEvent('keydown', o));
      await sleep(2000);
      const still = editor();
      if (still && still.textContent.trim()) { fail('send_not_found'); banner(S.noSend, [{ label: S.copy, text: p.prompt }]); }
    }
    saveHealth();
  }

  function handle(p, key) {
    if (!p || handled || !p.ts || Date.now() - p.ts > FRESH_MS) return;
    S = STR[p.lang] || STR.en;
    if (p.state === 'loading') banner(S.busy);
    else if (p.state === 'error') { banner(p.message || S.manual, []); try { chrome.storage.local.remove(key); } catch (e) { /* ignore */ } }
    else if (p.state === 'ready' && p.prompt) deliver(p, key);
  }

  // ---------- Which record is ours? ----------
  // The YouTube tab opens gemini.google.com/app#ytx=<token>. If Gemini drops the hash, the token is kept in
  // sessionStorage; as a last resort a very fresh record is taken when the tab was opened from YouTube.
  const fromHash = () => (/[#&]ytx=(\w+)/.exec(location.hash) || [])[1];
  async function findToken() {
    let tok = fromHash();
    try { if (tok) sessionStorage.setItem('ytxTok', tok); else tok = sessionStorage.getItem('ytxTok'); } catch (e) { /* storage blocked */ }
    if (tok) return tok;
    if (!/^https:\/\/www\.youtube\.com/.test(document.referrer)) return null;
    const idx = (await chrome.storage.local.get(IDX_KEY))[IDX_KEY] || {};
    const newest = Object.keys(idx).sort((a, b) => idx[b] - idx[a])[0];
    return newest && Date.now() - idx[newest] < 2 * 60 * 1000 ? newest : null;
  }

  (async function boot() {
    try {
      const tok = await findToken();
      if (!tok) return;
      const key = KEY_PREFIX + tok;
      handle((await chrome.storage.local.get(key))[key], key);
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && ch[key] && ch[key].newValue) handle(ch[key].newValue, key);
      });
    } catch (e) { /* extension was reloaded */ }
  })();
})();
