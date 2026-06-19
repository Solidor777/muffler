# Muffler — Discord Audio Ducking Design

**Date:** 2026-06-19
**Status:** Approved (design)
**Scope:** A new, standalone Foundry VTT v14 module ("Muffler") plus a self-hosted Discord
bot/relay. Muffler ducks each client's Foundry audio while other people speak in a Discord
voice channel. Separate from Hush (which owns loudness normalization).

## Why a separate module + bot

A Foundry client is a browser context. It cannot reach Discord's IPC pipe, and direct
Discord RPC over the localhost WebSocket is blocked by Discord's `Origin` allowlist and
approval-gated `rpc`/`rpc.voice.read` scopes (verified by the feasibility spike, 2026-06-19;
see Hush's research). The reliable, distributable path is a **self-hosted Discord bot** that
reads voice speaking state at the voice-protocol level (`@discordjs/voice` `receiver.speaking`,
Opcode 5 — unaffected by Discord's Dec-2024 removal of RPC speaking events) and relays it over
a WebSocket the Foundry clients connect to.

## Decisions (fixed)

- **Detection:** self-hosted Discord bot + WebSocket relay. No client-side Discord auth.
- **Bot scope:** the bot joins a voice channel on the slash command `/muffler join` (run by
  the GM in their current channel) and leaves on `/muffler leave`.
- **Relay auth:** token-optional — a shared token is enforced only when configured, otherwise
  the relay is open (LAN trust).
- **Self-exclusion:** a per-user toggle (on/off) plus an optional own Discord ID. When on, the
  local user's own Discord ID resolves as: client setting → GM mapping (`game.user.id` →
  Discord ID) → unresolved. Unresolved (or toggle off) means "duck on everyone."
- **Ducked channels:** music + environment buses (not interface). Applied as a transient
  gain on the audio graph — **disconnect-safe**: never written to the user's saved volume
  settings, so a mid-duck disconnect leaves nothing permanently lowered.
- **Ducking defaults:** target 20% while others talk; attack 150 ms, release 800 ms, hold
  300 ms after the last "quiet".
- **Bot/Foundry decoupling:** the bot knows nothing about Foundry; it only relays Discord
  speaking events. All mapping and ducking logic lives in the Foundry module.
- **Stack:** the Foundry module reuses Hush's vanilla stack (Vite + SCSS, ESM, no framework;
  Vitest + Playwright + ESLint/Prettier). The bot is a separate Node package.

## Repo layout (`modules/muffler`)

```
muffler/
  module.json                 # Foundry manifest -> dist/
  package.json                # module build deps (vite, sass, vitest, @playwright/test, eslint, prettier)
  vite.config.js  vitest.config.js  playwright.config.js  eslint.config.js  .prettierrc
  src/                        # Foundry module (browser, vanilla ESM)
    main.js                   # init/ready hooks; settings; relay connect; module API
    settings.js               # client + world settings; registers the GM mapping menu
    logger.js                 # gated [Muffler] logger
    relay/client.js           # WS connection: connect, token, reconnect/backoff, status, events
    duck/resolve.js           # speaking-set tracking + layered self-ID resolution + duck decision
    duck/engine.js            # duck/restore game.audio with attack/release/hold
    apps/mappingApp.js        # GM editor (DialogV2) for the Foundry-user -> Discord-ID map
    styles/muffler.scss
  lang/en.json
  bot/                        # Node bot + WS relay (NOT loaded by Foundry; own dependency tree)
    package.json              # discord.js, @discordjs/voice, ws
    src/bot.js                # discord.js client; /muffler join|leave; voice connect
    src/relay.js              # ws server; broadcast speaking/quiet; token gate; connect-sync
    src/config.js             # env/config: bot token, app id, guild id, ws port, relay token
    .env.example
    README.md                 # GM setup + deployment (LAN vs remote exposure)
  test/{unit,e2e,build}  dist/
  docs/OPEN_BUGS.md  CLOSED_BUGS.md  TODO.md  POST_WORK_FINDINGS.md
```

`bot/` installs and runs independently of the Foundry module; the Vite build ignores it.
`dist/` and `test/build/` are gitignored.

## Bot + relay (Node)

One process runs the Discord bot and the WS relay.

