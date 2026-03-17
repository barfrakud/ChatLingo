# Repository Guidelines

## Project Structure & Module Organization
This repository is a Firefox extension with a flat source layout. Core runtime files live in the root: `manifest.json` defines permissions and entry points, `background.js` handles Anthropic/OpenAI API calls, `content.js` injects chat-page behavior, and `popup.html` + `popup.js` implement the settings UI. Shared styles are in `content.css`, extension icons are in `icons/`, and release/demo images are stored in `screenshots/`. There is currently no `src/` or `tests/` directory.

## Build, Test, and Development Commands
There is no build step or package manager setup in this repo.

- `git clone <repo-url>`: clone the project locally.
- `firefox about:debugging#/runtime/this-firefox`: open Firefox’s temporary add-on loader.
- Load `manifest.json`: install the extension for local testing.
- `git status`: confirm only intended files changed before committing.

For day-to-day work, edit the root files directly and reload the temporary extension in Firefox after each change.

## Coding Style & Naming Conventions
Use plain JavaScript, HTML, and CSS without a bundler. Follow the existing style: 2-space indentation, semicolons, single quotes in JavaScript, and `camelCase` for variables/functions such as `handleTranslateInput`. Keep message types and storage keys uppercase or descriptive string literals, for example `TRANSLATE` and `anthropicKey`. Match the current file naming pattern: lowercase root files like `background.js`, `content.js`, and `popup.js`.

## Testing Guidelines
There is no automated test suite yet; changes are validated manually in Firefox. Test on the supported targets listed in `manifest.json`: WhatsApp Web, Messenger, and Facebook Messages. Verify the main shortcuts and flows:

- `Alt+T`: translate chat input PL -> EN
- `Alt+R`: translate selected text EN -> PL
- `Alt+K`: proofread English and show corrections

For UI or selector changes, add or update screenshots in `screenshots/` when helpful.

## Commit & Pull Request Guidelines
The existing history uses Conventional Commit style, for example `feat: initial release v1.0.0`. Continue with prefixes like `feat:`, `fix:`, and `docs:` followed by a short imperative summary.

Pull requests should include a concise description, affected pages or flows, manual test notes, and screenshots for popup or in-page UI changes. Link related issues when available, and call out any permission or model-default changes in `manifest.json` or `background.js`.

## Security & Configuration Tips
Do not hardcode API keys. Keep secrets in `browser.storage.local` only, and review any permission changes in `manifest.json` carefully before merging.
