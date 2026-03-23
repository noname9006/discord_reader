/**
 * content/index.js
 *
 * Entry point injected into every Discord tab (https://discord.com/*).
 * Loaded at document_idle as defined in manifest.json.
 *
 * Responsibilities:
 *   1. Receive "toggle-overlay" messages from the background service worker
 *      (triggered by the Alt+D command via chrome.commands) and call
 *      toggleOverlay().
 *   2. Provide a keyboard-shortcut fallback directly on the page so the
 *      overlay can still be toggled if the background command path fails
 *      (e.g. the extension hasn't claimed focus from the browser).
 *
 * Other content scripts (overlay.js, scraper.js, etc.) are injected by the
 * browser before this file runs because they are listed first in manifest.json
 * under content_scripts[].js — or they will be in future phases.
 * For Phase 1 only overlay.js matters.
 */

/* global toggleOverlay */

// ── 1. Background → content message bridge ───────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "toggle-overlay") {
    toggleOverlay();
    sendResponse({ ok: true });
  }
  // Return false — we handle sendResponse synchronously
  return false;
});

// ── 2. Keyboard shortcut fallback (Alt+D) ────────────────────────────────────
// chrome.commands fires Alt+D at the browser level, but focus rules can
// sometimes prevent the background worker from receiving it.  This keydown
// listener on the Discord page acts as a backup.

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "d") {
    // Avoid interfering with Discord's own shortcuts
    event.stopPropagation();
    toggleOverlay();
  }
});

console.log("[Discord Reader] Content script loaded.");
