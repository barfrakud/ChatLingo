// popup.js

const DEFAULT_MODELS = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', badge: 'tani' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', badge: 'szybki' },
    { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   badge: 'expensive' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', badge: 'tani' },
    { id: 'gpt-4o',      label: 'GPT-4o',      badge: 'szybki' },
    { id: 'gpt-4.1',     label: 'GPT-4.1',     badge: 'expensive' },
  ]
};

const DEFAULT_SOURCE_LANG = 'pl';
const DEFAULT_TARGET_LANG = 'en-us';
const DEFAULT_TARGET_BY_SOURCE = {
  pl: 'en-us',
  'en-us': 'pl',
  'en-gb': 'pl',
  da: 'pl'
};
const DEFAULT_SOURCE_BY_TARGET = {
  pl: 'en-us',
  'en-us': 'pl',
  'en-gb': 'pl',
  da: 'pl'
};

let state = {
  extensionEnabled: true,
  hoverEnabled: true,
  provider: 'anthropic',
  anthropicKey: '',
  openaiKey: '',
  model: 'claude-haiku-4-5-20251001',
  tone: 'natural',
  sourceLang: DEFAULT_SOURCE_LANG,
  targetLang: DEFAULT_TARGET_LANG,
  customModels: []   // [{provider, id, label}]
};

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await browser.storage.local.get([
    'extensionEnabled', 'hoverEnabled', 'provider', 'anthropicKey', 'openaiKey', 'model', 'tone', 'sourceLang', 'targetLang', 'customModels'
  ]);
  if (typeof saved.extensionEnabled === 'boolean') state.extensionEnabled = saved.extensionEnabled;
  if (typeof saved.hoverEnabled === 'boolean')     state.hoverEnabled     = saved.hoverEnabled;
  if (saved.provider)      state.provider      = saved.provider;
  if (saved.anthropicKey)  state.anthropicKey  = saved.anthropicKey;
  if (saved.openaiKey)     state.openaiKey     = saved.openaiKey;
  if (saved.model)         state.model         = saved.model;
  if (saved.tone)          state.tone          = saved.tone;
  if (saved.sourceLang)    state.sourceLang    = saved.sourceLang;
  if (saved.targetLang)    state.targetLang    = saved.targetLang;
  if (saved.customModels)  state.customModels  = saved.customModels;
  ensureDistinctLanguages('source');

  applyStateToUI();
  bindEvents();
  updateExtensionBadge();
});

function applyStateToUI() {
  document.getElementById('extensionEnabled').checked = state.extensionEnabled;
  document.getElementById('hoverEnabled').checked = state.hoverEnabled;
  document.getElementById('hoverEnabled').disabled = !state.extensionEnabled;
  // Provider buttons
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === state.provider);
  });
  // API key fields
  document.getElementById('field-anthropic').style.display = state.provider === 'anthropic' ? '' : 'none';
  document.getElementById('field-openai').style.display    = state.provider === 'openai'    ? '' : 'none';
  document.getElementById('anthropicKey').value = state.anthropicKey;
  document.getElementById('openaiKey').value    = state.openaiKey;
  // Tone buttons
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tone === state.tone);
  });
  document.getElementById('sourceLang').value = state.sourceLang;
  document.getElementById('targetLang').value = state.targetLang;
  // Model list
  renderModelList();
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('extensionEnabled').addEventListener('change', async (e) => {
    state.extensionEnabled = e.target.checked;
    if (!state.extensionEnabled) state.hoverEnabled = false;
    applyStateToUI();
    await saveToggles();
  });

  document.getElementById('hoverEnabled').addEventListener('change', async (e) => {
    state.hoverEnabled = e.target.checked && state.extensionEnabled;
    applyStateToUI();
    await saveToggles();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Provider toggle
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.provider = btn.dataset.provider;
      // Set default model for this provider if current model doesn't belong
      const providerModels = getAllModels(state.provider);
      if (!providerModels.find(m => m.id === state.model)) {
        state.model = providerModels[0].id;
      }
      applyStateToUI();
    });
  });

  // Tone toggle
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tone = btn.dataset.tone;
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('sourceLang').addEventListener('change', (e) => {
    state.sourceLang = e.target.value;
    ensureDistinctLanguages('source');
    applyStateToUI();
  });

  document.getElementById('targetLang').addEventListener('change', (e) => {
    state.targetLang = e.target.value;
    ensureDistinctLanguages('target');
    applyStateToUI();
  });

  // Save API
  document.getElementById('saveBtn').addEventListener('click', saveAll);

  // Save tone (same storage, just different button)
  document.getElementById('saveToneBtn').addEventListener('click', async () => {
    await browser.storage.local.set({
      extensionEnabled: state.extensionEnabled,
      hoverEnabled: state.hoverEnabled,
      tone: state.tone,
      sourceLang: state.sourceLang,
      targetLang: state.targetLang
    });
    updateExtensionBadge();
    showStatus('statusStyle', '✓ Styl i języki zapisane', 'ok');
  });

  // Add custom model
  document.getElementById('addModelBtn').addEventListener('click', addCustomModel);
  document.getElementById('customModelInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomModel();
  });
}

// ── Model list ────────────────────────────────────────────────────────────────

function getAllModels(provider) {
  const defaults = DEFAULT_MODELS[provider] || [];
  const custom   = state.customModels.filter(m => m.provider === provider);
  return [...defaults, ...custom];
}

