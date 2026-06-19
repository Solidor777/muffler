/**
 * WebSocket relay for per-user voice speaking state.
 *
 * Clients connect to ws://HOST:PORT (optionally appending ?token=SECRET).
 * On connection, they are authorized, then receive a full sync of current speaking state.
 * Ongoing state changes are broadcast as JSON messages in real time.
 *
 * Pure logic helpers (isAuthorized, syncMessages) are exported separately so they can be
 * unit-tested without opening real sockets.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

/**
 * @typedef {Object} RelayHandle
 * @property {(userId: string, isSpeaking: boolean) => void} setSpeaking
 *   Updates speaking state for a user and broadcasts the change if state actually changed.
 * @property {(msg: string) => void} broadcast
 *   Sends a raw JSON string to all currently authorized and connected clients.
 * @property {() => void} close
 *   Shuts down the WebSocket server.
 * @property {Set<string>} speakingUsers
 *   Live set of user IDs currently marked as speaking.
 */

/**
 * Determines whether a connecting client is authorized to receive relay messages.
 *
 * Open mode: when `token` is falsy, all clients are accepted unconditionally.
 * Authenticated mode: when `token` is set, `presentedToken` must match exactly.
 *
 * @param {string|null|undefined} token          - The server-side secret; falsy means open.
 * @param {string|null|undefined} presentedToken - The token presented by the client.
 * @returns {boolean} True if the client is authorized.
 */
export function isAuthorized(token, presentedToken) {
    if (!token) {
        return true;
    }
    return presentedToken === token;
}

/**
 * Builds the set of JSON messages needed to synchronize a newly-connected client with
 * the current speaking state. Each speaking user yields one {type:"speaking"} message.
 * Quiet users are not included because absence implies quiet.
 *
 * @param {Set<string>} speakingSet - Current set of speaking user IDs.
 * @returns {string[]} Array of serialized JSON message strings.
 */
export function syncMessages(speakingSet) {
    /** @type {string[]} - One message per currently-speaking user. */
    const messages = [];
    for (const userId of speakingSet) {
        messages.push(JSON.stringify({ type: 'speaking', userId }));
    }
    return messages;
}

/**
 * Creates and starts the WebSocket relay server.
 *
 * Each connecting client is authorized via query-param or first-message token. Authorized
 * clients receive a sync of current state, then live updates. Unauthorized clients are
 * closed immediately with code 4401.
 *
 * @param {Object}      options       - Relay configuration.
 * @param {number}      options.port  - TCP port to listen on.
 * @param {string|null} options.token - Optional shared secret; null means open access.
 * @returns {RelayHandle} Handle exposing setSpeaking, broadcast, close, and speakingUsers.
 */
export function createRelay({ port, token }) {
    /** @type {Set<string>} - User IDs currently speaking. */
    const speakingUsers = new Set();

    /** @type {Set<WebSocket>} - Clients that have passed authorization. */
    const authorizedClients = new Set();

    /**
     * Sends a message string to every currently authorized and open client.
     *
     * @param {string} msg - Serialized JSON string to broadcast.
     */
    function broadcast(msg) {
        for (const client of authorizedClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        }
    }

    /**
     * Updates speaking state for a user and broadcasts the delta only when state changes.
     * Deduplicates: if the user is already in the requested state, no message is sent.
     *
     * @param {string}  userId     - Discord snowflake user ID.
     * @param {boolean} isSpeaking - True if the user started speaking; false if they stopped.
     */
    function setSpeaking(userId, isSpeaking) {
        const wasAlreadySpeaking = speakingUsers.has(userId);

        if (isSpeaking && !wasAlreadySpeaking) {
            speakingUsers.add(userId);
            broadcast(JSON.stringify({ type: 'speaking', userId }));
        } else if (!isSpeaking && wasAlreadySpeaking) {
            speakingUsers.delete(userId);
            broadcast(JSON.stringify({ type: 'quiet', userId }));
        }
        // No-op when state is already correct — prevents duplicate broadcasts.
    }

    /** @type {WebSocketServer} - The underlying ws server instance. */
    const wss = new WebSocketServer({ port });

    wss.on('connection', (ws, req) => {
        /**
         * Attempt to read the token from the ?token= query parameter. The request URL is
         * relative (e.g. /?token=...), so it is resolved against a dummy base to parse it.
         *
         * @type {string|null}
         */
        let presentedToken = null;
        try {
            const reqUrl = new URL(req.url ?? '/', 'ws://localhost');
            presentedToken = reqUrl.searchParams.get('token');
        } catch {
            // Malformed URL — presentedToken stays null; auth check below handles it.
        }

        /** @type {boolean} - Whether this client has been authorized to receive messages. */
        let clientAuthorized = isAuthorized(token, presentedToken);

        if (clientAuthorized) {
            authorizedClients.add(ws);
            // Sync new client to current speaking state immediately.
            for (const msg of syncMessages(speakingUsers)) {
                ws.send(msg);
            }
        } else {
            // Allow a single auth message as an alternative to the query-param approach.
            ws.once('message', (data) => {
                let parsed;
                try {
                    parsed = JSON.parse(data.toString());
                } catch {
                    ws.close(4401, 'Unauthorized');
                    return;
                }

                if (parsed?.type === 'auth' && isAuthorized(token, parsed.token)) {
                    clientAuthorized = true;
                    authorizedClients.add(ws);
                    // Sync after successful first-message auth.
                    for (const msg of syncMessages(speakingUsers)) {
                        ws.send(msg);
                    }
                } else {
                    ws.close(4401, 'Unauthorized');
                }
            });
        }

        ws.on('close', () => {
            authorizedClients.delete(ws);
        });

        ws.on('error', () => {
            authorizedClients.delete(ws);
        });
    });

    wss.on('listening', () => {
        console.log(`[relay] WebSocket relay listening on port ${port}.`);
    });

    return {
        setSpeaking,
        broadcast,
        /** Closes the WebSocket server and releases the port. */
        close: () => wss.close(),
        speakingUsers,
    };
}
