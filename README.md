# Spoken English Collector V1.0.0

**Status: COMPLETE / FROZEN**

Spoken English Collector is a local-first Chrome Manifest V3 extension for collecting useful spoken English expressions from webpages.

## V1 workflow

`Region capture → local OCR → editable text → structured AI analysis → save → library → standalone HTML export`

V1 includes:

- Region capture with Escape-to-cancel behavior.
- Packaged English OCR that does not depend on a CDN.
- DeepSeek structured expression analysis with primary and secondary candidates.
- Target lookup for explicitly selected words and short phrases.
- Local IndexedDB persistence with edit and delete support.
- Library search and combined date, scene, and semantic-group filters.
- Standalone HTML export with Smart, Full Notes, and Compact Review presets.

## Install the release package

1. Extract `spoken-english-collector-v1.0.0.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.
6. Click the extension icon to open its Side Panel.

## API configuration

Open **AI** in the Side Panel and enter a DeepSeek API key. The key is stored in `chrome.storage.local` on the current Chrome profile. AI requests are sent to `https://api.deepseek.com/responses` with model `deepseek-v4-flash` and strict structured output.

No API key is bundled with the extension or release archive.

## Local data

- Expression records are stored in IndexedDB.
- Settings and the API key are stored in `chrome.storage.local`.
- Screenshots are used transiently for OCR and are not saved.
- HTML export reads saved records locally and does not call AI.

## Build from source

```powershell
npm install
npm test
npm run build
```

Load the generated `dist` directory from `chrome://extensions`.

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for V1 constraints and [FUTURE_IDEAS.md](FUTURE_IDEAS.md) for explicitly deferred ideas.
