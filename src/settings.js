import { MappingMenu } from "./apps/mappingApp.js";

const MODULE_ID = "muffler";
// Settings whose change must restart the relay connection / ducking.
const RESTART_KEYS = new Set(["enabled", "relayUrl", "relayToken"]);

/**
 * Registers all Muffler settings with Foundry. Client settings drive each user's own ducking
 * and relay connection; connection-affecting changes restart ducking. The world "userMapping"
 * backs the GM's Foundry-user -> Discord-ID map, edited via its restricted settings menu.
 * @returns {void}
 */
export function registerSettings() {
  const client = [
    { key: "debug", type: Boolean, default: false },
    { key: "enabled", type: Boolean, default: true },
    { key: "relayUrl", type: String, default: "" },
    { key: "relayToken", type: String, default: "" },
    { key: "selfExclude", type: Boolean, default: true },
    { key: "ownDiscordId", type: String, default: "" },
    { key: "duckTarget", type: Number, default: 0.2 },
    { key: "attackMs", type: Number, default: 150 },
    { key: "releaseMs", type: Number, default: 800 },
    { key: "holdMs", type: Number, default: 300 },
  ];

  for (const { key, type, default: value } of client) {
    game.settings.register(MODULE_ID, key, {
      name: `MUFFLER.Settings.${key}.Name`,
      hint: `MUFFLER.Settings.${key}.Hint`,
      scope: "client",
      config: true,
      type,
      default: value,
      onChange: RESTART_KEYS.has(key) ? () => game.modules.get(MODULE_ID)?.api?.startDucking?.() : undefined,
    });
  }

  game.settings.register(MODULE_ID, "userMapping", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.registerMenu(MODULE_ID, "userMappingMenu", {
    name: "MUFFLER.Settings.userMappingMenu.Name",
    label: "MUFFLER.Settings.userMappingMenu.Label",
    hint: "MUFFLER.Settings.userMappingMenu.Hint",
    icon: "fa-solid fa-users",
    type: MappingMenu,
    restricted: true,
  });
}
