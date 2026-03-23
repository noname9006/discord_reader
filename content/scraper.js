/**
 * content/scraper.js
 *
 * Reads the currently visible Discord messages from the DOM and returns them
 * as plain JS objects. Also provides getCurrentContext() to identify which
 * guild and channel are currently in view.
 *
 * All selector lookups go through discord_selectors.js — if Discord updates
 * its markup, only that file should need changes.
 */

// discord_selectors.js is loaded in the same content-script scope by index.js
/* global SELECTORS */

/**
 * Extracts a channelId and guildId from the current page URL.
 * Discord URLs follow the pattern: /channels/<guildId>/<channelId>
 *
 * @returns {{ guildId: string|null, channelId: string|null }}
 */
function _getIdsFromUrl() {
  const match = window.location.pathname.match(
    /\/channels\/(\d+|@me)\/(\d+)/
  );
  return {
    guildId: match ? match[1] : null,
    channelId: match ? match[2] : null,
  };
}

/**
 * Safely read the text content of the first element matching a selector.
 * Falls back to an empty string so callers don't have to null-check.
 *
 * @param {string} selector  CSS selector
 * @param {Element} [root]   Optional root to search within
 * @returns {string}
 */
function _text(selector, root = document) {
  const el = root.querySelector(selector);
  return el ? (el.textContent || el.innerText || "").trim() : "";
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current guild name, channel name, guildId, and channelId.
 * IDs are read from the URL (most reliable); names are read from the DOM.
 *
 * @returns {{ guildName: string, channelName: string,
 *             guildId: string|null, channelId: string|null }}
 */
function getCurrentContext() {
  const { guildId, channelId } = _getIdsFromUrl();

  // Channel name: try the channel header first, then fall back
  const channelName =
    _text(SELECTORS.channelHeader) ||
    _text(SELECTORS.channelHeaderFallback);

  // Guild name: the active (selected) guild item's aria-label
  // ⚠️ FRAGILE: relies on the presence of aria-selected or a visual indicator
  const selectedGuild = document.querySelector(
    '[data-list-item-id^="guildsnav"][aria-selected="true"] [aria-label]'
  );
  const guildName = selectedGuild
    ? (selectedGuild.getAttribute("aria-label") || "").trim()
    : "";

  return { guildName, channelName, guildId, channelId };
}

/**
 * Reads all currently visible message articles from the Discord DOM and
 * returns them as an array of message objects.
 *
 * Fields returned per message:
 *   id          — Discord's internal message ID (from the li element id attr)
 *   authorName  — Display name of the message author
 *   content     — Plain text message body
 *   timestamp   — ISO 8601 datetime string from the <time> element
 *   channelId   — From the current URL
 *   guildId     — From the current URL
 *
 * @returns {Array<{id: string, authorName: string, content: string,
 *                  timestamp: string, channelId: string|null,
 *                  guildId: string|null}>}
 */
function scrapeVisibleMessages() {
  const { guildId, channelId } = _getIdsFromUrl();

  // Try primary selector, fall back to ARIA role
  const articleSelector =
    SELECTORS.messageArticle + ", " + SELECTORS.messageArticleFallback;

  const articles = Array.from(document.querySelectorAll(articleSelector));

  const messages = [];

  for (const article of articles) {
    // ── Extract message ID ──────────────────────────────────────────────────
    // li id format: "chat-messages-<channelId>-<messageId>"
    const rawId = article.id || "";
    const idParts = rawId.split("-");
    const id = idParts.length > 0 ? idParts[idParts.length - 1] : rawId;

    if (!id) continue; // skip malformed elements

    // ── Extract author ──────────────────────────────────────────────────────
    // Author is in the message group header; grouped messages share an author.
    // Walk up to find the nearest author, which may be in a preceding sibling.
    let authorName = _text(SELECTORS.messageAuthor, article);
    if (!authorName) {
      // ⚠️ Grouped messages don't repeat the author. Walk backward through
      // siblings to find the last message that had one (cap at 10 to avoid O(n)).
      let prev = article.previousElementSibling;
      let walkback = 0;
      while (prev && !authorName && walkback < 10) {
        authorName = _text(SELECTORS.messageAuthor, prev);
        prev = prev.previousElementSibling;
        walkback++;
      }
    }
    if (!authorName) {
      // Last resort: structural fallback ⚠️
      authorName = _text(SELECTORS.messageAuthorFallback, article);
    }

    // ── Extract content ─────────────────────────────────────────────────────
    let content = _text(SELECTORS.messageContent, article);
    if (!content) {
      content = _text(SELECTORS.messageContentFallback, article);
    }

    // ── Extract timestamp ────────────────────────────────────────────────────
    const timeEl = article.querySelector(SELECTORS.messageTimestamp);
    const timestamp = timeEl ? timeEl.getAttribute("datetime") || "" : "";

    messages.push({
      id,
      authorName,
      content,
      timestamp,
      channelId,
      guildId,
    });
  }

  return messages;
}

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { scrapeVisibleMessages, getCurrentContext };
}
