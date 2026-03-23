/**
 * ui/health_panel.js
 *
 * Renders HealthCheck results into the #dr-health-pane DOM element.
 * Called from overlay.js when the health tab is shown.
 *
 * Depends on: HealthCheck (from content/health_check.js, loaded first)
 */

/* global HealthCheck */

/**
 * Run the health check and render results into #dr-health-list.
 * Shows a summary line at the top (e.g. "14 OK · 2 WARN · 1 FAIL").
 */
function runAndRenderHealthCheck() {
  const pane = document.getElementById("dr-health-pane");
  if (!pane) return;

  const list = document.getElementById("dr-health-list");
  if (!list) return;

  const summary = document.getElementById("dr-health-summary");

  // Clear previous results
  list.innerHTML = "";

  const results = HealthCheck.run();

  // Summary counts
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.status]++;

  if (summary) {
    summary.textContent =
      counts.ok + " OK · " + counts.warn + " WARN · " + counts.fail + " FAIL";
    summary.className =
      "dr-health-summary " +
      (counts.fail > 0
        ? "dr-health-fail"
        : counts.warn > 0
        ? "dr-health-warn"
        : "dr-health-ok");
  }

  // Render rows (use createElement/appendChild, never innerHTML)
  for (const result of results) {
    const row = document.createElement("li");
    row.className = "dr-health-row dr-health-row--" + result.status;

    const dot = document.createElement("span");
    dot.className = "dr-health-dot";
    dot.textContent = "●";

    const keySpan = document.createElement("span");
    keySpan.className = "dr-health-key";
    keySpan.textContent = result.key;

    const countSpan = document.createElement("span");
    countSpan.className = "dr-health-count";
    countSpan.textContent = "(" + result.count + ")";

    row.appendChild(dot);
    row.appendChild(keySpan);
    row.appendChild(countSpan);
    list.appendChild(row);
  }
}

if (typeof module !== "undefined") {
  module.exports = { runAndRenderHealthCheck };
}
