const MODULE_ID = "muffler";

/**
 * Resolves the local user's own Discord ID for self-exclusion, or null when self-exclusion is
 * off or no ID can be resolved (in which case every speaker, including self, ducks). Order:
 * the user's own client setting, then the GM's user -> Discord-ID mapping.
 * @returns {string|null} The local user's Discord ID, or null.
 */
export function resolveOwnDiscordId() {
  if (!game.settings.get(MODULE_ID, "selfExclude")) {
    return null;
  }
  const own = game.settings.get(MODULE_ID, "ownDiscordId");
  if (own) {
    return own;
  }
  const mapping = game.settings.get(MODULE_ID, "userMapping") ?? {};
  return mapping[game.user.id] || null;
}

/**
 * Decides whether to duck, given the currently-speaking Discord IDs and the local user's own
 * ID. Ducks when anyone other than the local user is speaking.
 * @param {Iterable<string>} speakingIds - Currently-speaking Discord user IDs.
 * @param {string|null} ownId - The local user's Discord ID, or null to exclude no one.
 * @returns {boolean} True if audio should be ducked.
 */
export function shouldDuck(speakingIds, ownId) {
  for (const id of speakingIds) {
    if (id !== ownId) {
      return true;
    }
  }
  return false;
}
