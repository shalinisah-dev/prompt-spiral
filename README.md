# Prompt Spiral

A quiet, local-first Chrome extension that offers a grounded next prompt when another approach may help. It supports ChatGPT, Claude, and Gemini without sending conversation text to a server.

## What it does

- Reads only the visible messages in the active supported chat.
- Conservatively notices repeated, overlapping corrections.
- Shows a small **✦ Another angle?** pill; it never opens automatically.
- Generates one complete next prompt from the original goal and recent corrections.
- Inserts the suggestion into the composer without sending it, or explicitly reports when it copied the prompt instead.
- Keeps manual toolbar access available even when passive suggestions are off.

There is no backend, telemetry, analytics SDK, transcript storage, API key, or automatic message submission.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository folder.
5. Open a supported chat and click the extension toolbar action to request **Another angle** manually.

Passive suggestions are enabled by default. To disable them, open the extension's details in Chrome, choose **Extension options**, and enable **Suggestions off**. Manual toolbar suggestions continue to work.

## Supported sites

- `https://chatgpt.com/*` (and the legacy `chat.openai.com` host)
- `https://claude.ai/*`
- `https://gemini.google.com/*`

Provider markup changes over time. Extraction is deliberately fail-closed: if an attributed conversation cannot be read, the extension does not fabricate a suggestion.

## Privacy and security

All extraction and rewriting happen in the browser. Conversation text is bounded, held transiently in memory, and never written to extension storage or logs. Storage contains only the passive-suggestion setting and per-tab suppression counters/timestamps. Page content is treated as untrusted text; it is never executed or inserted as HTML.

The extension requests only `storage` plus host access for the three supported chat providers.

## Development

The project has no runtime or development dependencies. Node 20 or newer is sufficient for the validation suite.

```sh
npm test
npm run check
```

The tests cover grounded rewriting, fail-closed behavior, detection and cooldown rules, and provider-specific extraction fixtures. Before publishing a Chrome Web Store build, authenticated manual smoke tests should also be completed on all three live providers.

## Project layout

```text
manifest.json          Chrome Manifest V3 configuration
src/extraction.js      Provider-specific DOM extraction
src/rewrite.js         Grounded local rewrite generation
src/detector.js        Conservative detection and suppression
src/content.js         In-page behavior and interaction
src/content.css        Accessible light/dark interface
src/background.js      Manual toolbar invocation
options/               Passive-suggestion setting
test/                  Node test suite and provider fixtures
```

## License

Licensed under [CC BY 4.0](LICENSE). You may use, share, and adapt the project, including commercially, provided you give appropriate attribution, link to the license, and indicate changes.
