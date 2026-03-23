/**
 * content/discord_selectors.js
 *
 * Single source of truth for all Discord DOM selectors used across the
 * extension. When Discord deploys a frontend update and selectors break,
 * THIS FILE IS THE ONLY PLACE THAT NEEDS TO BE UPDATED.
 *
 * Selector strategy (in priority order):
 *   1. data-* attributes  — most stable; Discord exposes some intentionally
 *   2. ARIA roles/labels  — semantic and relatively stable across redesigns
 *   3. Structural position — last resort; most fragile, noted with ⚠️ comment
 */

const SELECTORS = {
  // ── Guild / Server list ──────────────────────────────────────────────────
  // Each server icon in the left sidebar. Discord exposes a data-list-item-id
  // on the wrapper and aria-label on the button itself.
  guildItem: '[data-list-item-id^="guildsnav"]',          // data-* preferred
  guildItemFallback: 'nav[aria-label="Servers"] li',      // ARIA nav fallback

  // ── Channel list ──────────────────────────────────────────────────────────
  // Channels appear in a scrollable list. They carry data-list-item-id
  // prefixed with "channels" and have aria-label on the inner link.
  channelItem: '[data-list-item-id^="channels"]',         // data-* preferred
  channelItemFallback: '[role="listitem"] a[href*="/channels/"]', // ARIA+href

  // ── Chat / Message container ──────────────────────────────────────────────
  // The outer scrollable div that contains all message groups.
  // ⚠️ FRAGILE: Discord may change the ol's aria-label text.
  messageContainer: 'ol[data-list-id="chat-messages"]',   // data-* preferred
  messageContainerFallback: '[class*="messagesWrapper"] ol', // structural ⚠️

  // ── Individual message articles ───────────────────────────────────────────
  // Each message is wrapped in an <li> containing a role="article" element.
  messageArticle: 'li[id^="chat-messages-"]',             // id prefix (stable)
  messageArticleFallback: '[role="article"]',             // ARIA fallback

  // ── Message author ────────────────────────────────────────────────────────
  // The author span inside a message group header. Carries a data attribute in
  // newer Discord builds; aria-roleDescription used as a secondary hint.
  messageAuthor: '[id^="message-username-"]',             // id prefix (stable)
  messageAuthorFallback: 'span[class*="username"]',       // structural ⚠️

  // ── Message content ───────────────────────────────────────────────────────
  // The text content div. id pattern is stable across Discord versions.
  messageContent: '[id^="message-content-"]',             // id prefix (stable)
  messageContentFallback: 'div[class*="messageContent"]', // structural ⚠️

  // ── Message timestamp ─────────────────────────────────────────────────────
  // The <time> element always carries a datetime attribute with the ISO string.
  messageTimestamp: 'time[datetime]',                     // semantic element

  // ── Main chat scroll container ────────────────────────────────────────────
  // The scrollable element that scroller.js manipulates to load older messages.
  // ⚠️ FRAGILE: class-based selector; monitor after Discord updates.
  scrollContainer: '[class*="scroller"][class*="auto"]',  // structural ⚠️
  scrollContainerFallback: 'ol[data-list-id="chat-messages"]', // data-* fallback

  // ── Current guild / channel (for context reading) ─────────────────────────
  // The header area showing the currently viewed channel name.
  channelHeader: 'h1[class*="title"]',                    // structural ⚠️
  channelHeaderFallback: '[class*="headerText"] h1',      // structural ⚠️

  // The currently selected guild name (tooltip / aria-label on the icon button)
  guildName: '[data-list-item-id^="guildsnav"] [aria-label]', // data-* + ARIA
};

// Export for use by scraper.js, scroller.js, overlay.js
// (content scripts share scope when loaded sequentially, but export for clarity)
if (typeof module !== "undefined") {
  module.exports = { SELECTORS };
}
