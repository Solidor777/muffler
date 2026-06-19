import { expect, test } from "@playwright/test";
import { WebSocketServer } from "ws";

const PORT = 8731;
const RELAY_URL = `ws://localhost:${PORT}`;

// Mock relay: a local WebSocket server the Foundry client connects to, driven by the test.
let server = null;
const sockets = new Set();

/**
 * Broadcasts a relay message to all connected mock-relay clients.
 * @param {object} message - The JSON message to send.
 * @returns {void}
 */
function broadcast(message) {
  for (const socket of sockets) {
    socket.send(JSON.stringify(message));
  }
}

test.beforeAll(() => {
  server = new WebSocketServer({ port: PORT });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
});

test.afterAll(() => {
  server?.close();
});

/**
 * Joins the running world as a GM, waits for ready, and unlocks audio (required for the
 * music/environment buses to exist).
 * @param {import("@playwright/test").Page} page - The Playwright page.
 * @returns {Promise<void>} Resolves once audio is unlocked.
 */
async function joinReadyUnlock(page) {
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
  await page.waitForFunction(() => Boolean(globalThis.game.audio?.music?.gainNode), null, { timeout: 15_000 });
}

test("ducks music + environment via the relay and restores after release", async ({ page }) => {
  await joinReadyUnlock(page);

  await page.evaluate(async (url) => {
    await globalThis.game.settings.set("core", "globalPlaylistVolume", 1);
    await globalThis.game.settings.set("core", "globalAmbientVolume", 1);
    await globalThis.game.settings.set("muffler", "selfExclude", false);
    await globalThis.game.settings.set("muffler", "relayToken", "");
    await globalThis.game.settings.set("muffler", "relayUrl", url);
    await globalThis.game.settings.set("muffler", "enabled", true);
    globalThis.game.modules.get("muffler").api.startDucking();
  }, RELAY_URL);

  await expect.poll(() => sockets.size, { timeout: 10_000 }).toBeGreaterThan(0);

  const base = await page.evaluate(() => globalThis.game.audio.music.gainNode.gain.value);
  expect(base).toBeGreaterThan(0.5);

  broadcast({ type: "speaking", userId: "remote-1" });
  await page.waitForTimeout(700);
  const ducked = await page.evaluate(() => ({
    music: globalThis.game.audio.music.gainNode.gain.value,
    environment: globalThis.game.audio.environment.gainNode.gain.value,
  }));
  expect(ducked.music).toBeLessThan(0.5);
  expect(ducked.environment).toBeLessThan(0.5);

  broadcast({ type: "quiet", userId: "remote-1" });
  await page.waitForTimeout(2500);
  const restored = await page.evaluate(() => globalThis.game.audio.music.gainNode.gain.value);
  expect(restored).toBeGreaterThan(0.8);

  await page.evaluate(() => globalThis.game.modules.get("muffler").api.stopDucking());
});
