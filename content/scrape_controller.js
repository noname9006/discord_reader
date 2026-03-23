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

/* global getCurrentContext, ScrollController, DB, renderStatus, setScrapeButtonState, NavController */

const ScrapeController = (() => {
  /** @type {ScrollController|null} */
  let _scroller = null;

  /** Resolves the Promise returned by start() when the scrape ends. */
  let _resolveStart = null;

  /** Prevents double-teardown if stop() is called while onComplete/onError fires. */
  let _isStopped = false;

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
    if (guildId) {
      await DB.saveGuild({ id: guildId, name: guildName });
    } else {
      console.warn("[Discord Reader] No guildId (DM context) — skipping saveGuild.");
    }
    await DB.saveChannel({ id: channelId, guildId, name: channelName });

    // ── 4. Determine cutoff timestamp ─────────────────────────────────────────
    const lastTimestamp = await DB.getLastMessageTimestamp(channelId);
    let cutoff;
    let isIncremental;
    if (lastTimestamp) {
      // Incremental run: stop when we reach a message we've already saved
      cutoff = lastTimestamp;
      isIncremental = true;
    } else {
      // First run: go back defaultDays days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - defaultDays);
      cutoff = cutoffDate.toISOString();
      isIncremental = false;
    }

    // ── 5. Tracking state ─────────────────────────────────────────────────────
    let totalSaved = 0;
    const seenIds = new Set();
    _isStopped = false;

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
          if (_isStopped) return;
          const newMessages = messages.filter(
            (m) => m && m.id && m.timestamp && !seenIds.has(m.id)
          );

          if (newMessages.length > 0) {
            try {
              await DB.saveMessages(newMessages);
              totalSaved += newMessages.length;
              renderStatus(isIncremental ? `Catching up… ${totalSaved} new messages` : `Scraping… ${totalSaved} messages saved`);
              for (const m of newMessages) {
                seenIds.add(m.id);
              }
            } catch (err) {
              console.error("[Discord Reader] DB save error:", err);
              renderStatus("⚠ DB write error — some messages may not have been saved.");
            }
          }
        },

        onComplete: () => {
          if (_isStopped) return;
          if (isIncremental) {
            renderStatus(
              totalSaved === 0
                ? `#${channelName} is up to date.`
                : `Caught up — ${totalSaved} new messages saved for #${channelName}`
            );
          } else {
            renderStatus(`Done — ${totalSaved} messages saved for #${channelName}`);
          }
          _teardown();
          NavController.refreshChannels().catch(err =>
            console.error("[Discord Reader] NavController refresh error:", err)
          );
        },

        onError: (err) => {
          if (_isStopped) return;
          console.error("[Discord Reader] Scrape error:", err);
          renderStatus(`Error: ${err.message}`);
          _teardown();
        },

        stopCondition: (messages) =>
          messages.some((m) => m.timestamp && m.timestamp <= cutoff),
      });

      // ── 8-9. Update UI and start ────────────────────────────────────────────
      setScrapeButtonState(true);
      renderStatus(
        isIncremental
          ? `Catching up #${channelName}…`
          : `Scraping #${channelName} (last ${defaultDays} days)…`
      );
      _scroller.start();
    });
  }

  /**
   * Stop an in-progress scrape.
   * Resolves the Promise returned by start() so the caller can reset its state.
   */
  function stop() {
    _isStopped = true;
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

  /**
   * Returns true if a scrape is currently in progress.
   * @returns {boolean}
   */
  function isRunning() {
    return _scroller !== null;
  }

  return { start, stop, isRunning };
})();

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { ScrapeController };
}
