/**
 * content/exporter.js
 *
 * Utilities for exporting saved messages to a downloadable file.
 * Triggered from the overlay panel.
 *
 * Depends on: DB (storage/db.js), getCurrentContext (content/scraper.js)
 */

/* global DB, getCurrentContext, renderStatus */

/**
 * Export messages for the current channel as JSON or CSV.
 * Triggers a file download in the browser.
 *
 * @param {'json'|'csv'} format
 * @returns {Promise<void>}
 */
async function exportCurrentChannel(format) {
  await DB.init();
  const { channelId, channelName } = getCurrentContext();
  if (!channelId) {
    renderStatus('No channel active — cannot export.');
    return;
  }

  const messages = await DB.getMessagesByChannel(channelId);
  if (!messages || messages.length === 0) {
    renderStatus('No saved messages to export for this channel.');
    return;
  }

  const filename = `discord-reader-${channelName || channelId}-${_dateStamp()}`;

  if (format === 'csv') {
    const csv = _toCsv(messages);
    _triggerDownload(csv, filename + '.csv', 'text/csv');
  } else {
    const json = JSON.stringify(messages, null, 2);
    _triggerDownload(json, filename + '.json', 'application/json');
  }

  renderStatus(`Exported ${messages.length} messages as ${format.toUpperCase()}.`);
}

/**
 * Convert messages array to CSV string.
 * Columns: id, authorName, timestamp, content
 * Values are quoted and internal quotes are escaped.
 *
 * @param {Array} messages
 * @returns {string}
 */
function _toCsv(messages) {
  const header = ['id', 'authorName', 'timestamp', 'content'];
  const escape = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = messages.map(m => [m.id, m.authorName, m.timestamp, m.content].map(escape).join(','));
  return [header.join(','), ...rows].join('\r\n');
}

/**
 * Trigger a browser file download using a Blob URL.
 * The anchor is created, clicked, and immediately revoked.
 *
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function _triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns a compact date stamp string like "2026-03-23".
 * @returns {string}
 */
function _dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

if (typeof module !== 'undefined') {
  module.exports = { exportCurrentChannel };
}
