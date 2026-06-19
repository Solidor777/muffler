/**
 * Muffler bot entrypoint.
 *
 * Loads configuration, starts the WebSocket relay, then starts the Discord bot.
 * Handles SIGINT for graceful shutdown: closes the relay and exits cleanly.
 */

import { loadConfig } from './config.js';
import { createRelay } from './relay.js';
import { startBot } from './bot.js';

/** @type {import('./config.js').MufflerConfig} - Validated runtime configuration. */
const config = loadConfig();

console.log(`[muffler] Starting relay on port ${config.wsPort}...`);

/** @type {import('./relay.js').RelayHandle} - Active WebSocket relay handle. */
const relay = createRelay({
    port: config.wsPort,
    token: config.relayToken,
});

console.log('[muffler] Starting Discord bot...');

startBot(config, relay).catch((err) => {
    console.error('[muffler] Fatal error during bot startup:', err);
    relay.close();
    process.exit(1);
});

/**
 * Graceful shutdown handler.
 * Closes the WebSocket relay so the port is released before the process exits.
 */
process.on('SIGINT', () => {
    console.log('\n[muffler] Shutting down...');
    relay.close();
    process.exit(0);
});
