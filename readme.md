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
│   ├── scrape_controller.js    # Orchestrates scrape flow (scraper + scroller + DB + UI)
│   ├── nav_reader.js           # Reads guilds and channels from live Discord DOM
│   ├── nav_controller.js       # Populates panel panes, click-to-navigate, MutationObserver
│   ├── exporter.js             # Exports saved messages to JSON or CSV download
│   └── discord_selectors.js    # All Discord CSS selectors — single place to fix
├── storage/
│   └── db.js                   # IndexedDB wrapper (guilds / channels / messages)
├── ui/
│   ├── panel.html              # Reference template (not loaded directly)
│   ├── panel.css               # Overlay styles (injected as content-script CSS)
│   └── panel.js                # Render helpers: renderGuilds / renderChannels / renderStatus / setScrapeButtonState
└── icons/
    └── icon128.png             # Extension icon (128×128)
```

---

## Phase Status

| Phase | Status | Description |
|---|---|---|
| **1 — Skeleton** | ✅ Complete | Manifest, content script, hotkey, overlay toggle, all module stubs |
| **2 — Wire Scraper + Scroller to Storage** | ✅ Complete | `scrape_controller.js` orchestrates scrape flow; scrape button wired with live progress and stop support; `DB.getLastMessageId()` added |
| **3 — Populate Guilds & Channels Panes** | ✅ Complete | `nav_reader.js` + `nav_controller.js`; Guilds and Channels panes populated from live Discord DOM on overlay open; click-to-navigate; MutationObserver auto-refresh |
| **4 — Click-to-Navigate + Scrape + Count Badges** | ✅ Complete | Clicking a channel navigates Discord and starts scraping; saved message counts shown as badges in the Channels pane; `DB.getMessageCountByChannel()` added; button text updated to "Scrape current channel" |
| **5 — Export Saved Messages to File** | ✅ Complete | Export JSON/CSV buttons in the Messages pane; `content/exporter.js` fetches messages from IndexedDB and triggers a browser download |
| **6 — Panel UI** | 🔜 Upcoming | Live progress display, guild/channel lists |
| **7 — Wiring** | 🔜 Upcoming | End-to-end: scrape → scroll → save → display |
| **8 — Polish** | 🔜 Upcoming | Error handling, rate limiting, edge cases |

### Phase 5 added
- `content/exporter.js` — `exportCurrentChannel(format)` fetches messages from IndexedDB for the active channel and triggers a browser download as JSON or CSV; `_toCsv()` builds RFC-compliant CSV with quoted/escaped values; `_triggerDownload()` uses Blob URL and a temporary anchor element
- `content/overlay.js`: Two export buttons (`⬇ JSON`, `⬇ CSV`) added below the scrape button, wrapped in a `div.dr-export-row`; wired to `exportCurrentChannel('json')` / `exportCurrentChannel('csv')`
- `ui/panel.css`: Styles for `.dr-export-row` (flex row, 6px gap) and `.dr-export-btn` (translucent Discord-blue, hover/active states)
- `manifest.json`: `content/exporter.js` added after `storage/db.js` and before `ui/panel.js`

### Phase 4 added
- `storage/db.js`: `DB.getMessageCountByChannel(channelId)` — returns saved message count for a channel using the channelId index
- `ui/panel.js`: `renderChannels()` shows count badges `(N)` next to channel names; scrape button text changed to "Scrape current channel"
- `ui/panel.css`: Styles for `.dr-msg-count` (muted, 11px) and `li.active .dr-msg-count` (lighter on active item)
- `content/nav_controller.js`: `refreshChannels()` is now async — fetches counts from DB and adds them to channel data; channel click handler navigates Discord and starts a scrape; both guild and channel list handlers use `_navDelegateHandler` remove-then-add pattern to avoid duplicate listeners; MutationObserver debounce forwards async errors to console
- `content/overlay.js`: Scrape button text updated to "Scrape current channel"
- `content/scrape_controller.js`: `onComplete` calls `NavController.refreshChannels()` to refresh count badges after each scrape

### Phase 3 added
- `content/nav_reader.js` — reads guilds and channels from live Discord DOM
- `content/nav_controller.js` — populates panel panes, handles click-to-navigate, MutationObserver auto-refresh
- Guilds pane now populated on overlay open
- Channels pane now populated on overlay open, filtered to current guild
- Clicking guild navigates Discord and refreshes channels pane
- Clicking channel navigates Discord to that channel
- URL polling (750ms) + MutationObserver (400ms debounce) keeps panes in sync with Discord navigation

### Phase 2 added
- `content/scrape_controller.js` — orchestrates scrape flow (scraper + scroller + DB + UI)
- Wired scrape button in overlay (replaces console.log placeholder)
- Live progress updates in status pane ("Scraping… N messages saved")
- Stop/resume button state via `setScrapeButtonState()` in `ui/panel.js`
- `DB.getLastMessageId()` — returns highest snowflake ID for a channel
- `storage/db.js` added to content scripts in `manifest.json`
- `scroller.js` `_step()` made `async` so `onBatch` DB writes complete before next scroll step

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
