import { afterEach, describe, expect, it, vi } from "vitest";
import { DuckController } from "../../src/duck/controller.js";

/**
 * Installs a mock game with the given setting values.
 * @param {object} values - Keyed setting values.
 * @returns {void}
 */
function mockGame(values) {
  globalThis.game = { user: { id: "u1" }, settings: { get: (module, key) => values[key] } };
}

describe("DuckController", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it("ducks when another user speaks and releases when they go quiet", () => {
    mockGame({ selfExclude: false });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("a");
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
    controller.onQuiet("a");
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it("does not duck for the local user's own Discord ID", () => {
    mockGame({ selfExclude: true, ownDiscordId: "me", userMapping: {} });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("me");
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it("ducks for another user even while the local user also speaks", () => {
    mockGame({ selfExclude: true, ownDiscordId: "me", userMapping: {} });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("me");
    controller.onSpeaking("other");
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
  });

  it("reset() clears all speakers and releases the duck", () => {
    mockGame({ selfExclude: false });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("a");
    controller.onSpeaking("b");
    engine.setDucked.mockClear();
    controller.reset();
    expect(engine.setDucked).toHaveBeenCalledWith(false);
  });
});
