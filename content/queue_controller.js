/**
 * content/queue_controller.js
 *
 * QueueController — iterates over an array of channels sequentially,
 * navigating to each one and running a full ScrapeController scrape before
 * moving on.  Supports mid-queue stop via QueueController.stop().
 */

/* global ScrapeController, NavController, renderStatus, setQueueButtonState, setSelectedScrapeButtonEnabled, DB */

const QueueController = (() => {
  let _running = false;
  let _stopRequested = false;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start scraping a list of channels sequentially.
   *
   * @param {Array<{id: string, name: string, guildId: string}>} channels
   * @param {'selected'|'all'} mode  — which button triggered the queue
   */
  async function startQueue(channels, mode) {
    if (_running) return;
    if (!channels || channels.length === 0) return;

    _running = true;
    _stopRequested = false;
    const total = channels.length;

    setQueueButtonState(true, mode || 'all');
    await DB.init();

    for (let i = 0; i < total; i++) {
      if (_stopRequested) break;

      const ch = channels[i];
      const channelName = ch.name || ch.id;

      try {
        NavController.navigateToChannel(ch.id);
        await _delay(1200);

        if (_stopRequested) break;

        const lastTs = await DB.getLastMessageTimestamp(ch.id);
        const isIncremental = !!lastTs;

        renderStatus(
          isIncremental
            ? `Queue ${i + 1}/${total}: catching up #${channelName}…`
            : `Queue ${i + 1}/${total}: first scrape of #${channelName}…`
        );

        await ScrapeController.start({ defaultDays: 7 });

        await NavController.refreshChannels();

        renderStatus(
          isIncremental
            ? `Queue: caught up ${i + 1}/${total} — #${channelName}`
            : `Queue: scraped ${i + 1}/${total} — #${channelName}`
        );
      } catch (err) {
        console.error(`[Discord Reader] Queue error on #${channelName}:`, err);
        renderStatus(`⚠ Queue: error on #${channelName} — continuing`);
      }
    }

    if (_stopRequested) {
      renderStatus('Queue stopped.');
    } else {
      renderStatus(`Queue complete — scraped ${total} channels.`);
      NavController.refreshChannels().catch(err =>
        console.error('[Discord Reader] Queue post-refresh error:', err)
      );
    }

    _teardown();
  }

  /**
   * Stop the queue mid-run.  Also stops any in-progress channel scrape.
   */
  function stop() {
    _stopRequested = true;
    if (ScrapeController.isRunning()) {
      ScrapeController.stop();
    }
  }

  /**
   * @returns {boolean} true while the queue loop is active
   */
  function isRunning() {
    return _running;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function _teardown() {
    _running = false;
    _stopRequested = false;
    setQueueButtonState(false, null);
    // Restore correct enabled state: only enable "Scrape selected" if channels are checked
    setSelectedScrapeButtonEnabled(NavController.getSelectedChannels().length > 0);
  }

  return { startQueue, stop, isRunning };
})();

if (typeof module !== 'undefined') {
  module.exports = { QueueController };
}
