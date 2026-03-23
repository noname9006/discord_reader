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
│   ├── queue_controller.js     # Multi-channel scrape queue (sequential, stoppable)
│   ├── nav_reader.js           # Reads guilds and channels from live Discord DOM
│   ├── nav_controller.js       # Populates panel panes, click-to-navigate, MutationObserver
│   ├── exporter.js             # Exports saved messages to JSON or CSV download
│   ├── health_check.js         # Selector health diagnostics (DOM query runner)
│   └── discord_selectors.js    # All Discord CSS selectors — single place to fix
├── storage/
│   └── db.js                   # IndexedDB wrapper (guilds / channels / messages)
├── ui/
│   ├── panel.html              # Reference template (not loaded directly)
│   ├── panel.css               # Overlay styles (injected as content-script CSS)
│   ├── panel.js                # Render helpers: renderGuilds / renderChannels / renderStatus / setScrapeButtonState
│   └── health_panel.js         # Renders health check results into the Health pane
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
| **6 — Selector Health Check** | ✅ Complete | Selector Health Check — live DOM diagnostics, tab-switched health pane, green/yellow/red per selector |
| **7 — Stored Data Viewer** | ✅ Complete | Message list in overlay panel; tab switcher (Messages \| Controls); paginated load (50/page); auto-refresh on scrape complete |
| **8 — Polish** | ✅ Complete | Error handling, rate limiting, edge cases — `_isStopped` flag, null guildId guard, DB-write user warning, adaptive scroll delay, `maxSteps` cap, lazy DB init, export error handling, nav error state, popstate cleanup, mid-scrape navigation warning, author walkback cap, empty-state placeholder |
| **9 — Multi-channel Scrape Queue** | ✅ Complete | Channel selection checkboxes in the Channels pane; "Scrape selected" and "Scrape all channels" queue buttons; sequential per-channel scrape with live progress; stop mid-queue support |

### Phase 9 added
- `content/queue_controller.js` (new): `QueueController` IIFE module — `startQueue(channels, mode)` iterates an array of `{ id, name, guildId }` objects sequentially: navigates to each channel via `NavController.navigateToChannel`, waits 1200 ms for Discord to render, runs `ScrapeController.start({ defaultDays: 7 })`, then refreshes channel badges; per-channel errors are caught and logged without aborting the queue; `stop()` sets a `_stopRequested` flag checked between iterations and stops any in-progress scrape; `isRunning()` exposes queue state; `setQueueButtonState` called on start/teardown
- `content/nav_controller.js`: module-level `_selectedChannelIds` Set tracks which channels are checked; `_channelDataMap` Map stores `{ id, name, guildId }` for every rendered channel; `_lastRenderedGuildId` clears the selection set on guild switch; click delegation handler distinguishes checkbox clicks (toggle selection, update "Scrape selected" enabled state) from label/row clicks (navigate + load messages); `navigateToChannel(_navigateToChannel)`, `getSelectedChannels()`, and `getAllChannels()` added to the public API
- `ui/panel.js`: `renderChannels()` updated — each `<li>` now contains an `<input type="checkbox" class="dr-ch-checkbox">` (checked when `channel.selected === true`, `tabIndex=-1`) followed by a `<span class="dr-ch-label">` wrapping the channel name and badge; `setQueueButtonState(running, mode)` toggles text and disabled state of both queue buttons; `setSelectedScrapeButtonEnabled(enabled)` enables/disables the "Scrape selected" button when the queue is not running; both functions exported
- `content/overlay.js`: queue action row (`div.dr-queue-row`) with `button#dr-scrape-selected-btn` (disabled by default) and `button#dr-scrape-all-btn` added below the export row in `msgViewControls`; click handlers call `QueueController.stop()` when running or `QueueController.startQueue()` with the appropriate channel list and mode; `/* global */` comment updated to include `QueueController`
- `ui/panel.css`: styles for `.dr-ch-checkbox` (12×12 px, `accent-color: #5865f2`), `.dr-ch-label` (flex, ellipsis), `.dr-channels-pane .dr-list li` (flex row), `.dr-queue-row` (flex row, 6 px gap), `.dr-queue-btn` (green-tinted, hover/active/disabled states)
- `manifest.json`: `content/queue_controller.js` added to the content scripts load order after `content/scrape_controller.js` and before `content/nav_reader.js`

