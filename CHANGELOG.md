# Changelog

## [1.2.0] — 2026

### Dodano
- Wybór języka źródłowego i docelowego
- Obsługiwane języki: polski, angielski amerykański, angielski brytyjski, duński
- Ton (potoczny/formalny) działa dla wszystkich kombinacji językowych
- Tłumaczenie wiadomości po najechaniu kursorem z dymkiem nad tekstem
- Szybkie przełączniki: globalne ON/OFF oraz osobny ON/OFF dla tłumaczenia po najechaniu
- Badge na ikonie dodatku: `ON`, `MAN`, `OFF`

### Zmieniono
- Hover i `Alt+R` tłumaczą wiadomości rozmówcy w kierunku `język docelowy -> język źródłowy`
- `Alt+T` pozostaje tłumaczeniem tekstu wpisywanego w kierunku `język źródłowy -> język docelowy`

### Naprawiono
- Hover ignoruje znaczniki czasu i krótkie elementy UI, aby nie tłumaczyć godzin wiadomości
- Prompt tłumaczenia wymusza tłumaczenie treści pytania zamiast odpowiadania na wiadomość

---

## [1.1.0] — 2026

### Dodano
- Obsługa dwóch dostawców AI: **Anthropic** i **OpenAI**
- Wybór modelu z listy (Haiku, Sonnet, Opus / GPT-4o-mini, GPT-4o, GPT-4.1)
- Możliwość dodawania własnych modeli po identyfikatorze
- Wybór tonu tłumaczenia: **potoczny** lub **formalny**
- **Alt+K** — korekta angielskiego z panelem błędów i wyjaśnieniami po polsku
- Tłumaczenie EN→PL wyłącznie przez zaznaczenie tekstu + Alt+R (bez hovera)
- Czterozakładkowy panel ustawień (API / Modele / Styl / Skróty)

### Zmieniono
- Usunięto automatyczne tłumaczenie przy najechaniu kursorem — ogranicza zbędne wywołania API
- Poprawiono pozycjonowanie dymka z tłumaczeniem

---

## [1.0.1] — 2026

### Naprawiono
- Dodano nagłówek `anthropic-dangerous-direct-browser-access: true` — naprawia błąd CORS 401 na Messengerze
- Poprawiono selektory pola wpisywania w WhatsApp Web (obsługa różnych wersji layoutu)
- Alt+R i Alt+T rejestrowane w fazie przechwytywania (`capture: true`) — zapobiega przejęciu skrótu przez aplikację (np. WhatsApp reply)
- Usunięto podwójne wstawianie tekstu po tłumaczeniu (błędny fallback po `execCommand`)

---

## [1.0.0] — 2026

### Pierwsze wydanie
- Tłumaczenie pola czatu PL→EN skrótem **Alt+T**
- Tłumaczenie zaznaczonego tekstu EN→PL skrótem **Alt+R** z dymkiem
- Hover na wiadomościach przychodzących EN→PL (usunięty w 1.1.0)
- Obsługa WhatsApp Web i Messenger
- Klucz Anthropic API przechowywany w `browser.storage.local`
- Wybór modelu Claude (Haiku / Sonnet)
