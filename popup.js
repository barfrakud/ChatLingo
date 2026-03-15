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

let state = {
  provider: 'anthropic',
  anthropicKey: '',
  openaiKey: '',
  model: 'claude-haiku-4-5-20251001',
  tone: 'natural',
  customModels: []   // [{provider, id, label}]
};

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await browser.storage.local.get([
    'provider', 'anthropicKey', 'openaiKey', 'model', 'tone', 'customModels'
  ]);
  if (saved.provider)      state.provider      = saved.provider;
  if (saved.anthropicKey)  state.anthropicKey  = saved.anthropicKey;
  if (saved.openaiKey)     state.openaiKey     = saved.openaiKey;
  if (saved.model)         state.model         = saved.model;
  if (saved.tone)          state.tone          = saved.tone;
  if (saved.customModels)  state.customModels  = saved.customModels;

  applyStateToUI();
  bindEvents();
});

function applyStateToUI() {
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
  // Model list
  renderModelList();
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
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

  // Save API
  document.getElementById('saveBtn').addEventListener('click', saveAll);

  // Save tone (same storage, just different button)
  document.getElementById('saveToneBtn').addEventListener('click', async () => {
    await browser.storage.local.set({ tone: state.tone });
    showStatus('statusStyle', '✓ Styl zapisany', 'ok');
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
    provider:     state.provider,
    anthropicKey: state.anthropicKey,
    openaiKey:    state.openaiKey,
    model:        state.model,
    tone:         state.tone,
    customModels: state.customModels,
  });

  showStatus('status', '✓ Zapisano!', 'ok');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status ' + type;
  setTimeout(() => { el.className = 'status'; }, 3000);
}
