/* Runs on gemini.google.com: picks up the prompt prepared by the YouTube tab (content/summarize.js),
 * types it into the chat box and, if enabled, sends it. Falls back to a "Copy prompt" button. */
(function () {
  'use strict';
  if (window.top !== window) return;
  const KEY = 'ytxGemini';
  const FRESH_MS = 3 * 60 * 1000;

  const STR = {
    en: { busy: 'Kolay: fetching the transcript…', copy: 'Copy prompt', manual: 'Could not fill the chat box. Copy the prompt and paste it.', copied: 'Copied. Paste it into the chat box.' },
    tr: { busy: 'Kolay: transkript alınıyor…', copy: 'İstemi kopyala', manual: 'Sohbet kutusu doldurulamadı. İstemi kopyalayıp yapıştır.', copied: 'Kopyalandı. Sohbet kutusuna yapıştır.' },
    de: { busy: 'Kolay: Transkript wird geladen…', copy: 'Prompt kopieren', manual: 'Das Chatfeld konnte nicht gefüllt werden. Prompt kopieren und einfügen.', copied: 'Kopiert. Im Chatfeld einfügen.' },
    es: { busy: 'Kolay: obteniendo la transcripción…', copy: 'Copiar prompt', manual: 'No se pudo rellenar el chat. Copia el prompt y pégalo.', copied: 'Copiado. Pégalo en el chat.' },
    pt: { busy: 'Kolay: obtendo a transcrição…', copy: 'Copiar prompt', manual: 'Não foi possível preencher o chat. Copie o prompt e cole.', copied: 'Copiado. Cole no chat.' },
    fr: { busy: 'Kolay : récupération de la transcription…', copy: 'Copier le prompt', manual: 'Impossible de remplir le chat. Copiez le prompt et collez-le.', copied: 'Copié. Collez-le dans le chat.' },
    ru: { busy: 'Kolay: получение транскрипта…', copy: 'Скопировать запрос', manual: 'Не удалось заполнить чат. Скопируйте запрос и вставьте.', copied: 'Скопировано. Вставьте в чат.' },
    ja: { busy: 'Kolay: 文字起こしを取得中…', copy: 'プロンプトをコピー', manual: 'チャット欄に入力できませんでした。コピーして貼り付けてください。', copied: 'コピーしました。チャット欄に貼り付けてください。' },
  };
  let S = STR.en;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }

  // ---------- Small banner ----------
  let bar = null;
  function banner(text, withCopy) {
    if (!bar) {
      bar = document.createElement('div');
      Object.assign(bar.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 2147483647,
        background: '#202124', color: '#e8eaed', font: '14px/1.4 system-ui, sans-serif', padding: '10px 14px',
        borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.4)', display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '90vw',
      });
      document.documentElement.appendChild(bar);
    }
    bar.textContent = '';
    const span = document.createElement('span');
    span.textContent = text;
    bar.appendChild(span);
    if (withCopy) {
      const b = document.createElement('button');
      b.textContent = S.copy;
      Object.assign(b.style, { background: '#8ab4f8', color: '#202124', border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', font: 'inherit' });
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(withCopy); span.textContent = S.copied; }
        catch (e) { span.textContent = S.manual; }
      });
      bar.appendChild(b);
    }
  }
  function hideBanner() { if (bar) { bar.remove(); bar = null; } }

  // ---------- Chat box ----------
  const editor = () =>
    document.querySelector('rich-textarea .ql-editor[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('rich-textarea [contenteditable="true"]');

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

  const sendButton = () => {
    const cands = document.querySelectorAll('button.send-button, .send-button-container button, button[aria-label*="Send" i], button[aria-label*="Gönder" i], button[aria-label*="senden" i], button[aria-label*="Enviar" i], button[aria-label*="Envoyer" i], button[aria-label*="Отправ" i], button[aria-label*="送信"]');
    for (const b of cands) if (!b.disabled && b.getAttribute('aria-disabled') !== 'true' && b.offsetParent) return b;
    return null;
  };

  let handled = false;
  async function deliver(p) {
    if (handled) return;
    handled = true;
    try { chrome.storage.local.remove(KEY); } catch (e) { /* ignore */ }
    const el = await waitFor(editor, 25000);
    if (!el || !fill(el, p.prompt)) { banner(S.manual, p.prompt); return; }
    hideBanner();
    if (!p.autoSend) return;
    const btn = await waitFor(sendButton, 8000);
    if (btn) btn.click();
    else {
      const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', o));
    }
  }

  function handle(p) {
    if (!p || handled || !p.ts || Date.now() - p.ts > FRESH_MS) return;
    S = STR[p.lang] || STR.en;
    if (p.state === 'loading') banner(S.busy);
    else if (p.state === 'error') { banner(p.message || ''); try { chrome.storage.local.remove(KEY); } catch (e) { /* ignore */ } setTimeout(hideBanner, 6000); }
    else if (p.state === 'ready' && p.prompt) deliver(p);
  }

  try {
    chrome.storage.local.get(KEY).then((r) => handle(r[KEY]));
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[KEY] && ch[KEY].newValue) handle(ch[KEY].newValue);
    });
  } catch (e) { /* extension was reloaded */ }
})();
