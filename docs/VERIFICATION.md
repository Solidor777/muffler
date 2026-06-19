# Manual Verification — Bot ↔ Discord

The Foundry-side ducking is covered by automated e2e (`test/e2e/duck.spec.js`,
`test/e2e/self-exclude.spec.js`). The live Discord path needs a real bot and voice channel and
is verified with this checklist.

## Setup

1. Create a Discord application + bot at <https://discord.com/developers/applications>.
2. Copy the bot token, the application ID, and your server (guild) ID.
3. Invite the bot with scopes `bot applications.commands` and the **Connect** voice permission.
4. In `bot/`, copy `.env.example` to `.env` and fill `DISCORD_TOKEN`, `DISCORD_APP_ID`,
   `DISCORD_GUILD_ID`, `WS_PORT` (default 8080), and optionally `RELAY_TOKEN`.
5. `cd bot && npm install && npm start`. Confirm the log shows the bot logged in and the relay
   listening.

## Smoke test

- [ ] In a Foundry client, set **Relay URL** to `ws://<host>:<WS_PORT>` (and the token if set)
      and enable ducking. The notification "Muffler: relay connected" appears.
- [ ] Join a Discord voice channel and run `/muffler join`. The bot replies that it joined.
- [ ] Another person speaks → that client's music/ambient audio ducks; they stop → it restores
      after the hold/release.
- [ ] With self-exclusion on and your Discord ID set, your own speech does not duck your audio.
- [ ] Run `/muffler leave` → any active duck releases.
- [ ] A non-manager member cannot see or run `/muffler` (restricted to Manage Channels).

## Result

_Record the outcome and any duck level/timing tuning here once the smoke test has run._
