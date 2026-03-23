/**
 * ui/panel.js
 *
 * UI rendering helpers for the Discord Reader overlay panel.
 * These functions update the DOM elements already created by overlay.js.
 *
 * Phase 1 — list items log to console when clicked.
 * Phases 3–4 will wire them to scraper/scroller/db logic.
 *
 * Exports: renderGuilds(guilds), renderChannels(channels), renderStatus(text)
 */

/**
 * Render a list of guild objects into the guilds pane.
 *
 * @param {Array<{id: string, name: string}>} guilds
 */
function renderGuilds(guilds) {
  const list = document.getElementById("dr-guilds-list");
  if (!list) return;

  list.innerHTML = "";

  if (!guilds || guilds.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No guilds";
    empty.style.fontStyle = "italic";
    empty.style.color = "#72767d";
    list.appendChild(empty);
    return;
  }

  for (const guild of guilds) {
    const item = document.createElement("li");
    item.textContent = guild.name || guild.id;
    item.dataset.guildId = guild.id;

    item.addEventListener("click", () => {
      // Highlight active item
      list.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      // Phase 3+ will load channels for this guild
      console.log("[Discord Reader] Guild selected:", guild.id, guild.name);
    });

    list.appendChild(item);
  }
}

/**
 * Render a list of channel objects into the channels pane.
 *
 * @param {Array<{id: string, guildId: string, name: string}>} channels
 */
function renderChannels(channels) {
  const list = document.getElementById("dr-channels-list");
  if (!list) return;

  list.innerHTML = "";

  if (!channels || channels.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No channels";
    empty.style.fontStyle = "italic";
    empty.style.color = "#72767d";
    list.appendChild(empty);
    return;
  }

  for (const channel of channels) {
    const item = document.createElement("li");
    item.textContent = (channel.name ? "# " + channel.name : channel.id);
    item.dataset.channelId = channel.id;

    item.addEventListener("click", () => {
      // Highlight active item
      list.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      // Phase 4+ will trigger scraping for this channel
      console.log(
        "[Discord Reader] Channel selected:",
        channel.id,
        channel.name
      );
    });

    list.appendChild(item);
  }
}

/**
 * Update the status area in the messages pane with a text message.
 * E.g. "Scraping… 120 messages saved" or "Done — 348 messages total."
 *
 * @param {string} text
 */
function renderStatus(text) {
  const status = document.getElementById("dr-status");
  if (!status) return;
  status.textContent = text || "";
}

/**
 * Update the scrape button's appearance and disabled state to reflect whether
 * a scrape is currently running.
 * The button stays enabled in both states so the user can click it to stop a
 * running scrape.
 *
 * @param {boolean} scraping  true = scrape in progress; false = idle
 */
function setScrapeButtonState(scraping) {
  const btn = document.getElementById("dr-scrape-btn");
  if (!btn) return;
  if (scraping) {
    btn.disabled = false;
    btn.textContent = "⏹ Stop scraping";
  } else {
    btn.disabled = false;
    btn.textContent = "Scrape this channel";
  }
}

// Expose to other content scripts in the same scope
if (typeof module !== "undefined") {
  module.exports = { renderGuilds, renderChannels, renderStatus, setScrapeButtonState };
}
