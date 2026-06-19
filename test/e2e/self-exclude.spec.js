import { expect, test } from "@playwright/test";
import { WebSocketServer } from "ws";
import { joinReadyUnlock } from "./helpers.js";

const PORT = 8732;
const RELAY_URL = `ws://localhost:${PORT}`;

// Mock relay driven by the test.
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

test("excludes the local user's own Discord ID from ducking", async ({ page }) => {
  await joinReadyUnlock(page);

  await page.evaluate(async (url) => {
    await globalThis.game.settings.set("core", "globalPlaylistVolume", 1);
    await globalThis.game.settings.set("core", "globalAmbientVolume", 1);
    await globalThis.game.settings.set("muffler", "selfExclude", true);
    await globalThis.game.settings.set("muffler", "ownDiscordId", "self-1");
    await globalThis.game.settings.set("muffler", "relayToken", "");
    await globalThis.game.settings.set("muffler", "relayUrl", url);
    await globalThis.game.settings.set("muffler", "enabled", true);
    globalThis.game.modules.get("muffler").api.startDucking();
  }, RELAY_URL);

  await expect.poll(() => sockets.size, { timeout: 10_000 }).toBeGreaterThan(0);

  const base = await page.evaluate(() => globalThis.game.audio.music.gainNode.gain.value);
  expect(base).toBeGreaterThan(0.5);

  // The local user's own voice does not duck.
  broadcast({ type: "speaking", userId: "self-1" });
  await page.waitForTimeout(500);
  const afterSelf = await page.evaluate(() => globalThis.game.audio.music.gainNode.gain.value);
  expect(afterSelf).toBeGreaterThan(0.8);

  // Another user does duck.
  broadcast({ type: "speaking", userId: "other-1" });
  await page.waitForTimeout(700);
  const afterOther = await page.evaluate(() => globalThis.game.audio.music.gainNode.gain.value);
  expect(afterOther).toBeLessThan(0.5);

  broadcast({ type: "quiet", userId: "self-1" });
  broadcast({ type: "quiet", userId: "other-1" });
  await page.evaluate(() => globalThis.game.modules.get("muffler").api.stopDucking());
});
