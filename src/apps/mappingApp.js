import { logger } from "../logger.js";

const MODULE_ID = "muffler";

/**
 * Opens the GM editor for the Foundry-user -> Discord-ID mapping. Lists every user with an
 * editable Discord-ID field; saving writes the non-empty entries to the world "userMapping".
 * @returns {Promise<void>} Resolves when the dialog closes.
 */
export async function openMappingDialog() {
  const mapping = game.settings.get(MODULE_ID, "userMapping") ?? {};
  const rows = game.users
    .map(
      (user) => `
      <div class="muffler-mapping__row">
        <label>${user.name}</label>
        <input type="text" name="${user.id}" value="${mapping[user.id] ?? ""}" placeholder="Discord ID" />
      </div>`,
    )
    .join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("MUFFLER.Mapping.Title"),
    },
    content: `<div class="muffler-mapping">${rows}</div>`,
    buttons: [
      {
        action: "save",
        label: game.i18n.localize("MUFFLER.Mapping.Save"),
        default: true,
        callback: (event, button) => {
          const next = {};
          for (const user of game.users) {
            const value = button.form.elements[user.id]?.value?.trim();
            if (value) {
              next[user.id] = value;
            }
          }
          return next;
        },
      },
      {
        action: "cancel",
        label: game.i18n.localize("MUFFLER.Mapping.Cancel"),
        callback: () => null,
      },
    ],
    rejectClose: false,
  });

  if (result) {
    await game.settings.set(MODULE_ID, "userMapping", result);
    logger.info("User mapping saved.");
  }
}

/**
 * Settings-menu entry point. Foundry constructs this and calls `render()` when the menu button
 * is clicked; the override opens the mapping dialog instead of rendering an application frame.
 * @extends foundry.applications.api.ApplicationV2
 */
export class MappingMenu extends foundry.applications.api.ApplicationV2 {
  /**
   * Opens the mapping dialog in place of a normal render.
   * @returns {Promise<this>} This instance.
   */
  async render() {
    await openMappingDialog();
    return this;
  }
}
