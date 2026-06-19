import { registerSettings } from "./settings.js";
import { RelayClient } from "./relay/client.js";
import { DuckEngine } from "./duck/engine.js";
import { DuckController } from "./duck/controller.js";
import { openMappingDialog } from "./apps/mappingApp.js";
import { logger } from "./logger.js";
import "./styles/muffler.scss";

const MODULE_ID = "muffler";

/** @type {DuckEngine|null} */
let engine = null;
/** @type {RelayClient|null} */
let client = null;
/** @type {DuckController|null} */
let controller = null;

/**
 * Tears down any active relay connection, controller, and duck engine.
 * @returns {void}
 */
function stopDucking() {
  client?.disconnect();
  client = null;
  controller = null;
  engine?.stop();
  engine = null;
}

/**
 * Starts (or restarts) the relay connection and duck engine from current settings. No-op when
 * disabled or when no relay URL is configured. Releases the duck and notifies on disconnect.
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
  controller = new DuckController(engine);
  client = new RelayClient({
    url,
    token: game.settings.get(MODULE_ID, "relayToken"),
    onSpeaking: (id) => controller.onSpeaking(id),
    onQuiet: (id) => controller.onQuiet(id),
    onStatus: (status) => {
      logger.info(`Relay ${status}.`);
      if (status === "connected") {
        ui.notifications.info("Muffler: relay connected.");
      } else {
        ui.notifications.warn("Muffler: relay disconnected.");
        controller?.reset();
      }
    },
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
