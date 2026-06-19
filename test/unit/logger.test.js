import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/logger.js";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.game;
  });

  it("suppresses debug output when the debug setting is disabled", () => {
    globalThis.game = { settings: { get: () => false } };
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
  });

  it("emits debug output when the debug setting is enabled", () => {
    globalThis.game = { settings: { get: () => true } };
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("shown");
    expect(spy).toHaveBeenCalledWith("[Muffler]", "shown");
  });

  it("always emits warnings regardless of the debug setting", () => {
    globalThis.game = { settings: { get: () => false } };
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("always");
    expect(spy).toHaveBeenCalledWith("[Muffler]", "always");
  });
});
