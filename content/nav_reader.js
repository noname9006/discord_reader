/**
 * content/nav_reader.js
 *
 * Reads guild and channel data from Discord's live sidebar DOM.
 * Used by overlay.js to populate the Guilds and Channels panes.
 */

/* global SELECTORS */

/**
 * Read all guilds currently rendered in Discord's guild navigation sidebar.
 *
 * Discord renders guild icons as elements matching SELECTORS.guildItem.
 * Each has an aria-label on a child element (the server name) and encodes
 * the guild ID in the data-list-item-id attribute as "guildsnav___<guildId>".
 *
 * @returns {Array<{id: string, name: string, element: Element}>}
 *   id      — guild snowflake ID extracted from data-list-item-id
 *   name    — guild name from aria-label
 *   element — the DOM element to click for navigation
 */
function readGuilds() {
  let nodeList = document.querySelectorAll(SELECTORS.guildItem);
  if (nodeList.length === 0) {
    nodeList = document.querySelectorAll(SELECTORS.guildItemFallback);
  }
  const items = Array.from(nodeList);

  const guilds = [];
  for (const item of items) {
    // Extract guild ID from data-list-item-id="guildsnav___<guildId>"
    const rawId = item.getAttribute('data-list-item-id') || '';
    const id = rawId.replace(/^guildsnav___/, '');
    if (!id || id === rawId) continue; // skip non-guild items (home, discover, etc.)
    if (!/^\d+$/.test(id)) continue;  // skip non-numeric IDs

    // Get name from aria-label on the clickable child
    const labelEl = item.querySelector('[aria-label]');
    const name = labelEl ? (labelEl.getAttribute('aria-label') || '').trim() : id;
    if (!name) continue;

    guilds.push({ id, name, element: item });
  }
  return guilds;
}

/**
 * Read all text channels currently rendered in Discord's channel list sidebar.
 *
 * Only includes channels that are navigable text channels (have an href
 * matching /channels/<guildId>/<channelId>).
 * Voice channels, categories, and separators are excluded.
 *
 * @param {string} [guildId] — optional filter; only return channels for this guild
 * @returns {Array<{id: string, guildId: string, name: string, element: Element}>}
 */
function readChannels(guildId) {
  // Strategy: find all channel list items, then filter to navigable text channels
  const items = Array.from(
    document.querySelectorAll(SELECTORS.channelItem)
  );

  // Fallback: find anchor elements with /channels/ href
  const anchors = items.length > 0
    ? items
    : Array.from(document.querySelectorAll(SELECTORS.channelItemFallback));

  const channels = [];
  const seen = new Set();

  for (const item of anchors) {
    // Find the anchor tag (may be the item itself or a child)
    const anchor = item.tagName === 'A' ? item : item.querySelector('a[href*="/channels/"]');
    if (!anchor) continue;

    const href = anchor.getAttribute('href') || '';
    const match = href.match(/\/channels\/(\d+|@me)\/(\d+)/);
    if (!match) continue;

    const itemGuildId = match[1];
    const channelId = match[2];

    // Apply guild filter if provided
    if (guildId && itemGuildId !== guildId) continue;
    if (seen.has(channelId)) continue;
    seen.add(channelId);

    // Get channel name from aria-label or text content
    const name = (
      anchor.getAttribute('aria-label') ||
      item.getAttribute('aria-label') ||
      anchor.textContent ||
      ''
    ).trim().replace(/^#\s*/, ''); // strip leading "# " if present

    channels.push({
      id: channelId,
      guildId: itemGuildId,
      name,
      element: anchor, // clicking this anchor navigates Discord
    });
  }

  return channels;
}

/**
 * Determine which guild is currently active (selected) in Discord's sidebar.
 * Returns the guild ID string, or null.
 *
 * @returns {string|null}
 */
function getActiveGuildId() {
  // Use the URL as the most reliable source
  const match = window.location.pathname.match(/\/channels\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Determine which channel is currently active.
 * Returns the channel ID string, or null.
 *
 * @returns {string|null}
 */
function getActiveChannelId() {
  const match = window.location.pathname.match(/\/channels\/(?:\d+|@me)\/(\d+)/);
  return match ? match[1] : null;
}

// Expose as globals (no module system in content scripts)
if (typeof module !== 'undefined') {
  module.exports = { readGuilds, readChannels, getActiveGuildId, getActiveChannelId };
}