function renderModelList() {
  const list = document.getElementById('modelList');
  const models = getAllModels(state.provider);
  list.innerHTML = '';

  models.forEach(m => {
    const isDefault = DEFAULT_MODELS[state.provider]?.find(d => d.id === m.id);
    const isSelected = m.id === state.model;

    const item = document.createElement('div');
    item.className = 'model-item' + (isSelected ? ' selected' : '');
    item.innerHTML = `
      <div class="model-radio"><div class="model-radio-dot"></div></div>
      <span class="model-name">${m.label || m.id}</span>
      ${m.badge ? `<span class="model-badge ${m.badge === 'expensive' ? 'expensive' : ''}">${m.badge === 'expensive' ? 'premium' : m.badge}</span>` : ''}
      ${!isDefault ? `<span class="btn-small btn-danger" style="padding:2px 6px;font-size:10px" data-remove="${m.id}">×</span>` : ''}
    `;
    item.addEventListener('click', (e) => {
      if (e.target.dataset.remove) return; // handled below
      state.model = m.id;
      renderModelList();
      browser.storage.local.set({ model: state.model });
    });

    // Remove button for custom models
    const removeBtn = item.querySelector('[data-remove]');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.customModels = state.customModels.filter(cm => cm.id !== m.id);
        if (state.model === m.id) state.model = getAllModels(state.provider)[0]?.id || '';
        browser.storage.local.set({ customModels: state.customModels, model: state.model });
        renderModelList();
      });
    }

    list.appendChild(item);
  });
}

function addCustomModel() {
  const input = document.getElementById('customModelInput');
  const id = input.value.trim();
  if (!id) return;

  // Deduplicate
  const exists = getAllModels(state.provider).find(m => m.id === id);
  if (exists) {
    input.value = '';
    return;
  }

  state.customModels.push({ provider: state.provider, id, label: id });
  state.model = id;
  browser.storage.local.set({ customModels: state.customModels, model: state.model });
  input.value = '';
  renderModelList();
}

function ensureDistinctLanguages(changedField) {
  if (state.sourceLang !== state.targetLang) return;

  if (changedField === 'target') {
    state.sourceLang = getFallbackSourceLang(state.targetLang);
  } else {
    state.targetLang = getFallbackTargetLang(state.sourceLang);
  }
}

function getFallbackTargetLang(sourceLang) {
  const preferred = DEFAULT_TARGET_BY_SOURCE[sourceLang];
  if (preferred && preferred !== sourceLang) return preferred;
  return ['en-us', 'en-gb', 'da', 'pl'].find(code => code !== sourceLang) || DEFAULT_TARGET_LANG;
}

function getFallbackSourceLang(targetLang) {
  const preferred = DEFAULT_SOURCE_BY_TARGET[targetLang];
  if (preferred && preferred !== targetLang) return preferred;
  return ['pl', 'en-us', 'en-gb', 'da'].find(code => code !== targetLang) || DEFAULT_SOURCE_LANG;
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveAll() {
  const anthropicKey = document.getElementById('anthropicKey').value.trim();
  const openaiKey    = document.getElementById('openaiKey').value.trim();

  // Validate the relevant key
  if (state.provider === 'anthropic' && anthropicKey && !anthropicKey.startsWith('sk-ant-')) {
    showStatus('status', 'Klucz Anthropic powinien zaczynać się od sk-ant-', 'err');
    return;
  }
  if (state.provider === 'openai' && openaiKey && !openaiKey.startsWith('sk-')) {
    showStatus('status', 'Klucz OpenAI powinien zaczynać się od sk-', 'err');
    return;
  }

  if (state.provider === 'anthropic' && !anthropicKey) {
    showStatus('status', 'Wpisz klucz Anthropic API', 'err');
    return;
  }
  if (state.provider === 'openai' && !openaiKey) {
    showStatus('status', 'Wpisz klucz OpenAI API', 'err');
    return;
  }

  state.anthropicKey = anthropicKey || state.anthropicKey;
  state.openaiKey    = openaiKey    || state.openaiKey;

  await browser.storage.local.set({
    extensionEnabled: state.extensionEnabled,
    hoverEnabled: state.hoverEnabled,
    provider:     state.provider,
    anthropicKey: state.anthropicKey,
    openaiKey:    state.openaiKey,
    model:        state.model,
    tone:         state.tone,
    sourceLang:   state.sourceLang,
    targetLang:   state.targetLang,
    customModels: state.customModels,
  });

  showStatus('status', '✓ Zapisano!', 'ok');
  updateExtensionBadge();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveToggles() {
  await browser.storage.local.set({
    extensionEnabled: state.extensionEnabled,
    hoverEnabled: state.hoverEnabled
  });
  updateExtensionBadge();
}

function updateExtensionBadge() {
  if (!browser?.browserAction) return;
  if (!state.extensionEnabled) {
    browser.browserAction.setBadgeText({ text: 'OFF' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#8b2d3b' });
    return;
  }
  if (!state.hoverEnabled) {
    browser.browserAction.setBadgeText({ text: 'MAN' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#6f5d14' });
    return;
  }
  browser.browserAction.setBadgeText({ text: 'ON' });
  browser.browserAction.setBadgeBackgroundColor({ color: '#2d6a4f' });
}

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status ' + type;
  setTimeout(() => { el.className = 'status'; }, 3000);
}