- **discord.js client** authenticates with a bot token (config/env). Registers guild slash
  commands `/muffler join` (joins the invoking GM's current voice channel) and
  `/muffler leave`. Requires the voice-state intent and the bot added to the server.
- **Voice:** on join, `@discordjs/voice` `joinVoiceChannel` + `connection.receiver.speaking`
  emits `start(userId)` / `end(userId)`. No audio is decoded.
  - Implementation note for planning: reliable `end` events can require subscribing to the
    user's audio stream; verify and, if needed, subscribe-and-discard.
- **Relay (`ws`):** broadcasts `{type:"speaking",userId}` / `{type:"quiet",userId}` to all
  connected clients. On a new connection it sends the current speaking set for late-join sync.
  If a relay token is configured, the client must present it (query param or first message);
  otherwise the relay is open.

## Foundry module (browser)

- **`relay/client.js`:** opens a WebSocket to `relayUrl` (+ token), with reconnect/backoff,
  and surfaces connection status (notification + logger). Emits speaking/quiet to `resolve`.
- **`duck/resolve.js`:** maintains the live set of speaking Discord IDs. Computes the duck
  decision:

  ```
  if (selfExclude is OFF)                 ownId = null            // duck on everyone
  else ownId = clientSetting("ownDiscordId")
       ?? gmMapping[game.user.id]
       ?? null                            // unresolved -> duck on everyone
  duck = speakingSet has any id !== ownId  // ownId null -> duck if set is non-empty
  ```

- **`duck/engine.js`:** on `duck=true`, ramps the music + environment buses toward the target
  over the attack time; on `duck=false`, holds, then ramps back over the release time.
  Non-destructive and **disconnect-safe**: ducking is a transient gain Muffler controls on the
  audio output graph (a Muffler-owned gain node or runtime multiplier on the bus), never a
  write to the user's saved global-volume settings. If the client disconnects or the session
  ends mid-duck, nothing is persisted — the next session starts at full volume. The
  persist-and-restore approach (lowering then restoring the saved global volumes) is
  **rejected**: a mid-duck disconnect would leave the volume permanently lowered.
  - Implementation note (resolved by the `game.audio` spike before build): where to
    insert/control the transient gain on the v14 music/environment buses, how to ramp it
    smoothly (e.g. `GainNode.gain.setTargetAtTime`), and how to cleanly remove it (restore
    gain to unity) on disable/teardown.

## Settings

- **Client scope:** `enabled`, `relayUrl`, `relayToken`, `selfExclude` (boolean),
  `ownDiscordId` (string), `duckTarget` (0–1, default 0.2), `attackMs` (150),
  `releaseMs` (800), `holdMs` (300), `duckChannels` (music + environment).
- **World scope (GM):** the user→Discord-ID mapping, edited via `mappingApp` (a settings-menu
  DialogV2 listing Foundry users with an editable Discord-ID field); optional shared default
  `relayUrl` / `relayToken`.

## Deployment

The relay WS must be reachable from each client's browser. LAN games connect directly to the
GM's host:port. Remote-hosted Foundry requires the GM to expose the relay (port-forward or a
tunnel); the optional token secures a publicly reachable relay. Documented in `bot/README.md`.

## Testing

- **Unit (Vitest):** `resolve.js` self-exclusion + duck-decision matrix (toggle off; own ID
  set; GM mapping fallback; unresolved; multiple speakers incl./excl. self); `engine.js`
  attack/release/hold ramp math (mocked clock + gain target); relay-client event parsing and
  reconnect/backoff (mocked socket).
- **E2E (Playwright):** module loads/active and API exposed; settings present; a mock relay
  (a local `ws` server stood up by the test) drives speaking/quiet and asserts the engine
  ducks/restores the audio buses. The real bot↔Discord path is verified manually with a live
  Discord channel (logged as a manual check).

## Out of scope

- Loudness normalization (Hush).
- Client-side Discord RPC / StreamKit injection (rejected by the feasibility spike).
- Per-user volume preferences beyond the duck target/timing.
- Hosting/orchestration of the bot (the GM runs it; we ship code + docs).

## Open items to confirm

- None outstanding; defaults confirmed in brainstorming.

## Documentation updates (required final step)

- On implementation, keep `docs/TODO.md`, `OPEN_BUGS.md`, `CLOSED_BUGS.md`, and
  `POST_WORK_FINDINGS.md` current. The v14 `game.audio` ducking mechanism and the
  `@discordjs/voice` `end`-event reliability are the two items to resolve and record.

```

```
