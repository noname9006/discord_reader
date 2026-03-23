/**
 * content/overlay.js
 *
 * Creates and manages the Discord Reader overlay panel.
 * The panel is injected once into the Discord tab's DOM and then toggled
 * visible/hidden on subsequent calls — the DOM is never re-created.
 *
 * The actual HTML structure is built with createElement / appendChild
 * (never innerHTML / document.write) for security.
 *
 * Exports: toggleOverlay()
 */

/* global renderGuilds, renderChannels, renderStatus, setScrapeButtonState, ScrapeController, NavController */

// Module-level reference to the root panel element (null until first call)
let _panelRoot = null;

// Tracks whether a scrape is currently in progress
let _scraping = false;

/**
 * Toggle the overlay panel.
 *   - First call: build the DOM and inject it, then show it.
 *   - Subsequent calls: flip the `hidden` CSS class.
 */
function toggleOverlay() {
  if (!_panelRoot) {
    _panelRoot = _buildPanel();
    document.body.appendChild(_panelRoot);
    NavController.startObserving();
  }

  _panelRoot.classList.toggle("hidden");

  // Refresh nav panes whenever the panel is shown
  if (!_panelRoot.classList.contains("hidden")) {
    NavController.refreshGuilds();
    NavController.refreshChannels().catch(err =>
      console.error("[Discord Reader] NavController refresh error:", err)
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full overlay panel DOM tree and return the root element.
 * Structure:
 *
 *   #discord-reader-root
 *     .dr-header
 *       span  "Discord Reader"
 *       button  "✕"  (close)
 *     .dr-body
 *       .dr-guilds-pane
 *       .dr-channels-pane
 *       .dr-messages-pane
 *
 * @returns {HTMLDivElement}
 */
function _buildPanel() {
  // ── Root ──────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "discord-reader-root";
  // Start hidden; first toggle will remove the class
  root.classList.add("hidden");

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "dr-header";

  const title = document.createElement("span");
  title.className = "dr-title";
  title.textContent = "Discord Reader";

  const closeBtn = document.createElement("button");
  closeBtn.className = "dr-close-btn";
  closeBtn.setAttribute("aria-label", "Close Discord Reader");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    root.classList.add("hidden");
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // ── Body (three-column layout) ────────────────────────────────────────────
  const body = document.createElement("div");
  body.className = "dr-body";

  // Column 1 — Guilds
  const guildsPane = document.createElement("div");
  guildsPane.className = "dr-guilds-pane";
  guildsPane.id = "dr-guilds-pane";

  const guildsLabel = document.createElement("div");
  guildsLabel.className = "dr-pane-label";
  guildsLabel.textContent = "Guilds";
  guildsPane.appendChild(guildsLabel);

  const guildsList = document.createElement("ul");
  guildsList.className = "dr-list";
  guildsList.id = "dr-guilds-list";
  guildsPane.appendChild(guildsList);

  // Column 2 — Channels
  const channelsPane = document.createElement("div");
  channelsPane.className = "dr-channels-pane";
  channelsPane.id = "dr-channels-pane";

  const channelsLabel = document.createElement("div");
  channelsLabel.className = "dr-pane-label";
  channelsLabel.textContent = "Channels";
  channelsPane.appendChild(channelsLabel);

  const channelsList = document.createElement("ul");
  channelsList.className = "dr-list";
  channelsList.id = "dr-channels-list";
  channelsPane.appendChild(channelsList);

  // Column 3 — Messages / Status
  const messagesPane = document.createElement("div");
  messagesPane.className = "dr-messages-pane";
  messagesPane.id = "dr-messages-pane";

  const messagesLabel = document.createElement("div");
  messagesLabel.className = "dr-pane-label";
  messagesLabel.textContent = "Messages / Status";
  messagesPane.appendChild(messagesLabel);

  const statusArea = document.createElement("div");
  statusArea.className = "dr-status";
  statusArea.id = "dr-status";
  statusArea.textContent = "Idle — press Scrape to begin.";
  messagesPane.appendChild(statusArea);

  // "Scrape this channel" button — toggles between start and stop
  const scrapeBtn = document.createElement("button");
  scrapeBtn.className = "dr-scrape-btn";
  scrapeBtn.id = "dr-scrape-btn";
  scrapeBtn.textContent = "Scrape current channel";
  scrapeBtn.addEventListener("click", async () => {
    if (_scraping) {
      _scraping = false;
      ScrapeController.stop();
    } else {
      _scraping = true;
      await ScrapeController.start({ defaultDays: 7 });
      _scraping = false;
    }
  });
  messagesPane.appendChild(scrapeBtn);

  // Assemble body
  body.appendChild(guildsPane);
  body.appendChild(channelsPane);
  body.appendChild(messagesPane);

  // Assemble root
  root.appendChild(header);
  root.appendChild(body);

  return root;
}

// Expose for content/index.js (same script scope in the extension)
if (typeof module !== "undefined") {
  module.exports = { toggleOverlay };
}
