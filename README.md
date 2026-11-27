# 🤖 AI Chat Exporter

Export conversations from **Claude, ChatGPT, Gemini, Grok, Meta AI, DeepSeek** — to **PDF, Word, Markdown, HTML, TXT, JSON**.

---

## Features

| Feature | Details |
|---|---|
| **6 AI Platforms** | Claude, ChatGPT, Gemini, Grok, Meta AI, DeepSeek |
| **6 Export Formats** | PDF, Word (.doc), Markdown, HTML, Plain Text, JSON |
| **Selective Export** | Pick individual messages to include |
| **PDF Customization** | A4/Letter, Light/Dark theme, page numbers |
| **Timestamps** | Toggle on/off in exported files |
| **Code Preservation** | Syntax-highlighted code blocks preserved |
| **Table Support** | HTML tables to Markdown tables |
| **FAB Button** | Floating export button injected into chat pages |
| **SPA Support** | Re-injects on URL changes (ChatGPT, Gemini, etc.) |

---

## Installation (Chrome / Edge)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `D:\Extension` folder
5. Done!

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on"**
3. Select `D:\Extension\manifest.json`

---

## How to Use

### Method 1: Floating Button
1. Open any supported AI chat page
2. A purple **"Export"** button appears in the bottom-right corner
3. Click it — the extension popup opens

### Method 2: Toolbar Icon
1. Click the extension icon in your browser toolbar
2. The popup auto-detects the platform and parses all messages
3. **Export tab** — choose format and export
4. **Messages tab** — select specific messages to include
5. **Options tab** — configure PDF size, theme, timestamps

---

## File Structure

```
Extension/
├── manifest.json
├── background/
│   └── background.js
├── content/
│   ├── parsers.js       (platform parsers)
│   ├── exporters.js     (PDF/Word/MD/HTML/TXT/JSON)
│   ├── content.js       (FAB injection)
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Supported Platforms

| Platform | URL | Status |
|---|---|---|
| Claude | claude.ai | Full support |
| ChatGPT | chatgpt.com | Full support |
| Gemini | gemini.google.com | Full support |
| Grok | grok.com | Full support |
| Meta AI | meta.ai | Full support |
| DeepSeek | chat.deepseek.com | Full support |

---

## Adding a New Platform

1. Add URL to `manifest.json` `host_permissions` and `content_scripts.matches`
2. Add detection case in `detectPlatform()` in `parsers.js`
3. Add a `parsePlatformName()` function in `parsers.js`
4. Add metadata to `getPlatformMeta()` in `parsers.js`
5. Add the parser case in the `parseChat()` switch

---

MIT License
