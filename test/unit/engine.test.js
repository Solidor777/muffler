import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuckEngine } from "../../src/duck/engine.js";

/**
 * Builds a fake GainNode.gain with spied scheduling methods.
 * @returns {object} A mock AudioParam.
 */
function fakeGain() {
  return {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

/**
 * Installs a mock game (audio buses, settings, hooks) for the engine.
 * @param {object} [overrides] - Setting value overrides.
 * @returns {{music: object, environment: object}} The mock buses.
 */
function setup(overrides = {}) {
  const music = { currentTime: 0, gainNode: { gain: fakeGain() } };
  const environment = { currentTime: 0, gainNode: { gain: fakeGain() } };
  const values = {
    duckTarget: 0.2,
    attackMs: 150,
    releaseMs: 800,
    holdMs: 300,
    globalPlaylistVolume: 1,
    globalAmbientVolume: 0.5,
    ...overrides,
  };
  globalThis.game = {
    audio: { music, environment },
    settings: { get: (module, key) => values[key] },
  };
  const handlers = {};
  globalThis.Hooks = {
    on: vi.fn((hook, fn) => {
      handlers[hook] = fn;
      return Object.keys(handlers).length;
    }),
    off: vi.fn(),
    handlers,
  };
  return { music, environment };
}

describe("DuckEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.game;
    delete globalThis.Hooks;
  });

  it("ducks both buses toward base*target on setDucked(true)", () => {
    const { music, environment } = setup();
    new DuckEngine().setDucked(true);
    expect(music.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.2, 0, expect.any(Number));
    expect(environment.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.1, 0, expect.any(Number));
  });

  it("holds before releasing on setDucked(false)", () => {
    const { music } = setup();
    const engine = new DuckEngine();
    engine.setDucked(true);
    music.gainNode.gain.setTargetAtTime.mockClear();
    engine.setDucked(false);
    expect(music.gainNode.gain.setTargetAtTime).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(music.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, expect.any(Number));
  });

  it("cancels a pending release when re-ducked during the hold", () => {
    const { music } = setup();
    const engine = new DuckEngine();
    engine.setDucked(true);
    engine.setDucked(false);
    engine.setDucked(true);
    music.gainNode.gain.setTargetAtTime.mockClear();
    vi.advanceTimersByTime(300);
    expect(music.gainNode.gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it("re-applies an active duck when a volume hook fires", () => {
    const { music } = setup();
    const engine = new DuckEngine();
    engine.start();
    engine.setDucked(true);
    music.gainNode.gain.setTargetAtTime.mockClear();
    globalThis.Hooks.handlers.globalPlaylistVolumeChanged();
    expect(music.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.2, 0, expect.any(Number));
  });
});