### Phase 8 added
- `content/scrape_controller.js`: `_isStopped` module-level flag — set in `stop()`, checked at the top of `onBatch`, `onComplete`, and `onError` to prevent double-teardown; null `guildId` guard — skips `DB.saveGuild` in DM contexts (logs a warning instead); `onBatch` catch block now calls `renderStatus('⚠ DB write error — some messages may not have been saved.')` so the user sees feedback; `isRunning()` getter exposed on the public API
- `content/scroller.js`: Adaptive step delay — if a batch returns 0 messages or the same IDs as the previous batch, `_stepDelay` is doubled (capped at 3000 ms); reset to `_baseStepDelay` on any batch with new content; `maxSteps` constructor option (default 2000) — increments `_stepCount` each step and calls `onComplete()` when the cap is reached, preventing infinite loops on stuck virtual scroll containers
- `storage/db.js`: Lazy `init()` guard added to `saveGuild`, `saveChannel`, and `saveMessages` — each calls `await init()` if `_db` is null, making the API self-initialising; `getMessagesPage` annotated with a JSDoc note documenting the fetch-all performance trade-off as a known concern for future optimisation
- `content/exporter.js`: `DB.getMessagesByChannel` wrapped in try/catch — on failure calls `renderStatus('Export failed — could not read messages from storage.')` and returns; `_triggerDownload` now uses try/finally so `removeChild` and `revokeObjectURL` always run even if `.click()` throws
- `content/nav_controller.js`: `_loadAndShowMessages` catch block now calls `renderMessageViewer([], false)` and injects a `<li>` with `'⚠ Could not load messages — see console for details.'` into `#dr-msg-list`; `_popstateHandler` reference stored and removed in `stopObserving()` to fix the memory leak; `refreshChannels` guards against undefined `targetGuildId` with an early return; channel click handler checks `ScrapeController.isRunning()` before navigating — if true, calls `ScrapeController.stop()` and updates status
- `content/scraper.js`: Author walkback loop capped at 10 iterations to prevent O(n) traversal on large virtual lists
- `content/overlay.js`: `#dr-msg-list` initialised with a placeholder `<li>` (`"← Select a channel to view saved messages."`) so the Messages tab is never blank on first open
- `readme.md`: Phase 8 marked ✅ Complete; project structure tree updated to include `content/health_check.js` and `ui/health_panel.js` (added in Phase 6 but missing from the tree)

### Phase 7 added
- `storage/db.js`: `DB.getMessagesPage(channelId, offset, limit)` — returns a page of messages sorted newest-first for paginated display
- `ui/panel.js`: `renderMessageViewer(messages, hasMore)` — renders first page of saved messages into `#dr-msg-list`; shows empty state if none; `appendMessages(messages, hasMore)` — appends next page of messages; `_buildMessageRow` builds each `<li>` with `.dr-msg-meta` (timestamp + author) and `.dr-msg-body` (content, truncated at 120 chars with `title` for full text); `_updateLoadMoreBtn` adds/removes "Load more" button
- `content/overlay.js`: Messages pane restructured with inner tab bar (`Messages | Controls`); messages view (`#dr-msg-view-messages`) with `#dr-msg-list` visible by default; controls view (`#dr-msg-view-controls`) contains scrape button, status, and export row; tab click handlers toggle `.hidden` class on sub-views
- `content/nav_controller.js`: `_loadAndShowMessages(channelId, offset)` loads a page from DB and calls `renderMessageViewer`/`appendMessages`; channel click handler now calls `_loadAndShowMessages` on every click (no auto-scrape); `refreshChannels()` calls `_loadAndShowMessages` for the active channel after rendering, so messages auto-refresh when panel opens or after a scrape completes
- `ui/panel.css`: Styles for `.dr-msg-tabs`, `.dr-msg-tab`, `.dr-msg-view`, `.dr-msg-list`, `.dr-msg-meta`, `.dr-msg-body`, `.dr-load-more-item`, and `.dr-load-more-btn`

### Phase 6 added
- `content/health_check.js` — `HealthCheck.run()` IIFE; iterates all `SELECTORS` keys, runs `querySelectorAll` on each, returns array sorted by severity (fail → warn → ok); fallback keys marked `warn` when matched
- `ui/health_panel.js` — `runAndRenderHealthCheck()` global; renders results into `#dr-health-pane` with colored dots, key names, match counts, and a summary line
- `content/overlay.js`: Tab bar (`.dr-tabs`) added above `.dr-body`; `#dr-health-pane` added as sibling; tab click handlers toggle `hidden` class; "Run Check" button wired to `runAndRenderHealthCheck()`
- `ui/panel.css`: Tab bar styles (`.dr-tabs`, `.dr-tab`, `.dr-tab.active`) and health pane styles (`.dr-health-row--ok/warn/fail`, `.dr-health-dot`, `.dr-health-key`, `.dr-health-count`, `.dr-health-summary`)
- `manifest.json`: `content/health_check.js` added after `content/discord_selectors.js`; `ui/health_panel.js` added after `ui/panel.js`

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
