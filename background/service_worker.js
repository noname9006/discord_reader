/**
 * background/service_worker.js
 *
 * MV3 background service worker for Discord Reader.
 * Listens for the "toggle-overlay" command (Alt+D) registered in manifest.json
 * and relays a message to the active Discord tab's content script.
 */

// Listen for keyboard commands defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-overlay") return;

  try {
    // Find the currently active tab in the focused window
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id) {
      console.warn("[Discord Reader] No active tab found for toggle-overlay.");
      return;
    }

    // Send the toggle message to the content script running in that tab
    await chrome.tabs.sendMessage(activeTab.id, { action: "toggle-overlay" });
  } catch (err) {
    // Common cause: content script not yet injected (navigated away, etc.)
    console.error("[Discord Reader] Failed to send toggle-overlay message:", err);
  }
});
