/**
 * Configuration loader for the Muffler bot.
 *
 * Reads all runtime settings from environment variables. Throws on startup when any
 * required variable is absent, so misconfiguration fails loudly before any I/O.
 *
 * Environment variables:
 *   DISCORD_TOKEN     (required) Bot token from the Discord Developer Portal.
 *   DISCORD_APP_ID    (required) Application (client) ID, used to register slash commands.
 *   DISCORD_GUILD_ID  (required) Guild (server) ID to scope slash-command registration.
 *   WS_PORT           (optional, default 8080) TCP port the WebSocket relay listens on.
 *   RELAY_TOKEN       (optional) If set, WebSocket clients must present this token to connect.
 */

/**
 * @typedef {Object} MufflerConfig
 * @property {string} discordToken    - Bot token for discord.js login.
 * @property {string} discordAppId    - Application ID for slash-command registration.
 * @property {string} discordGuildId  - Guild ID to scope slash-command registration.
 * @property {number} wsPort          - WebSocket relay port.
 * @property {string|null} relayToken - Optional shared secret for WebSocket clients.
 */

/**
 * Reads and validates all configuration from process.env.
 *
 * @returns {MufflerConfig} Validated configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function loadConfig() {
    /** @type {string[]} - Accumulates names of missing required vars before throwing. */
    const missing = [];

    /**
     * Reads a required env var, recording it as missing if absent.
     *
     * @param {string} name - Environment variable name.
     * @returns {string} The value, or empty string as a placeholder when missing.
     */
    function required(name) {
        const value = process.env[name];
        if (!value) {
            missing.push(name);
        }
        return value ?? '';
    }

    /** @type {string} - Bot token; required. */
    const discordToken = required('DISCORD_TOKEN');

    /** @type {string} - Application (client) ID; required. */
    const discordAppId = required('DISCORD_APP_ID');

    /** @type {string} - Guild (server) ID for command registration; required. */
    const discordGuildId = required('DISCORD_GUILD_ID');

    if (missing.length > 0) {
        throw new Error(
            `Muffler bot is missing required environment variables: ${missing.join(', ')}. ` +
            'Copy .env.example to .env and fill in all required values.'
        );
    }

    /** @type {number} - WebSocket port; defaults to 8080. */
    const wsPort = parseInt(process.env.WS_PORT ?? '8080', 10);

    /** @type {string|null} - Optional relay auth token; null means open access. */
    const relayToken = process.env.RELAY_TOKEN ?? null;

    return {
        discordToken,
        discordAppId,
        discordGuildId,
        wsPort,
        relayToken,
    };
}
