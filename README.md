# Muffler

Ducks your Foundry VTT audio while other people are talking in a Discord voice channel.

## How it works

Two parts:

1. **A self-hosted Discord bot + WebSocket relay** (`bot/`) — joins a voice channel on a slash
   command and relays per-user speaking state. See `bot/README.md` for setup.
2. **This Foundry module** — connects to the relay and ducks the music and environment audio on
   each player's own machine while others speak. Ducking is transient: it scales the audio
   output gain and never changes your saved volume, so disconnecting mid-duck leaves nothing
   lowered.

Direct Discord access from a browser is blocked (origin allowlist + gated voice scopes), so the
self-hosted bot is required.

## Install (module)

Place this folder in your Foundry `Data/modules/`, build it (`npm install && npm run build`),
and enable **Muffler** in your world. A packaged release is not yet published.

## Settings (per player, client-scoped)

- **Enable ducking** — master toggle.
- **Relay URL** — the bot relay WebSocket, e.g. `ws://your-host:8080`.
- **Relay token** — only if the relay was started with one.
- **Don't duck for my own voice** + **My Discord user ID** — self-exclusion. Resolves your ID
  from this field, then the GM's mapping; if neither is set, all speakers duck.
- **Duck level / Attack / Release / Hold** — how far and how fast audio ducks.

GMs can map Foundry users to Discord IDs via **Configure Settings → Muffler → Edit user
mapping** (used as the self-exclusion fallback).

## Deployment

The relay must be reachable from each player's browser. On a LAN, point Relay URL at the host's
`ip:port`. For remote-hosted Foundry, expose the relay (port-forward or tunnel) and set a relay
token. See `bot/README.md`.
