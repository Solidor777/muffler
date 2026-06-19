/**
 * Tests for relay.reset(): clears speaking state and broadcasts quiet to connected clients.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { createRelay } from '../src/relay.js';

/** @type {import('../src/relay.js').RelayHandle|null} */
let relay = null;

afterEach(() => {
    relay?.close();
    relay = null;
});

describe('relay reset', () => {
    it('clears all speaking state', () => {
        relay = createRelay({ port: 0, token: null });
        relay.setSpeaking('a', true);
        relay.setSpeaking('b', true);
        expect(relay.speakingUsers.size).toBe(2);
        relay.reset();
        expect(relay.speakingUsers.size).toBe(0);
    });

    it('broadcasts a quiet event for each speaking user to connected clients', async () => {
        const port = 18799;
        relay = createRelay({ port, token: null });
        relay.setSpeaking('a', true);
        relay.setSpeaking('b', true);

        const received = [];
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('message', (data) => received.push(JSON.parse(data.toString())));
        await new Promise((resolve) => ws.on('open', resolve));
        await new Promise((resolve) => setTimeout(resolve, 40));

        relay.reset();
        await new Promise((resolve) => setTimeout(resolve, 40));
        ws.close();

        const quiets = received
            .filter((message) => message.type === 'quiet')
            .map((message) => message.userId)
            .sort();
        expect(quiets).toEqual(['a', 'b']);
    });
});
