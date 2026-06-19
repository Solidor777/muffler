# Muffler Bot

Self-hosted Discord bot that joins a voice channel and relays per-user speaking state to
connected Foundry VTT clients over a WebSocket. No audio is decoded — it only tracks
speaking start/end events (Discord voice Opcode 5).

---

## Discord Application Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and
   create a new application.
2. Under **Bot**, click **Add Bot**. Copy the **Bot Token** — this becomes `DISCORD_TOKEN`.
3. Under **General Information**, copy the **Application ID** — this becomes `DISCORD_APP_ID`.
4. **Required Privileged Intents** (under Bot → Privileged Gateway Intents):
   - **Server Members Intent** — NOT required.
   - **Voice States** — YES, enable this. The bot cannot track speaking without it.
   - **Message Content Intent** — NOT required.
5. **Invite URL** — use the URL Generator under **OAuth2**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Connect`, `View Channels`
   - Visit the generated URL while logged in as a server admin to add the bot to your
     guild.

---

## Local Setup

```bash
# 1. Copy the example env file and fill in required values.
cp .env.example .env
# Edit .env with your DISCORD_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID.

# 2. Install dependencies.
npm install

# 3. Start the bot.
npm start
```

Once running, go to any Discord server text channel and type `/muffler join` while you
are sitting in a voice channel. The bot will join that channel and begin relaying speaking
events. Use `/muffler leave` to disconnect.

---

## Deployment & Network Reachability

The WebSocket relay must be reachable from each **browser** running Foundry VTT — the
connection is made client-side, not server-side.

| Scenario | Setup |
|---|---|
| LAN (host and players on the same network) | Set `WS_PORT=8080` (or any free port). Clients connect to `ws://HOST_LAN_IP:8080`. No extra config needed. |
| Remote players / VPS | Port-forward `WS_PORT` through your router, or run the bot on a VPS. Use `ws://YOUR_PUBLIC_IP:8080` (or `wss://` behind a TLS reverse proxy). |
| Publicly exposed relay | Set `RELAY_TOKEN` in `.env` to a random secret. Clients must append `?token=SECRET` to the WebSocket URL (or send `{"type":"auth","token":"SECRET"}` as their first message). |

---

## WebSocket Message Protocol

Clients connect to:

```
ws://HOST:PORT
ws://HOST:PORT?token=YOUR_RELAY_TOKEN   (if RELAY_TOKEN is set)
```

On connection, the client immediately receives sync messages for every user currently
speaking (may be zero messages). Thereafter, state-change messages arrive in real time.

### Message format (server → client, JSON)

| `type` | Meaning | Fields |
|---|---|---|
| `"speaking"` | A user started speaking | `{ type: "speaking", userId: "DISCORD_SNOWFLAKE" }` |
| `"quiet"` | A user stopped speaking | `{ type: "quiet", userId: "DISCORD_SNOWFLAKE" }` |

No messages flow client → server after the optional auth message. Clients should treat
the absence of a `"speaking"` message as equivalent to `"quiet"`.

### Auth via first message (alternative to query param)

If the server has `RELAY_TOKEN` set and the client cannot use a query parameter, it may
send a JSON auth message as its very first message:

```json
{ "type": "auth", "token": "YOUR_RELAY_TOKEN" }
```

Unauthorized connections are closed with WebSocket close code `4401`.

---

## Running Tests

```bash
npm test
```

Tests cover the pure relay logic (authorization, sync messages, dedupe broadcasts) using
Vitest. No Discord token is required — the Discord integration cannot be unit-tested
without a live bot.
