/**
 * storage/db.js
 *
 * IndexedDB wrapper for Discord Reader.
 * Provides a simple async API over the three object stores:
 *   guilds    — { id, name, savedAt }
 *   channels  — { id, guildId, name, savedAt }
 *   messages  — { id, channelId, guildId, authorName, content,
 *                 timestamp, savedAt }
 *
 * Usage:
 *   await DB.init();
 *   await DB.saveGuild({ id: "123", name: "My Server" });
 *   await DB.saveMessages(messagesArray);
 */

const DB = (() => {
  const DB_NAME = "discord-reader";
  const DB_VERSION = 1;

  /** @type {IDBDatabase|null} */
  let _db = null;

  // ── Schema upgrade ─────────────────────────────────────────────────────────

  function _onUpgradeNeeded(event) {
    const db = event.target.result;

    // guilds store
    if (!db.objectStoreNames.contains("guilds")) {
      db.createObjectStore("guilds", { keyPath: "id" });
    }

    // channels store with an index on guildId
    if (!db.objectStoreNames.contains("channels")) {
      const channelStore = db.createObjectStore("channels", { keyPath: "id" });
      channelStore.createIndex("guildId", "guildId", { unique: false });
    }

    // messages store with indexes on channelId, guildId, and timestamp
    if (!db.objectStoreNames.contains("messages")) {
      const msgStore = db.createObjectStore("messages", { keyPath: "id" });
      msgStore.createIndex("channelId", "channelId", { unique: false });
      msgStore.createIndex("guildId", "guildId", { unique: false });
      msgStore.createIndex("timestamp", "timestamp", { unique: false });
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Wrap an IDBRequest in a Promise.
   * @param {IDBRequest} request
   * @returns {Promise<any>}
   */
  function _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Open a read-write transaction on the given store name.
   * @param {string} storeName
   * @returns {IDBObjectStore}
   */
  function _rwStore(storeName) {
    return _db.transaction(storeName, "readwrite").objectStore(storeName);
  }

  /**
   * Open a read-only transaction on the given store name.
   * @param {string} storeName
   * @returns {IDBObjectStore}
   */
  function _roStore(storeName) {
    return _db.transaction(storeName, "readonly").objectStore(storeName);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Open (and if needed create/upgrade) the IndexedDB database.
   * Must be called once before any other DB method.
   *
   * @returns {Promise<void>}
   */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) {
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = _onUpgradeNeeded;
      request.onsuccess = (e) => {
        _db = e.target.result;
        console.log("[Discord Reader] IndexedDB opened successfully.");
        resolve();
      };
      request.onerror = (e) => {
        console.error("[Discord Reader] IndexedDB open failed:", e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * Save a guild record (upsert).
   * @param {{ id: string, name: string }} guild
   * @returns {Promise<void>}
   */
  async function saveGuild(guild) {
    const record = { ...guild, savedAt: new Date().toISOString() };
    await _promisify(_rwStore("guilds").put(record));
  }

  /**
   * Save a channel record (upsert).
   * @param {{ id: string, guildId: string, name: string }} channel
   * @returns {Promise<void>}
   */
  async function saveChannel(channel) {
    const record = { ...channel, savedAt: new Date().toISOString() };
    await _promisify(_rwStore("channels").put(record));
  }

  /**
   * Save an array of messages (upsert each).
   * Silently skips messages that are missing an id.
   *
   * @param {Array<{id: string, channelId: string, guildId: string,
   *                authorName: string, content: string,
   *                timestamp: string}>} messages
   * @returns {Promise<void>}
   */
  async function saveMessages(messages) {
    if (!messages || messages.length === 0) return;

    const store = _rwStore("messages");
    const now = new Date().toISOString();
    const puts = messages
      .filter((m) => m && m.id)
      .map((m) => _promisify(store.put({ ...m, savedAt: now })));

    await Promise.all(puts);
  }

  /**
   * Return the most recent timestamp (ISO string) saved for a channel, or
   * null if no messages exist yet.  Used by the scroller to know where to
   * stop on incremental runs.
   *
   * @param {string} channelId
   * @returns {Promise<string|null>}
   */
  async function getLastMessageTimestamp(channelId) {
    const index = _roStore("messages").index("channelId");

    return new Promise((resolve, reject) => {
      // Open a cursor on channelId, ordered by primary key (message id) desc
      // We use the timestamp index and filter by channelId, then sort.
      // Simpler approach: get all messages for channel and pick max timestamp.
      const request = index.getAll(IDBKeyRange.only(channelId));
      request.onsuccess = (e) => {
        const records = e.target.result;
        if (!records || records.length === 0) {
          resolve(null);
          return;
        }
        // Sort descending by timestamp and return the first
        records.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
        resolve(records[0].timestamp);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Return all messages for a given channel, sorted by timestamp ascending.
   *
   * @param {string} channelId
   * @returns {Promise<Array>}
   */
  async function getMessagesByChannel(channelId) {
    const index = _roStore("messages").index("channelId");
    const records = await _promisify(
      index.getAll(IDBKeyRange.only(channelId))
    );
    return (records || []).sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : 1
    );
  }

  /**
   * Return the count of saved messages for a given channel.
   *
   * @param {string} channelId
   * @returns {Promise<number>}
   */
  async function getMessageCountByChannel(channelId) {
    const index = _roStore("messages").index("channelId");
    const count = await _promisify(index.count(IDBKeyRange.only(channelId)));
    return count || 0;
  }

  /**
   * Return the Discord message ID (snowflake string) of the most recently
   * saved message for a channel. Snowflake IDs sort lexicographically —
   * the highest string value is the newest message.
   *
   * @param {string} channelId
   * @returns {Promise<string|null>}
   */
  async function getLastMessageId(channelId) {
    const index = _roStore("messages").index("channelId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(channelId));
      request.onsuccess = (e) => {
        const records = e.target.result;
        if (!records || records.length === 0) {
          resolve(null);
          return;
        }
        // Snowflake IDs are numeric strings — lexicographic sort gives newest last
        let maxId = null;
        for (const record of records) {
          if (record.id && (maxId === null || record.id > maxId)) {
            maxId = record.id;
          }
        }
        resolve(maxId);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Expose the public surface
  return {
    init,
    saveGuild,
    saveChannel,
    saveMessages,
    getLastMessageTimestamp,
    getMessagesByChannel,
    getLastMessageId,
    getMessageCountByChannel,
  };
})();

if (typeof module !== "undefined") {
  module.exports = { DB };
}
