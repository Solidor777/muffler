import { resolveOwnDiscordId, shouldDuck } from "./resolve.js";

/**
 * Tracks the set of currently-speaking Discord users and drives a DuckEngine. Owning the
 * speaking set here (rather than in main.js) keeps the duck decision unit-testable, including
 * release-on-disconnect via reset().
 */
export class DuckController {
  /** @type {{setDucked: (ducked: boolean) => void}} The engine to drive. */
  #engine;
  /** @type {Set<string>} Currently-speaking Discord user IDs. */
  #speaking = new Set();

  /**
   * @param {{setDucked: (ducked: boolean) => void}} engine - The duck engine to drive.
   */
  constructor(engine) {
    this.#engine = engine;
  }

  /**
   * Records a user as speaking and recomputes the duck state.
   * @param {string} userId - The speaking Discord user ID.
   * @returns {void}
   */
  onSpeaking(userId) {
    this.#speaking.add(userId);
    this.#recompute();
  }

  /**
   * Records a user as quiet and recomputes the duck state.
   * @param {string} userId - The quiet Discord user ID.
   * @returns {void}
   */
  onQuiet(userId) {
    this.#speaking.delete(userId);
    this.#recompute();
  }

  /**
   * Clears all speaking state and releases the duck. Used when the relay disconnects, since no
   * further "quiet" events will arrive to clear stale speakers.
   * @returns {void}
   */
  reset() {
    this.#speaking.clear();
    this.#recompute();
  }

  /**
   * Recomputes and applies the duck decision from the speaking set and self-exclusion.
   * @returns {void}
   */
  #recompute() {
    this.#engine.setDucked(shouldDuck(this.#speaking, resolveOwnDiscordId()));
  }
}
