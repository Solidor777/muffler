/**
 * Unit tests for relay.js pure-logic exports.
 *
 * All tests operate on isAuthorized and syncMessages directly, or drive setSpeaking
 * through a fake broadcast collector — no real WebSocket server is opened.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isAuthorized, syncMessages } from '../src/relay.js';

// ---------------------------------------------------------------------------
// isAuthorized
// ---------------------------------------------------------------------------

describe('isAuthorized', () => {
    it('allows any client when token is null (open mode)', () => {
        expect(isAuthorized(null, undefined)).toBe(true);
        expect(isAuthorized(null, null)).toBe(true);
        expect(isAuthorized(null, 'anything')).toBe(true);
        expect(isAuthorized(null, '')).toBe(true);
    });

    it('allows any client when token is empty string (open mode)', () => {
        // Empty string is falsy — treated the same as null.
        expect(isAuthorized('', 'something')).toBe(true);
        expect(isAuthorized('', null)).toBe(true);
    });

    it('authorizes a client that presents the correct token', () => {
        expect(isAuthorized('s3cr3t', 's3cr3t')).toBe(true);
    });

    it('rejects a client that presents the wrong token', () => {
        expect(isAuthorized('s3cr3t', 'wrong')).toBe(false);
    });

    it('rejects a client that presents no token when one is required', () => {
        expect(isAuthorized('s3cr3t', null)).toBe(false);
        expect(isAuthorized('s3cr3t', undefined)).toBe(false);
    });

    it('rejects an empty presented token when a token is required', () => {
        expect(isAuthorized('s3cr3t', '')).toBe(false);
    });

    it('is case-sensitive', () => {
        expect(isAuthorized('Token', 'token')).toBe(false);
        expect(isAuthorized('Token', 'TOKEN')).toBe(false);
        expect(isAuthorized('Token', 'Token')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// syncMessages
// ---------------------------------------------------------------------------

describe('syncMessages', () => {
    it('returns an empty array for an empty speaking set', () => {
        const messages = syncMessages(new Set());
        expect(messages).toEqual([]);
    });

    it('returns one message per speaking user', () => {
        const speaking = new Set(['userA', 'userB', 'userC']);
        const messages = syncMessages(speaking);
        expect(messages).toHaveLength(3);
    });

    it('produces well-formed {type:"speaking"} JSON for each user', () => {
        const speaking = new Set(['user123']);
        const messages = syncMessages(speaking);
        const parsed = JSON.parse(messages[0]);
        expect(parsed).toEqual({ type: 'speaking', userId: 'user123' });
    });

    it('covers all users in the set without duplicates', () => {
        const speaking = new Set(['userA', 'userB']);
        const messages = syncMessages(speaking);
        const userIds = messages.map((m) => JSON.parse(m).userId);
        expect(userIds).toContain('userA');
        expect(userIds).toContain('userB');
        expect(new Set(userIds).size).toBe(2);
    });

    it('returns strings (serialized JSON), not objects', () => {
        const speaking = new Set(['userX']);
        const messages = syncMessages(speaking);
        expect(typeof messages[0]).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// setSpeaking dedupe / broadcast format — driven via a fake relay
// ---------------------------------------------------------------------------

/**
 * Builds a minimal setSpeaking-like function backed by a fake broadcast collector.
 * This mirrors the internal logic of the real setSpeaking without touching ws.Server.
 *
 * @returns {{ setSpeaking: Function, broadcasts: string[], speakingUsers: Set<string> }}
 */
