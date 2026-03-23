/**
 * ui/panel.js
 *
 * UI rendering helpers for the Discord Reader overlay panel.
 * These functions update the DOM elements already created by overlay.js.
 *
 * Phase 1 — list items log to console when clicked.
 * Phases 3–4 will wire them to scraper/scroller/db logic.
 *
 * Exports: renderGuilds(guilds), renderChannels(channels), renderStatus(text)
 */

/**
 * Render a list of guild objects into the guilds pane.
 *
 * @param {Array<{id: string, name: string}>} guilds
 */
function renderGuilds(guilds) {
  const list = document.getElementById("dr-guilds-list");
  if (!list) return;

  list.innerHTML = "";

  if (!guilds || guilds.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No guilds";
    empty.style.fontStyle = "italic";
    empty.style.color = "#72767d";
    list.appendChild(empty);
    return;
  }

  for (const guild of guilds) {
    const item = document.createElement("li");
    item.textContent = guild.name || guild.id;
    item.dataset.guildId = guild.id;

    item.addEventListener("click", () => {
      // Highlight active item
      list.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      // Navigation handled by NavController (nav_controller.js)
    });

    list.appendChild(item);
  }
}

/**
 * Render a list of channel objects into the channels pane.
 *
 * @param {Array<{id: string, guildId: string, name: string}>} channels
 */
function renderChannels(channels) {
  const list = document.getElementById("dr-channels-list");
  if (!list) return;

  list.innerHTML = "";

  if (!channels || channels.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No channels";
    empty.style.fontStyle = "italic";
    empty.style.color = "#72767d";
    list.appendChild(empty);
    return;
  }

  for (const channel of channels) {
    const item = document.createElement("li");
    item.textContent = (channel.name ? "# " + channel.name : channel.id);
    item.dataset.channelId = channel.id;

    if (channel.count !== undefined) {
      const badge = document.createElement("span");
      badge.className = "dr-msg-count";
      badge.textContent = "(" + channel.count + ")";
      item.appendChild(badge);
    }

    item.addEventListener("click", () => {
      // Highlight active item
      list.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      // Navigation handled by NavController (nav_controller.js)
    });

    list.appendChild(item);
  }
}

/**
 * Update the status area in the messages pane with a text message.
 * E.g. "Scraping… 120 messages saved" or "Done — 348 messages total."
 *
 * @param {string} text
 */
function renderStatus(text) {
  const status = document.getElementById("dr-status");
  if (!status) return;
  status.textContent = text || "";
}

/**
 * Update the scrape button's appearance and disabled state to reflect whether
 * a scrape is currently running.
 * The button stays enabled in both states so the user can click it to stop a
 * running scrape.
 *
 * @param {boolean} scraping  true = scrape in progress; false = idle
 */
function setScrapeButtonState(scraping) {
  const btn = document.getElementById("dr-scrape-btn");
  if (!btn) return;
  if (scraping) {
    btn.disabled = false;
    btn.textContent = "⏹ Stop scraping";
  } else {
    btn.disabled = false;
    btn.textContent = "Scrape current channel";
  }
}

/** Maximum number of characters to show in a message preview. */
var MSG_PREVIEW_MAX = 120;

/**
 * Render the initial page of saved messages into the messages viewer.
 * Replaces any existing content in #dr-msg-list.
 *
 * @param {Array<{id, authorName, content, timestamp}>} messages  newest-first
 * @param {boolean} hasMore  whether there are more pages to load
 */
function renderMessageViewer(messages, hasMore) {
  const list = document.getElementById('dr-msg-list');
  if (!list) return;

  list.innerHTML = '';

  if (!messages || messages.length === 0) {
    const empty = document.createElement('li');
    const emptySpan = document.createElement('span');
    emptySpan.style.fontStyle = 'italic';
    emptySpan.style.color = '#72767d';
    emptySpan.textContent = 'No saved messages for this channel.';
    empty.appendChild(emptySpan);
    list.appendChild(empty);
    return;
  }

  for (const msg of messages) {
    list.appendChild(_buildMessageRow(msg));
  }

  _updateLoadMoreBtn(list, hasMore);
}

/**
 * Append more messages to the existing list (for "Load more").
 *
 * @param {Array} messages
 * @param {boolean} hasMore
 */
function appendMessages(messages, hasMore) {
  const list = document.getElementById('dr-msg-list');
  if (!list) return;

  // Remove existing load-more item before appending
  const existing = document.getElementById('dr-load-more-btn');
  if (existing) {
    const item = existing.closest('li');
    if (item) item.remove();
  }

  for (const msg of messages) {
    list.appendChild(_buildMessageRow(msg));
  }

  _updateLoadMoreBtn(list, hasMore);
}

/**
 * Build a single <li> message row element.
 * @param {{id, authorName, content, timestamp}} msg
 * @returns {HTMLLIElement}
 */
function _buildMessageRow(msg) {
  const li = document.createElement('li');

  const meta = document.createElement('span');
  meta.className = 'dr-msg-meta';
  const ts = msg.timestamp ? msg.timestamp.slice(0, 16).replace('T', ' ') : '';
  meta.textContent = ts + (ts && msg.authorName ? ' ' : '') + (msg.authorName || '');
  li.appendChild(meta);

  const body = document.createElement('span');
  body.className = 'dr-msg-body';
  const fullText = msg.content || '';
  if (fullText.length > MSG_PREVIEW_MAX) {
    body.textContent = fullText.slice(0, MSG_PREVIEW_MAX) + '\u2026';
    body.title = fullText;
  } else {
    body.textContent = fullText;
  }
  li.appendChild(body);

  return li;
}

/**
 * Add or remove the "Load more" button at the bottom of the list.
 * @param {HTMLUListElement} list
 * @param {boolean} hasMore
 */
function _updateLoadMoreBtn(list, hasMore) {
  const existing = document.getElementById('dr-load-more-btn');
  if (existing) {
    const item = existing.closest('li');
    if (item) item.remove();
  }
  if (hasMore) {
    const li = document.createElement('li');
    li.className = 'dr-load-more-item';
    const btn = document.createElement('button');
    btn.id = 'dr-load-more-btn';
    btn.className = 'dr-load-more-btn';
    btn.textContent = 'Load more';
    li.appendChild(btn);
    list.appendChild(li);
  }
}

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { renderGuilds, renderChannels, renderStatus, setScrapeButtonState, renderMessageViewer, appendMessages };
}
