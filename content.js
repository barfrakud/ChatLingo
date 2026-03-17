// content.js — WhatsApp Web & Messenger
// Alt+T → tłumacz pole czatu według wybranych języków
// Hover → tłumacz tekst pod kursorem (dymek)
// Alt+R → tłumacz zaznaczony tekst (fallback)
// Alt+K → popraw tekst w języku docelowym + panel błędów

(function () {
  'use strict';

  // ── Find input box ───────────────────────────────────────────────────────────

  function getActiveInputBox() {
    const selectors = [
      'footer div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][data-tab="6"]',
      'div[contenteditable="true"][spellcheck="true"]',
      'div[contenteditable="true"][aria-placeholder]',
      'div[contenteditable="true"][role="textbox"]',
      'div[aria-label][contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return { el };
    }
    return null;
  }

  function getInputText(inputObj) {
    return inputObj?.el.innerText.trim() || '';
  }

  function setInputText(inputObj, text) {
    if (!inputObj) return;
    const el = inputObj.el;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (!ok && el.innerText.trim() === '') {
      el.innerText = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    }
    // cursor to end
    const r2 = document.createRange();
    r2.selectNodeContents(el);
    r2.collapse(false);
    const s2 = window.getSelection();
    s2.removeAllRanges();
    s2.addRange(r2);
  }

  // ── Keyboard shortcuts (capture phase) ──────────────────────────────────────

  document.addEventListener('keydown', async (e) => {
    if (!e.altKey) return;
    const key = e.key.toLowerCase();

    if (key === 't') {
      e.preventDefault(); e.stopImmediatePropagation();
      await handleTranslateInput();
    } else if (key === 'r') {
      e.preventDefault(); e.stopImmediatePropagation();
      await handleTranslateSelection();
    } else if (key === 'k') {
      e.preventDefault(); e.stopImmediatePropagation();
      await handleProofread();
    }
  }, true);

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRANSLATE_INPUT_FIELD') handleTranslateInput();
  });

  // ── Hover translation ───────────────────────────────────────────────────────

  const HOVER_TRANSLATE_DELAY_MS = 550;
  const HOVER_MAX_TEXT_LENGTH = 280;
  const hoverCache = new Map();
  let hoverTimer = null;
  let hoverRequestSeq = 0;
  let hoverCandidateKey = '';
  let hoverActiveKey = '';

  document.addEventListener('mousemove', handleHoverMove, true);
  document.addEventListener('mouseleave', resetHoverTranslation, true);
  document.addEventListener('scroll', resetHoverTranslation, true);

  function handleHoverMove(e) {
    const candidate = getHoverCandidate(e);

    if (!candidate) {
      clearHoverIntent();
      if (bubbleMode === 'hover') hideBubble();
      hoverActiveKey = '';
      return;
    }

    if (candidate.cacheKey === hoverCandidateKey || candidate.cacheKey === hoverActiveKey) {
      return;
    }

    clearHoverIntent();
    hoverCandidateKey = candidate.cacheKey;
    const requestSeq = ++hoverRequestSeq;
    hoverTimer = setTimeout(() => {
      translateHoverCandidate(candidate, requestSeq);
    }, HOVER_TRANSLATE_DELAY_MS);
  }

  async function translateHoverCandidate(candidate, requestSeq) {
    const langCfg = await getStoredLangConfig();
    const cacheKey = `${langCfg.sourceLang}|${langCfg.targetLang}|${candidate.text}`;
    hoverCandidateKey = cacheKey;

    if (hoverCache.has(cacheKey)) {
      const cached = hoverCache.get(cacheKey);
      hoverActiveKey = cacheKey;
      showBubble(`🌐 ${cached.langPairLabel}`, cached.translated, candidate.x, candidate.y, false, 'hover');
      return;
    }

    showBubble(`🌐 ${formatLangPairLabel(langCfg.targetLang, langCfg.sourceLang)}`, 'Tłumaczę…', candidate.x, candidate.y, true, 'hover');
    const result = await browser.runtime.sendMessage({ type: 'TRANSLATE', text: candidate.text, reverse: true });

    if (requestSeq !== hoverRequestSeq) return;

    if (result.error) {
      hoverActiveKey = '';
      hideBubble();
      toast(result.error, 'error');
      return;
    }

    const payload = {
      translated: result.translated,
      langPairLabel: result.langPairLabel || formatLangPairLabel(langCfg.targetLang, langCfg.sourceLang)
    };

    rememberHoverTranslation(cacheKey, payload);
    hoverActiveKey = cacheKey;
    showBubble(`🌐 ${payload.langPairLabel}`, payload.translated, candidate.x, candidate.y, false, 'hover');
  }

  function getHoverCandidate(e) {
    if (window.getSelection()?.toString().trim()) return null;

    const target = e.target;
    if (!(target instanceof Element)) return null;
    if (isIgnoredHoverElement(target)) return null;

    const text = getHoverTextAtPoint(e.clientX, e.clientY, target);
    if (!text || text.length < 2 || text.length > HOVER_MAX_TEXT_LENGTH) return null;

    const langCfg = getCachedLangConfig();
    return {
      text,
      x: e.clientX,
      y: e.clientY,
      cacheKey: `${langCfg.sourceLang}|${langCfg.targetLang}|${text}`
    };
  }

  function isIgnoredHoverElement(el) {
    return !!el.closest('#plt-bubble, #plt-proof-panel, #plt-spinner, #plt-toast, [contenteditable="true"], input, textarea, button, a, nav, header, [role="button"]');
  }

  function getHoverTextAtPoint(x, y, fallbackTarget) {
    const texts = [];
    const pointNode = getNodeAtPoint(x, y);

    if (pointNode?.nodeType === Node.TEXT_NODE) {
      const directText = normalizeHoverText(pointNode.textContent);
      if (isTimestampLike(directText)) return '';
      if (isViableHoverText(directText)) texts.push(directText);
    }

    let el = pointNode?.nodeType === Node.ELEMENT_NODE
      ? pointNode
      : pointNode?.parentElement || fallbackTarget;

    const pointedElementText = normalizeHoverText(el?.textContent || '');
    if (isTimestampLike(pointedElementText)) return '';

    while (el && el !== document.body) {
      if (isIgnoredHoverElement(el)) return pickBestHoverText(texts);
      const text = normalizeHoverText(el.innerText || el.textContent);
      if (isViableHoverText(text)) {
        texts.push(text);
        break;
      }
      el = el.parentElement;
    }

    return pickBestHoverText(texts);
  }

  function getNodeAtPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      return pos?.offsetNode || null;
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      return range?.startContainer || null;
    }
    return null;
  }

  function normalizeHoverText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isViableHoverText(text) {
    if (!text || text.length < 2 || text.length > HOVER_MAX_TEXT_LENGTH) return false;
    if (isTimestampLike(text)) return false;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/.test(text)) return false;
    return true;
  }

  function isTimestampLike(text) {
    const value = String(text || '').trim();
    return /^(\[?\d{1,2}[:.]\d{2}\]?)(\s?(am|pm))?$/i.test(value) ||
      /^\d{1,2}[:.]\d{2}\s?[-–]\s?\d{1,2}[:.]\d{2}$/i.test(value) ||
      /^\d{1,2}\s?(min|mins|m|godz|h|hr|hrs)$/i.test(value);
  }

  function pickBestHoverText(texts) {
    return texts
      .filter(Boolean)
      .sort((a, b) => scoreHoverText(b) - scoreHoverText(a))[0] || '';
  }

  function scoreHoverText(text) {
    const letters = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/g) || []).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const punctuation = /[?!.,]/.test(text) ? 4 : 0;
    const longEnough = text.length >= 12 ? 3 : 0;
    return letters + words * 2 + punctuation + longEnough;
  }

  function clearHoverIntent() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverCandidateKey = '';
    hoverRequestSeq += 1;
  }

  function resetHoverTranslation() {
    clearHoverIntent();
    hoverActiveKey = '';
    if (bubbleMode === 'hover') hideBubble();
  }

  function rememberHoverTranslation(key, value) {
    hoverCache.set(key, value);
    if (hoverCache.size <= 100) return;
    const firstKey = hoverCache.keys().next().value;
    if (firstKey) hoverCache.delete(firstKey);
  }

  // ── Alt+T: translate input using configured languages ──────────────────────

  async function handleTranslateInput() {
    const inputObj = getActiveInputBox();
    if (!inputObj) {
      toast('Kliknij najpierw w pole czatu', 'warn'); return;
    }
    const text = getInputText(inputObj);
    if (!text) { toast('Pole czatu jest puste', 'warn'); return; }

    showSpinner(inputObj.el, '⏳ Tłumaczę…');
    const result = await browser.runtime.sendMessage({ type: 'TRANSLATE', text });
    hideSpinner();

    if (result.error) { toast(result.error, 'error'); return; }
    setInputText(inputObj, result.translated);
    toast('✓ Przetłumaczono', 'success');
  }

  // ── Alt+R: translate selection using configured languages ──────────────────

  async function handleTranslateSelection() {
    const sel  = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) {
      toast('Zaznacz tekst i naciśnij Alt+R', 'warn'); return;
    }

    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    try { const r = sel.getRangeAt(0).getBoundingClientRect(); x = r.left; y = r.top; } catch (_) {}

    const initialLabel = await getStoredLangPairLabel(true);
    showBubble(`🌐 ${initialLabel}`, 'Tłumaczę…', x, y, true, 'manual');
    const result = await browser.runtime.sendMessage({ type: 'TRANSLATE', text, reverse: true });

    if (result.error) { hideBubble(); toast(result.error, 'error'); return; }
    showBubble(`🌐 ${result.langPairLabel || initialLabel}`, result.translated, x, y, false, 'manual');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, 8000);
  }

  // ── Alt+K: proofread text in the configured target language ────────────────

  async function handleProofread() {
    const inputObj = getActiveInputBox();
    if (!inputObj) { toast('Kliknij najpierw w pole czatu', 'warn'); return; }
    const text = getInputText(inputObj);
    if (!text) { toast('Pole czatu jest puste', 'warn'); return; }

    showSpinner(inputObj.el, '🔍 Sprawdzam tekst…');
    const result = await browser.runtime.sendMessage({ type: 'PROOFREAD', text });
    hideSpinner();

    if (result.error) { toast(result.error, 'error'); return; }

    // Parse JSON response
    let parsed;
    try {
      const clean = result.translated.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (_) {
      toast('Błąd parsowania odpowiedzi API', 'error'); return;
    }

    // Replace input text with corrected version
    setInputText(inputObj, parsed.corrected);

    // Show corrections panel
    showProofreadPanel(parsed, inputObj.el);
  }

  // ── Translation bubble (tooltip) ────────────────────────────────────────────

  let bubbleEl = null, bubbleTimer = null, bubbleMode = 'manual';

  function createBubble() {
    if (bubbleEl) return bubbleEl;
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'plt-bubble';
    Object.assign(bubbleEl.style, {
      position: 'fixed', zIndex: '2147483647',
      maxWidth: '340px', minWidth: '140px',
      padding: '10px 14px',
      background: '#1a1a2e', color: '#e0e0f0',
      border: '1px solid #7c5cbf', borderRadius: '10px',
      fontSize: '13px', lineHeight: '1.5',
      boxShadow: '0 8px 32px rgba(0,0,0,.55)',
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      pointerEvents: 'none', opacity: '0',
      transition: 'opacity .15s', display: 'none',
    });
    document.body.appendChild(bubbleEl);
    return bubbleEl;
  }

  function showBubble(label, text, x, y, loading, mode = 'manual') {
    const el = createBubble();
    bubbleMode = mode;
    el.innerHTML =
      `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#7c5cbf;margin-bottom:5px">${esc(label)}</div>` +
      `<div style="color:${loading?'#666':'#e0e0f0'}">${esc(text)}</div>`;
    el.style.display = 'block'; el.style.opacity = '0';
    let left = x + 14, top = y - 85;
    if (left + 360 > window.innerWidth) left = x - 360;
    if (top < 8) top = y + 20;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top  = Math.max(8, top)  + 'px';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  }

  function hideBubble() {
    if (!bubbleEl) return;
    bubbleMode = 'manual';
    bubbleEl.style.opacity = '0';
    setTimeout(() => { if (bubbleEl) bubbleEl.style.display = 'none'; }, 160);
  }

  // Close bubble on outside click
  document.addEventListener('mousedown', () => {
    clearTimeout(bubbleTimer);
    resetHoverTranslation();
    hideBubble();
  }, true);

  // ── Proofreading panel ───────────────────────────────────────────────────────

  let proofPanel = null;

  function showProofreadPanel(data, anchorEl) {
    removeProofreadPanel();

    const panel = document.createElement('div');
    panel.id = 'plt-proof-panel';

    const rect = anchorEl.getBoundingClientRect();

    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: '2147483646',
      width: '340px',
      background: '#12121e',
      border: '1px solid #7c5cbf',
      borderRadius: '10px',
      boxShadow: '0 12px 40px rgba(0,0,0,.65)',
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      fontSize: '13px', color: '#e0e0f0',
      overflow: 'hidden',
    });

    // Position above the input box
    let top = rect.top - 20;
    let left = rect.left;
    if (left + 350 > window.innerWidth) left = window.innerWidth - 355;
    if (top < 60) top = rect.bottom + 10;
    panel.style.left = Math.max(8, left) + 'px';
    panel.style.top  = (top - 10) + 'px'; // will be adjusted after content renders

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderBottom: '1px solid #252540',
      background: '#181828',
    });
    header.innerHTML =
      `<span style="font-size:12px;font-weight:700;color:#c0a8ff">🔍 Korekta tekstu</span>` +
      `<span id="plt-proof-close" style="cursor:pointer;color:#666;font-size:16px;line-height:1;padding:0 4px">×</span>`;
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.style.padding = '12px 14px';
    body.style.maxHeight = '260px';
    body.style.overflowY = 'auto';

    if (!data.hasErrors || !data.corrections?.length) {
      body.innerHTML = `<div style="color:#4caf80;font-size:13px">✓ Tekst jest poprawny. Nie znaleziono błędów.</div>`;
    } else {
      body.innerHTML = `<div style="color:#cfb84a;font-size:11px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${data.corrections.length} poprawka${data.corrections.length > 1 ? 'i' : ''}</div>`;

      data.corrections.forEach((c, i) => {
        const item = document.createElement('div');
        Object.assign(item.style, {
          marginBottom: '10px', paddingBottom: '10px',
          borderBottom: i < data.corrections.length - 1 ? '1px solid #1e1e32' : 'none',
        });
        item.innerHTML =
          `<div style="display:flex;gap:6px;align-items:baseline;margin-bottom:4px">` +
            `<span style="background:#3a1a1a;color:#cf6679;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;text-decoration:line-through">${esc(c.original)}</span>` +
            `<span style="color:#666;font-size:11px">→</span>` +
            `<span style="background:#1a3a2a;color:#4caf80;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace">${esc(c.fixed)}</span>` +
          `</div>` +
          `<div style="font-size:11px;color:#888;line-height:1.4">${esc(c.reason)}</div>`;
        body.appendChild(item);
      });
    }
    panel.appendChild(body);

    // Footer hint
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      padding: '8px 14px', borderTop: '1px solid #1a1a2a',
      fontSize: '10px', color: '#444', textAlign: 'center',
    });
    footer.textContent = 'Poprawiony tekst jest już w polu czatu. Kliknij × aby zamknąć.';
    panel.appendChild(footer);

    document.body.appendChild(panel);
    proofPanel = panel;

    // Adjust vertical position now that we know the panel height
    requestAnimationFrame(() => {
      const h = panel.offsetHeight;
      let newTop = rect.top - h - 10;
      if (newTop < 8) newTop = rect.bottom + 10;
      panel.style.top = newTop + 'px';
    });

    // Close button
    panel.querySelector('#plt-proof-close').addEventListener('click', removeProofreadPanel);
  }

  function removeProofreadPanel() {
    if (proofPanel) { proofPanel.remove(); proofPanel = null; }
  }

  // ── Spinner ──────────────────────────────────────────────────────────────────

  let spinnerEl = null;

  function showSpinner(anchorEl, msg) {
    if (!spinnerEl) {
      spinnerEl = document.createElement('div');
      spinnerEl.id = 'plt-spinner';
      Object.assign(spinnerEl.style, {
        position: 'fixed', zIndex: '2147483645',
        background: '#1a1a2e', border: '1px solid #7c5cbf',
        borderRadius: '6px', padding: '5px 12px',
        fontSize: '12px', color: '#c0a8ff',
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      });
      document.body.appendChild(spinnerEl);
    }
    const r = anchorEl.getBoundingClientRect();
    spinnerEl.textContent = msg;
    spinnerEl.style.left = (r.left + 4) + 'px';
    spinnerEl.style.top  = (r.top - 34) + 'px';
    spinnerEl.style.display = 'block';
  }

  function hideSpinner() {
    if (spinnerEl) spinnerEl.style.display = 'none';
  }

  // ── Toast ────────────────────────────────────────────────────────────────────

  let toastEl = null, toastTimer = null;

  function toast(msg, type = 'success') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'plt-toast';
      Object.assign(toastEl.style, {
        position: 'fixed', bottom: '90px', left: '50%',
        transform: 'translateX(-50%)', zIndex: '2147483647',
        padding: '9px 18px', borderRadius: '20px',
        fontSize: '13px', fontFamily: "'Segoe UI',system-ui,sans-serif",
        pointerEvents: 'none', opacity: '0', transition: 'opacity .2s',
        whiteSpace: 'nowrap', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis',
      });
      document.body.appendChild(toastEl);
    }
    const C = {
      success: ['#1a3a2a','#4caf80','#2d5a40'],
      error:   ['#3a1a1a','#cf6679','#5a2d35'],
      warn:    ['#2a2a1a','#cfb84a','#4a4a20'],
    }[type] || ['#1a3a2a','#4caf80','#2d5a40'];
    toastEl.style.background = C[0];
    toastEl.style.color      = C[1];
    toastEl.style.border     = `1px solid ${C[2]}`;
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 4500);
  }

  // ── Util ─────────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  let cachedLangConfig = { sourceLang: 'pl', targetLang: 'en-us' };
  getStoredLangConfig();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sourceLang?.newValue) cachedLangConfig.sourceLang = changes.sourceLang.newValue;
    if (changes.targetLang?.newValue) cachedLangConfig.targetLang = changes.targetLang.newValue;
  });

  async function getStoredLangPairLabel(reverse = false) {
    const cfg = await getStoredLangConfig();
    return reverse
      ? formatLangPairLabel(cfg.targetLang, cfg.sourceLang)
      : formatLangPairLabel(cfg.sourceLang, cfg.targetLang);
  }

  async function getStoredLangConfig() {
    const cfg = await browser.storage.local.get(['sourceLang', 'targetLang']);
    cachedLangConfig = {
      sourceLang: cfg.sourceLang || 'pl',
      targetLang: cfg.targetLang || 'en-us'
    };
    return cachedLangConfig;
  }

  function getCachedLangConfig() {
    return cachedLangConfig;
  }

  function formatLangPairLabel(sourceLang, targetLang) {
    return `${String(sourceLang).toUpperCase()} → ${String(targetLang).toUpperCase()}`;
  }

})();
