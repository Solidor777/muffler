import { logger } from "../logger.js";

const MODULE_ID = "muffler";
// Buses to duck, with the core client-volume settings they derive their base gain from.
const CHANNELS = [
  { context: "music", setting: "globalPlaylistVolume" },
  { context: "environment", setting: "globalAmbientVolume" },
];
// Volume-change hooks that overwrite a bus gain and therefore require re-applying an active duck.
const VOLUME_HOOKS = {
  globalPlaylistVolumeChanged: "music",
  globalAmbientVolumeChanged: "environment",
};

/**
 * Applies transient, disconnect-safe ducking to Foundry's music and environment buses by
 * scaling each channel's master GainNode via Web Audio ramps. It only reads saved volume
 * settings (never writes them), so a mid-duck disconnect or reload leaves nothing lowered.
 * Because Foundry overwrites a bus gain when its volume slider/mute changes, an active duck is
 * re-applied on the corresponding volume-change hooks.
 */
export class DuckEngine {
  /** @type {boolean} Whether the engine is currently ducking. */
  #ducked = false;
  /** @type {ReturnType<typeof setTimeout>|null} Pending hold-then-release timer. */
  #releaseTimer = null;
  /** @type {Array<{hook: string, id: number}>} Registered volume-change hook handles. */
  #hooks = [];

  /**
   * Registers the volume-change hooks so an active duck survives slider/mute changes.
   * @returns {void}
   */
  start() {
    for (const [hook, context] of Object.entries(VOLUME_HOOKS)) {
      const id = Hooks.on(hook, () => this.#reapply(context));
      this.#hooks.push({ hook, id });
    }
  }

  /**
   * Releases any active duck immediately and unregisters hooks. Leaves no persisted state.
   * @returns {void}
   */
  stop() {
    if (this.#releaseTimer) {
      clearTimeout(this.#releaseTimer);
      this.#releaseTimer = null;
    }
    if (this.#ducked) {
      this.#release(0.05);
    }
    for (const { hook, id } of this.#hooks) {
      Hooks.off(hook, id);
    }
    this.#hooks = [];
    this.#ducked = false;
  }

  /**
   * Sets the desired duck state. Ducking applies immediately; un-ducking is delayed by the
   * configured hold time so brief pauses do not cause pumping.
   * @param {boolean} ducked - Whether anyone other than the local user is currently speaking.
   * @returns {void}
   */
  setDucked(ducked) {
    if (ducked) {
      if (this.#releaseTimer) {
        clearTimeout(this.#releaseTimer);
        this.#releaseTimer = null;
      }
      if (!this.#ducked) {
        this.#ducked = true;
        this.#apply();
      }
      return;
    }
    if (!this.#ducked || this.#releaseTimer) {
      return;
    }
    const hold = game.settings.get(MODULE_ID, "holdMs");
    this.#releaseTimer = setTimeout(() => {
      this.#releaseTimer = null;
      this.#ducked = false;
      this.#release();
    }, hold);
  }

  /**
   * Ramps both buses toward their ducked target.
   * @returns {void}
   */
  #apply() {
    const factor = game.settings.get(MODULE_ID, "duckTarget");
    const timeConstant = game.settings.get(MODULE_ID, "attackMs") / 1000;
    for (const { context, setting } of CHANNELS) {
      this.#ramp(context, this.#base(setting) * factor, timeConstant);
    }
  }

  /**
   * Ramps both buses back to their saved base volume.
   * @param {number} [timeConstant] - Ramp time constant in seconds; defaults to the release setting.
   * @returns {void}
   */
  #release(timeConstant = game.settings.get(MODULE_ID, "releaseMs") / 1000) {
    for (const { context, setting } of CHANNELS) {
      this.#ramp(context, this.#base(setting), timeConstant);
    }
  }

  /**
   * Re-applies the duck to one bus after its volume hook overwrote the gain.
   * @param {string} context - The audio context name ("music" or "environment").
   * @returns {void}
   */
  #reapply(context) {
    if (!this.#ducked) {
      return;
    }
    const channel = CHANNELS.find((entry) => entry.context === context);
    const factor = game.settings.get(MODULE_ID, "duckTarget");
    const timeConstant = game.settings.get(MODULE_ID, "attackMs") / 1000;
    this.#ramp(context, this.#base(channel.setting) * factor, timeConstant);
  }

  /**
   * Reads a channel's saved base volume without writing it.
   * @param {string} setting - The core volume settings key.
   * @returns {number} The saved volume in the range 0-1.
   */
  #base(setting) {
    return game.settings.get("core", setting);
  }

  /**
   * Ramps a bus master gain toward a target using an exponential Web Audio approach.
   * @param {string} context - The audio context name.
   * @param {number} target - Target linear gain.
   * @param {number} timeConstant - Exponential time constant in seconds.
   * @returns {void}
   */
  #ramp(context, target, timeConstant) {
    const ctx = game.audio?.[context];
    if (!ctx?.gainNode) {
      logger.warn(`Audio bus "${context}" unavailable; is audio unlocked?`);
      return;
    }
    const { gain } = ctx.gainNode;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(gain.value, ctx.currentTime);
    gain.setTargetAtTime(target, ctx.currentTime, Math.max(timeConstant, 0.001));
  }
}
