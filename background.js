// background.js — obsługuje wywołania API (Anthropic + OpenAI)

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRANSLATE')   return handleRequest(message);
  if (message.type === 'PROOFREAD')   return handleRequest(message);
});

function getLangName(code) {
  return {
    pl: 'Polish',
    'en-us': 'American English',
    'en-gb': 'British English',
    da: 'Danish'
  }[code] || 'English';
}

function getLangCodeLabel(code) {
  return String(code || '').toUpperCase();
}

async function handleRequest(message) {
  const cfg = await browser.storage.local.get([
    'provider', 'anthropicKey', 'openaiKey', 'model', 'tone', 'sourceLang', 'targetLang'
  ]);

  const provider       = cfg.provider || 'anthropic';
  const tone           = cfg.tone || 'natural';
  const configuredSourceLang = cfg.sourceLang || 'pl';
  const configuredTargetLang = cfg.targetLang || 'en-us';
  const isReverseTranslation = message.type === 'TRANSLATE' && !!message.reverse;
  const sourceLang     = isReverseTranslation ? configuredTargetLang : configuredSourceLang;
  const targetLang     = isReverseTranslation ? configuredSourceLang : configuredTargetLang;
  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);
  const apiKey         = provider === 'openai' ? cfg.openaiKey : cfg.anthropicKey;

  if (!apiKey) {
    return { error: 'Brak klucza API. Otwórz ustawienia rozszerzenia i wpisz klucz.' };
  }

  const toneDesc = tone === 'formal'
    ? 'formal, professional register'
    : 'natural, conversational, informal register';

  let systemPrompt, userPrompt;

  if (message.type === 'TRANSLATE') {
    systemPrompt = `You are a translator. Translate ${sourceLangName} to ${targetLangName} using ${toneDesc}.

Your task is translation only.
- Output ONLY the translation in ${targetLangName}
- Do NOT answer the message
- Do NOT continue the conversation
- Do NOT explain, summarize, comment, label, or add quotes
- If the input is a question, translate the question exactly as a question
- Preserve meaning, tone, punctuation, and intent faithfully`;
    userPrompt   = `Translate exactly this text and nothing else:\n<<<TEXT>>>\n${message.text}\n<<<END TEXT>>>`;

  } else if (message.type === 'PROOFREAD') {
    systemPrompt = `You are a ${targetLangName} language coach. The user writes in ${targetLangName} and wants help improving their message.
Tone/register to use: ${toneDesc}.

Respond in this exact JSON format (no markdown, no extra text):
{
  "corrected": "<corrected version of the message>",
  "hasErrors": true/false,
  "corrections": [
    { "original": "<original fragment>", "fixed": "<corrected fragment>", "reason": "<short explanation in Polish>" }
  ]
}

If the text is already correct, set hasErrors to false and corrections to [].`;
    userPrompt = message.text;
  } else {
    return { error: 'Nieobsługiwany typ żądania.' };
  }

  const model = cfg.model || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5-20251001');

  try {
    if (message.type === 'TRANSLATE' && sourceLang === targetLang) {
      return {
        translated: message.text,
        langPairLabel: `${getLangCodeLabel(sourceLang)} → ${getLangCodeLabel(targetLang)}`
      };
    }

    let result;
    if (provider === 'anthropic') {
      result = await callAnthropic(apiKey, model, systemPrompt, userPrompt);
    } else {
      result = await callOpenAI(apiKey, model, systemPrompt, userPrompt);
    }

    if (message.type === 'TRANSLATE' && !result.error) {
      return {
        ...result,
        langPairLabel: `${getLangCodeLabel(sourceLang)} → ${getLangCodeLabel(targetLang)}`
      };
    }
    return result;
  } catch (e) {
    return { error: `Błąd połączenia: ${e.message}` };
  }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(apiKey, model, systemPrompt, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { error: `Anthropic API błąd (${response.status}): ${err?.error?.message || 'nieznany'}` };
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) return { error: 'Brak odpowiedzi z Anthropic API' };
  return { translated: text };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey, model, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { error: `OpenAI API błąd (${response.status}): ${err?.error?.message || 'nieznany'}` };
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return { error: 'Brak odpowiedzi z OpenAI API' };
  return { translated: text };
}

// ── Keyboard shortcut from manifest commands ─────────────────────────────────

browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  if (command === 'translate-input') {
    browser.tabs.sendMessage(tabs[0].id, { type: 'TRANSLATE_INPUT_FIELD' });
  }
});
