/**
 * content/health_check.js
 *
 * Health check module — tests every selector in discord_selectors.js against
 * the live Discord DOM and returns a status per selector.
 *
 * Depends on: SELECTORS (from content/discord_selectors.js, loaded first)
 */

/* global SELECTORS */

const HealthCheck = (() => {
  /**
   * Run all selectors against the live DOM and return results.
   * @returns {Array<{key: string, selector: string, status: 'ok'|'warn'|'fail', count: number}>}
   *   key      — SELECTORS key name (e.g. "guildItem")
   *   selector — the actual CSS selector string
   *   status   — 'ok' (≥1 match on primary key), 'warn' (fallback key matched),
   *              'fail' (0 matches)
   *   count    — number of matching elements found
   */
  function run() {
    const results = [];

    for (const key of Object.keys(SELECTORS)) {
      const selector = SELECTORS[key];
      let count = 0;
      try {
        count = document.querySelectorAll(selector).length;
      } catch (err) {
        console.warn("[Discord Reader] HealthCheck: invalid selector '" + selector + "':", err);
        count = 0;
      }

      const isFallback = key.endsWith("Fallback");
      let status;
      if (count > 0) {
        status = isFallback ? "warn" : "ok";
      } else {
        status = "fail";
      }

      results.push({ key, selector, status, count });
    }

    // Sort: fail first, then warn, then ok
    const order = { fail: 0, warn: 1, ok: 2 };
    results.sort((a, b) => order[a.status] - order[b.status]);

    return results;
  }

  return { run };
})();

if (typeof module !== "undefined") {
  module.exports = { HealthCheck };
}
