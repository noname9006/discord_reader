/**
 * content/nav_controller.js
 *
 * NavController — populates the overlay's Guilds and Channels panes from the
 * live Discord DOM, handles click-to-navigate, and observes DOM changes to
 * refresh the channels list when Discord navigates.
 */

/* global SELECTORS, readGuilds, readChannels, getActiveGuildId, getActiveChannelId,
          renderGuilds, renderChannels, renderStatus, renderMessageViewer, appendMessages, DB, ScrapeController */

const NavController = (() => {
  // Internal map: guild/channel ID → DOM element reference (for click navigation)
  let _guildElements = new Map(); // id → Element
  let _channelElements = new Map(); // id → Element

  // MutationObserver watching the channel list for navigation changes
  let _channelObserver = null;

  // Interval ID for URL polling (so it can be cleared in stopObserving)
  let _urlPollInterval = null;

  // Debounce timer for MutationObserver
  let _mutationDebounceTimer = null;

  // Handler for the "Load more" button — stored so it can be replaced
  let _loadMoreHandler = null;

  // popstate listener reference — stored so it can be removed in stopObserving
  let _popstateHandler = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Populate the Guilds pane with all guilds from the Discord sidebar.
   * Wires click handlers via event delegation so clicking a guild navigates
   * Discord there and refreshes the channels pane.
   */
  function refreshGuilds() {
    const guilds = readGuilds();
    const activeGuildId = getActiveGuildId();

    // Store element references
    _guildElements = new Map(guilds.map(g => [g.id, g.element]));

    // Pass plain data (no DOM elements) to the renderer
    renderGuilds(guilds.map(g => ({ id: g.id, name: g.name })));

    // Highlight active guild
    if (activeGuildId) {
      _highlightActiveGuild(activeGuildId);
    }

    // Wire navigation via event delegation on the list container
    // (avoids duplicate listeners on individual items across refreshes)
    const list = document.getElementById('dr-guilds-list');
    if (!list) return;

    if (list._navDelegateHandler) {
      list.removeEventListener('click', list._navDelegateHandler);
    }
    list._navDelegateHandler = (e) => {
      const li = e.target.closest('li[data-guild-id]');
      if (li) _navigateToGuild(li.dataset.guildId);
    };
    list.addEventListener('click', list._navDelegateHandler);
  }

  /**
   * Populate the Channels pane with text channels for the currently active guild.
   * Fetches saved message counts from DB and shows them as badges.
   * Wires click handlers via event delegation so clicking a channel navigates
   * Discord there and starts a scrape.
   *
   * @param {string} [guildId] — if omitted, uses getActiveGuildId()
   */
  async function refreshChannels(guildId) {
    const targetGuildId = guildId || getActiveGuildId();
    if (!targetGuildId) return;
    const channels = readChannels(targetGuildId);
    const activeChannelId = getActiveChannelId();

    // Store element references
    _channelElements = new Map(channels.map(c => [c.id, c.element]));

    // Fetch saved message counts for each channel
    await DB.init();
    const counts = await Promise.all(
      channels.map(c => DB.getMessageCountByChannel(c.id))
    );
    const channelData = channels.map((c, i) => ({
      id: c.id,
      guildId: c.guildId,
      name: c.name,
      count: counts[i],
    }));

    renderChannels(channelData);

    // Highlight active channel
    if (activeChannelId) {
      _highlightActiveChannel(activeChannelId);
    }

    // Wire navigation + scrape via event delegation on the list container
    const list = document.getElementById('dr-channels-list');
    if (!list) return;

    if (list._navDelegateHandler) {
      list.removeEventListener('click', list._navDelegateHandler);
    }
    list._navDelegateHandler = (e) => {
      const li = e.target.closest('li[data-channel-id]');
      if (!li) return;
      const channelId = li.dataset.channelId;

      // Always load and display saved messages for the clicked channel
      _loadAndShowMessages(channelId, 0);

      // Navigate only if it's a different channel
      if (channelId !== getActiveChannelId()) {
        // Warn and stop any in-progress scrape before navigating
        if (ScrapeController.isRunning()) {
          ScrapeController.stop();
          renderStatus('Scrape stopped — navigated to new channel.');
        }
        _navigateToChannel(channelId);
      }
    };
    list.addEventListener('click', list._navDelegateHandler);

    // If there is a currently active channel, load its messages
    if (activeChannelId) {
      try {
        _loadAndShowMessages(activeChannelId, 0);
      } catch (err) {
        console.error('[Discord Reader] _loadAndShowMessages error:', err);
      }
    }
  }

  /**
   * Start observing Discord's channel list for DOM mutations.
   * When the channel list changes (e.g. Discord navigated to a new guild),
   * refreshChannels() is called automatically.
   *
   * Call this once after the overlay is first built.
   */
  function startObserving() {
    if (_channelObserver) return; // already observing

    // Find a stable ancestor to observe — the main content area
    // We watch for URL changes (via popstate / pushState interception) as the
    // primary signal, and MutationObserver as a secondary catch-all.
    _setupUrlChangeListener();
    _setupMutationObserver();
  }

  /**
   * Stop observing. Call when overlay is destroyed (not typically needed).
   */
  function stopObserving() {
    if (_channelObserver) {
      _channelObserver.disconnect();
      _channelObserver = null;
    }
    if (_urlPollInterval !== null) {
      clearInterval(_urlPollInterval);
      _urlPollInterval = null;
    }
    if (_mutationDebounceTimer !== null) {
      clearTimeout(_mutationDebounceTimer);
      _mutationDebounceTimer = null;
    }
    if (_popstateHandler !== null) {
      window.removeEventListener('popstate', _popstateHandler);
      _popstateHandler = null;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  function _navigateToGuild(guildId) {
    const el = _guildElements.get(guildId);
    if (!el) {
      console.warn('[Discord Reader] Guild element not found for id:', guildId);
      return;
    }
    // Click the guild icon to navigate Discord there
    const clickTarget = el.querySelector('[aria-label]') || el;
    clickTarget.click();

    // After a short delay for Discord to render channels, refresh the pane
    setTimeout(() => {
      refreshChannels(guildId).catch(err =>
        console.error("[Discord Reader] NavController refresh error:", err)
      );
      _highlightActiveGuild(guildId);
    }, 500);
  }

  function _navigateToChannel(channelId) {
    const el = _channelElements.get(channelId);
    if (!el) {
      console.warn('[Discord Reader] Channel element not found for id:', channelId);
      return;
    }
    el.click();

    // Highlight the clicked channel
    setTimeout(() => _highlightActiveChannel(channelId), 100);
  }

  function _highlightActiveGuild(guildId) {
    const list = document.getElementById('dr-guilds-list');
    if (!list) return;
    list.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    const activeLi = list.querySelector(`li[data-guild-id="${guildId}"]`);
    if (activeLi) activeLi.classList.add('active');
  }

  function _highlightActiveChannel(channelId) {
    const list = document.getElementById('dr-channels-list');
    if (!list) return;
    list.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    const activeLi = list.querySelector(`li[data-channel-id="${channelId}"]`);
    if (activeLi) activeLi.classList.add('active');
  }

  function _setupUrlChangeListener() {
    // Discord uses pushState for navigation — intercept it
    let _lastUrl = window.location.href;

    const _checkUrlChange = () => {
      const current = window.location.href;
      if (current !== _lastUrl) {
        _lastUrl = current;
        // URL changed — Discord navigated to a new channel or guild
        const newGuildId = getActiveGuildId();
        const newChannelId = getActiveChannelId();

        // Re-read and re-render channels (guild may have changed)
        refreshChannels(newGuildId).catch(err =>
          console.error("[Discord Reader] NavController refresh error:", err)
        );

        // Update active highlights
        if (newGuildId) _highlightActiveGuild(newGuildId);
        if (newChannelId) _highlightActiveChannel(newChannelId);
      }
    };

    // Poll URL every 750ms — lightweight since it's just a string comparison
    _urlPollInterval = setInterval(_checkUrlChange, 750);

    // Also hook popstate for back/forward navigation — store reference for cleanup
    _popstateHandler = _checkUrlChange;
    window.addEventListener('popstate', _popstateHandler);
  }

  /**
   * Load a page of saved messages from DB and render them in the overlay.
   * If offset === 0, calls renderMessageViewer (replaces content).
   * If offset > 0, calls appendMessages (appends to existing list).
   *
   * @param {string} channelId
   * @param {number} offset
   */
  async function _loadAndShowMessages(channelId, offset) {
    const PAGE = 50;
    try {
      await DB.init();
      const messages = await DB.getMessagesPage(channelId, offset, PAGE);
      const total = await DB.getMessageCountByChannel(channelId);
      const hasMore = (offset + messages.length) < total;

      if (offset === 0) {
        renderMessageViewer(messages, hasMore);
      } else {
        appendMessages(messages, hasMore);
      }

      // Wire "Load more" button
      const btn = document.getElementById('dr-load-more-btn');
      if (btn) {
        if (_loadMoreHandler) {
          btn.removeEventListener('click', _loadMoreHandler);
        }
        _loadMoreHandler = () => {
          _loadAndShowMessages(channelId, offset + messages.length);
        };
        btn.addEventListener('click', _loadMoreHandler);
      } else {
        _loadMoreHandler = null;
      }
    } catch (err) {
      console.error('[Discord Reader] _loadAndShowMessages error:', err);
      const msgList = document.getElementById('dr-msg-list');
      if (msgList) {
        msgList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = '⚠ Could not load messages — see console for details.';
        msgList.appendChild(li);
      }
    }
  }

  function _setupMutationObserver() {
    // Watch for channel list container appearing or changing
    // The channel list may be re-rendered when Discord switches guilds
    const observer = new MutationObserver(() => {
      // Debounce: only act after mutations settle
      clearTimeout(_mutationDebounceTimer);
      _mutationDebounceTimer = setTimeout(() => {
        // Refresh the channels pane if panel is visible
        const panel = document.getElementById('discord-reader-root');
        if (panel && !panel.classList.contains('hidden')) {
          refreshChannels().catch(err =>
            console.error("[Discord Reader] NavController refresh error:", err)
          );
        }
      }, 400);
    });

    // Observe the main app container for subtree changes
    // Use document.body as root with subtree: true but throttled via debounce
    const target = document.querySelector('[class*="app"]') || document.body;
    observer.observe(target, { childList: true, subtree: true });
    _channelObserver = observer;
  }

  return {
    refreshGuilds,
    refreshChannels,
    startObserving,
    stopObserving,
  };
})();

if (typeof module !== 'undefined') {
  module.exports = { NavController };
}
