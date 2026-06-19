import { registerSettings } from "./settings.js";
import { RelayClient } from "./relay/client.js";
import { DuckEngine } from "./duck/engine.js";
import { resolveOwnDiscordId, shouldDuck } from "./duck/resolve.js";
import { openMappingDialog } from "./apps/mappingApp.js";
import { logger } from "./logger.js";
import "./styles/muffler.scss";

const MODULE_ID = "muffler";

// Set of currently-speaking Discord user IDs reported by the relay.
const speaking = new Set();
/** @type {DuckEngine|null} */
let engine = null;
/** @type {RelayClient|null} */
let client = null;

/**
 * Recomputes and applies the duck state from the current speaking set and self-exclusion.
 * @returns {void}
 */
function recompute() {
  engine?.setDucked(shouldDuck(speaking, resolveOwnDiscordId()));
}

/**
 * Tears down any active relay connection and duck engine and clears speaking state.
 * @returns {void}
 */
function stopDucking() {
  client?.disconnect();
  client = null;
  engine?.stop();
  engine = null;
  speaking.clear();
}

/**
 * Starts (or restarts) the relay connection and duck engine from current settings. No-op when
 * disabled or when no relay URL is configured.
 * @returns {void}
 */
function startDucking() {
  stopDucking();
  if (!game.settings.get(MODULE_ID, "enabled")) {
    return;
  }
  const url = game.settings.get(MODULE_ID, "relayUrl");
  if (!url) {
    logger.warn("Enabled but no relay URL configured; ducking inactive.");
    return;
  }
  engine = new DuckEngine();
  engine.start();
  client = new RelayClient({
    url,
    token: game.settings.get(MODULE_ID, "relayToken"),
    onSpeaking: (id) => {
      speaking.add(id);
      recompute();
    },
    onQuiet: (id) => {
      speaking.delete(id);
      recompute();
    },
    onStatus: (status) => logger.info(`Relay ${status}.`),
  });
  client.connect();
}

Hooks.once("init", () => {
  registerSettings();
  logger.debug("Settings registered.");
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { startDucking, stopDucking, openMappingDialog };
  startDucking();
  logger.info(`Muffler ${game.modules.get(MODULE_ID).version} ready.`);
});