function buildFakeRelay() {
    /** @type {Set<string>} - Mirrors relay's internal speakingUsers set. */
    const speakingUsers = new Set();

    /** @type {string[]} - Collects every broadcast call, in order. */
    const broadcasts = [];

    /**
     * Fake broadcast — records the message for assertion.
     *
     * @param {string} msg - Serialized JSON string.
     */
    function broadcast(msg) {
        broadcasts.push(msg);
    }

    /**
     * Mirrors relay's setSpeaking logic: update set and broadcast only on state change.
     *
     * @param {string}  userId     - User ID.
     * @param {boolean} isSpeaking - New desired speaking state.
     */
    function setSpeaking(userId, isSpeaking) {
        const wasSpeaking = speakingUsers.has(userId);
        if (isSpeaking && !wasSpeaking) {
            speakingUsers.add(userId);
            broadcast(JSON.stringify({ type: 'speaking', userId }));
        } else if (!isSpeaking && wasSpeaking) {
            speakingUsers.delete(userId);
            broadcast(JSON.stringify({ type: 'quiet', userId }));
        }
    }

    return { setSpeaking, broadcasts, speakingUsers };
}

describe('setSpeaking dedupe and broadcast format', () => {
    /** @type {ReturnType<typeof buildFakeRelay>} */
    let relay;

    beforeEach(() => {
        relay = buildFakeRelay();
    });

    it('broadcasts a {type:"speaking"} message when a user starts speaking', () => {
        relay.setSpeaking('user1', true);
        expect(relay.broadcasts).toHaveLength(1);
        expect(JSON.parse(relay.broadcasts[0])).toEqual({ type: 'speaking', userId: 'user1' });
    });

    it('broadcasts a {type:"quiet"} message when a user stops speaking', () => {
        relay.setSpeaking('user1', true);
        relay.setSpeaking('user1', false);
        expect(relay.broadcasts).toHaveLength(2);
        expect(JSON.parse(relay.broadcasts[1])).toEqual({ type: 'quiet', userId: 'user1' });
    });

    it('does not broadcast when the user is already speaking (start dedupe)', () => {
        relay.setSpeaking('user1', true);
        relay.setSpeaking('user1', true); // Duplicate — should be ignored.
        expect(relay.broadcasts).toHaveLength(1);
    });

    it('does not broadcast when the user is already quiet (end dedupe)', () => {
        relay.setSpeaking('user1', false); // User was never speaking — no-op.
        expect(relay.broadcasts).toHaveLength(0);
    });

    it('removes the user from speakingUsers when they stop speaking', () => {
        relay.setSpeaking('user1', true);
        relay.setSpeaking('user1', false);
        expect(relay.speakingUsers.has('user1')).toBe(false);
    });

    it('adds the user to speakingUsers when they start speaking', () => {
        relay.setSpeaking('user1', true);
        expect(relay.speakingUsers.has('user1')).toBe(true);
    });

    it('handles multiple independent users without cross-contamination', () => {
        relay.setSpeaking('userA', true);
        relay.setSpeaking('userB', true);
        relay.setSpeaking('userA', false);

        expect(relay.speakingUsers.has('userA')).toBe(false);
        expect(relay.speakingUsers.has('userB')).toBe(true);
        expect(relay.broadcasts).toHaveLength(3);
        expect(JSON.parse(relay.broadcasts[2])).toEqual({ type: 'quiet', userId: 'userA' });
    });

    it('broadcasts are serialized JSON strings', () => {
        relay.setSpeaking('user1', true);
        expect(typeof relay.broadcasts[0]).toBe('string');
        // Must parse without throwing.
        expect(() => JSON.parse(relay.broadcasts[0])).not.toThrow();
    });

    it('correctly sequences start → stop → start again for the same user', () => {
        relay.setSpeaking('user1', true);
        relay.setSpeaking('user1', false);
        relay.setSpeaking('user1', true);

        expect(relay.broadcasts).toHaveLength(3);
        expect(JSON.parse(relay.broadcasts[0]).type).toBe('speaking');
        expect(JSON.parse(relay.broadcasts[1]).type).toBe('quiet');
        expect(JSON.parse(relay.broadcasts[2]).type).toBe('speaking');
        expect(relay.speakingUsers.has('user1')).toBe(true);
    });
});
