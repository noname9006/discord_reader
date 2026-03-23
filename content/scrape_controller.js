/**
 * content/scrape_controller.js
 *
 * ScrapeController — orchestrates the full scrape flow.
 * Connects scraper + scroller + DB + UI into a single start/stop API.
 *
 * Depends on (all loaded in the same content-script scope):
 *   getCurrentContext()    — content/scraper.js
 *   ScrollController       — content/scroller.js
 *   DB                     — storage/db.js
 *   renderStatus()         — ui/panel.js
 *   setScrapeButtonState() — ui/panel.js
 */

/* global getCurrentContext, ScrollController, DB, renderStatus, setScrapeButtonState */

const ScrapeController = (() => {
  /** @type {ScrollController|null} */
  let _scroller = null;

  /** Resolves the Promise returned by start() when the scrape ends. */
  let _resolveStart = null;

  /**
   * Start a scrape of the currently visible channel.
   * Returns a Promise that resolves when the scrape completes, errors, or is
   * stopped via stop().
   *
   * @param {{ defaultDays?: number }} [options]
   * @returns {Promise<void>}
   */
  async function start({ defaultDays = 7 } = {}) {
    // ── 1. Get context ────────────────────────────────────────────────────────
    const { guildId, channelId, guildName, channelName } = getCurrentContext();

    if (!channelId) {
      renderStatus("Error: could not detect the current channel.");
      return;
    }

    // ── 2. Init DB ────────────────────────────────────────────────────────────
    await DB.init();

    // ── 3. Save guild + channel ───────────────────────────────────────────────
    await DB.saveGuild({ id: guildId, name: guildName });
    await DB.saveChannel({ id: channelId, guildId, name: channelName });

    // ── 4. Determine cutoff timestamp ─────────────────────────────────────────
    const lastTimestamp = await DB.getLastMessageTimestamp(channelId);
    let cutoff;
    if (lastTimestamp) {
      // Incremental run: stop when we reach a message we've already saved
      cutoff = lastTimestamp;
    } else {
      // First run: go back defaultDays days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - defaultDays);
      cutoff = cutoffDate.toISOString();
    }

    // ── 5. Tracking state ─────────────────────────────────────────────────────
    let totalSaved = 0;
    const seenIds = new Set();

    // ── 6. Teardown — called on complete, error, or manual stop ──────────────
    function _teardown() {
      _scroller = null;
      setScrapeButtonState(false);
      if (_resolveStart) {
        const resolve = _resolveStart;
        _resolveStart = null;
        resolve();
      }
    }

    // ── 7. Build ScrollController, wrapped in a Promise ───────────────────────
    return new Promise((resolve) => {
      _resolveStart = resolve;

      _scroller = new ScrollController({
        onBatch: async (messages) => {
          const newMessages = messages.filter(
            (m) => m && m.id && m.timestamp && !seenIds.has(m.id)
          );

          if (newMessages.length > 0) {
            try {
              await DB.saveMessages(newMessages);
              totalSaved += newMessages.length;
              renderStatus(`Scraping… ${totalSaved} messages saved`);
              for (const m of newMessages) {
                seenIds.add(m.id);
              }
            } catch (err) {
              console.error("[Discord Reader] DB save error:", err);
            }
          }
        },

        onComplete: () => {
          renderStatus(`Done — ${totalSaved} messages saved for #${channelName}`);
          _teardown();
        },

        onError: (err) => {
          console.error("[Discord Reader] Scrape error:", err);
          renderStatus(`Error: ${err.message}`);
          _teardown();
        },

        stopCondition: (messages) =>
          messages.some((m) => m.timestamp && m.timestamp <= cutoff),
      });

      // ── 8-9. Update UI and start ────────────────────────────────────────────
      setScrapeButtonState(true);
      renderStatus(`Starting scrape for #${channelName}…`);
      _scroller.start();
    });
  }

  /**
   * Stop an in-progress scrape.
   * Resolves the Promise returned by start() so the caller can reset its state.
   */
  function stop() {
    if (_scroller) {
      _scroller.stop();
      _scroller = null;
    }
    setScrapeButtonState(false);
    if (_resolveStart) {
      const resolve = _resolveStart;
      _resolveStart = null;
      resolve();
    }
  }

  return { start, stop };
})();

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { ScrapeController };
}
