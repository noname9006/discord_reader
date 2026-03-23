/**
 * content/scroller.js
 *
 * ScrollController — drives the auto-scroll loop that walks Discord's chat
 * upward (toward older messages) in steps, scraping message batches along the
 * way.
 *
 * Usage:
 *   const sc = new ScrollController({
 *     onBatch(messages) { /* save them *\/ },
 *     onComplete()      { console.log("done"); },
 *     onError(err)      { console.error(err); },
 *     stopCondition(messages) { return messages.some(m => m.id === lastId); },
 *   });
 *   sc.start();
 *   // ... later ...
 *   sc.stop();
 */

/* global SELECTORS, scrapeVisibleMessages */

class ScrollController {
  /**
   * @param {object} options
   * @param {function(Array)} options.onBatch        — called with each scraped batch
   * @param {function()}      options.onComplete     — called when scrolling finishes
   * @param {function(Error)} options.onError        — called on unexpected error
   * @param {function(Array): boolean} options.stopCondition
   *   — return true to stop (e.g. reached the last saved message)
   * @param {number} [options.stepDelay=600]         — ms between scroll steps
   * @param {number} [options.scrollStepPx=800]      — pixels to scroll per step
   * @param {number} [options.maxSteps=2000]         — hard cap on total steps to prevent infinite loops
   */
  constructor({
    onBatch = () => {},
    onComplete = () => {},
    onError = () => {},
    stopCondition = () => false,
    stepDelay = 600,
    scrollStepPx = 800,
    maxSteps = 2000,
  } = {}) {
    this._onBatch = onBatch;
    this._onComplete = onComplete;
    this._onError = onError;
    this._stopCondition = stopCondition;
    this._stepDelay = stepDelay;
    this._baseStepDelay = stepDelay;
    this._scrollStepPx = scrollStepPx;
    this._maxSteps = maxSteps;

    this._running = false;
    this._timeoutId = null;
    this._stepCount = 0;
    this._prevBatchIds = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Begin auto-scrolling upward in the Discord chat container. */
  start() {
    if (this._running) return;
    this._running = true;
    this._stepCount = 0;
    this._prevBatchIds = null;
    this._stepDelay = this._baseStepDelay;
    this._step();
  }

  /** Stop the scroll loop at the next step boundary. */
  stop() {
    this._running = false;
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Execute one scroll step: scroll up, scrape, check stop condition, schedule
   * the next step (or finish).
   */
  async _step() {
    if (!this._running) return;

    try {
      const container = this._getScrollContainer();

      if (!container) {
        this._onError(
          new Error(
            "[Discord Reader] Scroll container not found. " +
              "Check SELECTORS.scrollContainer in discord_selectors.js."
          )
        );
        this.stop();
        return;
      }

      // Scroll upward by one step
      container.scrollTop -= this._scrollStepPx;

      // Also dispatch a wheel event so Discord's virtual list reacts
      container.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -this._scrollStepPx,
          bubbles: true,
          cancelable: true,
        })
      );

      // Give the DOM a moment to render newly loaded messages before scraping
      this._timeoutId = setTimeout(async () => {
        if (!this._running) return;

        try {
          const messages = scrapeVisibleMessages();
          await this._onBatch(messages);

          // Adaptive delay: back off on empty or stale batches
          // Use first+last ID as a lightweight staleness check
          const firstId = messages.length > 0 ? messages[0].id : '';
          const lastId = messages.length > 0 ? messages[messages.length - 1].id : '';
          const currentIds = firstId + '|' + lastId;
          if (messages.length === 0 || currentIds === this._prevBatchIds) {
            this._stepDelay = Math.min(this._stepDelay * 2, 3000);
          } else {
            this._stepDelay = this._baseStepDelay;
          }
          this._prevBatchIds = currentIds;

          // maxSteps guard — prevent infinite loop on stuck virtual scroll
          this._stepCount += 1;
          if (this._stepCount >= this._maxSteps) {
            this._running = false;
            this._onComplete();
            return;
          }

          // Check if we've reached the stop condition
          if (this._stopCondition(messages) || container.scrollTop <= 0) {
            this._running = false;
            this._onComplete();
            return;
          }

          // Schedule next step
          this._timeoutId = setTimeout(() => this._step(), this._stepDelay);
        } catch (err) {
          this._onError(err);
          this.stop();
        }
      }, this._stepDelay);
    } catch (err) {
      this._onError(err);
      this.stop();
    }
  }

  /**
   * Returns the Discord chat scroll container element, trying primary then
   * fallback selector.
   *
   * @returns {Element|null}
   */
  _getScrollContainer() {
    return (
      document.querySelector(SELECTORS.scrollContainer) ||
      document.querySelector(SELECTORS.scrollContainerFallback) ||
      null
    );
  }
}

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { ScrollController };
}
