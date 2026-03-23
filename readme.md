# Discord Reader

A **Brave / Chrome browser extension** that overlays Discord in the browser, lets you scroll channels automatically, and saves messages to IndexedDB for later querying.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Chrome Extension — Manifest V3 |
| Language | Vanilla JavaScript (no framework, no bundler) |
| Storage | IndexedDB (local, no server required) |
| UI | Injected HTML/CSS overlay (content script) |
| Hotkey | `chrome.commands` API |

---

## How to Load in Brave (Developer Mode)

1. Open Brave and navigate to `brave://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the root folder of this repository (the folder containing `manifest.json`)
5. The extension will appear in your extensions list
6. Navigate to [https://discord.com](https://discord.com) and press **Alt+D** to toggle the overlay

> **Note:** If Alt+D is intercepted by Discord or the browser before reaching the extension, you can reassign the shortcut at `brave://extensions/shortcuts`.

---

## Project Structure

```
discord_reader/
├── manifest.json               # MV3 config — permissions, content scripts, hotkey
├── background/
│   └── service_worker.js       # Relays Alt+D command to the active tab
├── content/
│   ├── index.js                # Entry point injected into Discord tabs
│   ├── overlay.js              # Builds and toggles the overlay panel DOM
│   ├── scraper.js              # Reads visible messages from the Discord DOM
│   ├── scroller.js             # Auto-scroll controller (walks chat upward)
│   └── discord_selectors.js    # All Discord CSS selectors — single place to fix
├── storage/
│   └── db.js                   # IndexedDB wrapper (guilds / channels / messages)
├── ui/
│   ├── panel.html              # Reference template (not loaded directly)
│   ├── panel.css               # Overlay styles (injected as content-script CSS)
│   └── panel.js                # Render helpers: renderGuilds / renderChannels / renderStatus
└── icons/
    └── icon128.png             # Extension icon (128×128)
```

---

## Phase Status

| Phase | Status | Description |
|---|---|---|
| **1 — Skeleton** | ✅ Complete | Manifest, content script, hotkey, overlay toggle, all module stubs |
| **2 — Storage** | 🔜 Upcoming | IndexedDB integration tests, read/write flows |
| **3 — Scraper** | 🔜 Upcoming | Read guild/channel/message data from live Discord DOM |
| **4 — Scroller** | 🔜 Upcoming | Auto-scroll, stop conditions (date / last saved ID) |
| **5 — Panel UI** | 🔜 Upcoming | Live progress display, guild/channel lists |
| **6 — Wiring** | 🔜 Upcoming | End-to-end: scrape → scroll → save → display |
| **7 — Polish** | 🔜 Upcoming | Error handling, rate limiting, edge cases |

---

## ⚠️ Discord Selector Fragility

Discord's frontend uses **obfuscated, auto-generated class names** (e.g. `container-3w7J-x`) that **change on every deploy**. The extension works around this by:

- Preferring stable `data-*` attributes and ARIA roles wherever Discord exposes them
- Using class-based selectors only as a last resort, marked with `⚠️` comments
- Keeping **all selectors in one file**: `content/discord_selectors.js`

If the extension breaks after a Discord update, `discord_selectors.js` is the **only file that should need updating**.

---

## Data Schema (IndexedDB)

```
guilds:    { id, name, savedAt }
channels:  { id, guildId, name, savedAt }
messages:  { id, channelId, guildId, authorName, content, timestamp, savedAt }
```
