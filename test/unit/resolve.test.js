import { afterEach, describe, expect, it } from "vitest";
import { resolveOwnDiscordId, shouldDuck } from "../../src/duck/resolve.js";

/**
 * Installs a mock game with the given Muffler/setting values.
 * @param {object} values - Keyed setting values.
 * @returns {void}
 */
function mockSettings(values) {
  globalThis.game = {
    user: { id: "user1" },
    settings: { get: (module, key) => values[key] },
  };
}

describe("resolveOwnDiscordId", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it("returns null when self-exclusion is off", () => {
    mockSettings({ selfExclude: false, ownDiscordId: "123", userMapping: {} });
    expect(resolveOwnDiscordId()).toBeNull();
  });

  it("returns the user's own ID when set", () => {
    mockSettings({ selfExclude: true, ownDiscordId: "123", userMapping: {} });
    expect(resolveOwnDiscordId()).toBe("123");
  });

  it("falls back to the GM mapping when the own ID is unset", () => {
    mockSettings({ selfExclude: true, ownDiscordId: "", userMapping: { user1: "456" } });
    expect(resolveOwnDiscordId()).toBe("456");
  });

  it("returns null when neither the own ID nor a mapping entry exists", () => {
    mockSettings({ selfExclude: true, ownDiscordId: "", userMapping: {} });
    expect(resolveOwnDiscordId()).toBeNull();
  });
});

describe("shouldDuck", () => {
  it("does not duck when no one is speaking", () => {
    expect(shouldDuck(new Set(), "123")).toBe(false);
  });

  it("does not duck when only the local user is speaking", () => {
    expect(shouldDuck(new Set(["123"]), "123")).toBe(false);
  });

  it("ducks when someone other than the local user is speaking", () => {
    expect(shouldDuck(new Set(["123", "999"]), "123")).toBe(true);
  });

  it("ducks on any speaker when no own ID is given", () => {
    expect(shouldDuck(new Set(["123"]), null)).toBe(true);
  });
});
