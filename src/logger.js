const MODULE_ID = "muffler";

/**
 * Reads the current "debug" client setting, defaulting to false before settings register.
 * @returns {boolean} True when verbose logging is enabled.
 */
function isDebug() {
  try {
    return game.settings.get(MODULE_ID, "debug") === true;
  } catch {
    return false;
  }
}

/**
 * Leveled console logger for Muffler. `debug`/`info` are gated by the "debug" client setting;
 * `warn`/`error` always emit. This object is the only sanctioned place for raw `console`.
 * @type {{debug: (...args: *) => void, info: (...args: *) => void, warn: (...args: *) => void, error: (...args: *) => void}}
 */
export const logger = {
  /**
   * Logs a debug message when the "debug" setting is enabled.
   * @param {...*} args - Values to log.
   * @returns {void}
   */
  debug(...args) {
    if (isDebug()) {
      console.debug("[Muffler]", ...args);
    }
  },

  /**
   * Logs an informational message when the "debug" setting is enabled.
   * @param {...*} args - Values to log.
   * @returns {void}
   */
  info(...args) {
    if (isDebug()) {
      console.info("[Muffler]", ...args);
    }
  },

  /**
   * Logs a warning. Always emitted regardless of the "debug" setting.
   * @param {...*} args - Values to log.
   * @returns {void}
   */
  warn(...args) {
    console.warn("[Muffler]", ...args);
  },

  /**
   * Logs an error. Always emitted regardless of the "debug" setting.
   * @param {...*} args - Values to log.
   * @returns {void}
   */
  error(...args) {
    console.error("[Muffler]", ...args);
  },
};
