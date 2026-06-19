import { expect, test } from "@playwright/test";
import { joinReadyUnlock } from "./helpers.js";

test("GM mapping editor persists a user -> Discord ID entry", async ({ page }) => {
  await joinReadyUnlock(page);

  // Store the dialog promise without awaiting it (it resolves only when the dialog closes).
  await page.evaluate(() => {
    globalThis.__mufflerMap = globalThis.game.modules.get("muffler").api.openMappingDialog();
  });

  const dialog = page.locator("dialog.application.dialog:has(h1.window-title)");
  await expect(dialog).toBeVisible();

  const userId = await page.evaluate(() => globalThis.game.user.id);
  await dialog.locator(`input[name="${userId}"]`).fill("999000");
  await dialog.locator('button[data-action="save"]').click();
  await expect(dialog).toBeHidden();

  // The save persists asynchronously after the dialog closes.
  await expect
    .poll(
      async () => {
        const mapped = await page.evaluate(() => globalThis.game.settings.get("muffler", "userMapping"));
        return mapped[userId];
      },
      { timeout: 5_000 },
    )
    .toBe("999000");

  // Restore the empty mapping so the world is left unchanged.
  await page.evaluate(() => globalThis.game.settings.set("muffler", "userMapping", {}));
});
