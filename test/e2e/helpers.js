/**
 * Joins the running world as a GM, waits for game ready, and unlocks audio (required for the
 * music/environment buses to exist). Shared by the Muffler e2e specs.
 * @param {import("@playwright/test").Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once audio is unlocked.
 */
export async function joinReadyUnlock(page) {
  await page.goto("/");
  if (page.url().includes("/join")) {
    await page.waitForSelector('select[name="userid"]');
    const userId = await page.$eval('select[name="userid"]', (select) => {
      const options = [...select.options].filter((option) => option.value);
      const gm = options.find((option) => /game ?master|gm/i.test(option.textContent || ""));
      return (gm ?? options[0])?.value ?? "";
    });
    if (userId) {
      await page.selectOption('select[name="userid"]', userId);
    }
    await page.click('button[name="join"]');
  }
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
  await page.mouse.click(10, 10);
  await page.evaluate(() => globalThis.game.audio?.unlock ?? Promise.resolve());
}
