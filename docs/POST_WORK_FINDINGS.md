# Post-Work Findings

Living record of post-work review issues, gotchas, and things that deserve attention.
Not a to-do list.

## Verified live

The duck path is verified end-to-end against a running v14 world by `test/e2e/duck.spec.js`:
a mock relay drives speaking/quiet, and the real `game.audio.music` + `environment` buses
duck and restore. This confirms the relay client, self-exclusion resolve, settings wiring,
and the disconnect-safe `game.audio` gain mechanism work live.

## Still verified manually only

- **`MappingMenu` settings menu:** the render-override shim (a settings menu whose `render()`
  opens a DialogV2 instead of an app frame) is not exercised by the e2e — confirm on first GM
  use.
- **Bot ↔ Discord:** requires a Discord application + bot token and a voice channel; tested
  manually per `bot/README.md`. The relay's pure logic has unit coverage (21 tests).

## game.audio ducking mechanism (v14)

`game.audio.music` and `game.audio.environment` are `AudioContext`s with a `.gainNode`
master GainNode; they are created once on the first user gesture and never recreated. The
engine ducks by ramping `ctx.gainNode.gain` via `setTargetAtTime`, reading the base from the
client settings `core.globalPlaylistVolume` / `core.globalAmbientVolume` but **never writing
them** — so a mid-duck disconnect/reload leaves nothing lowered.

Gotcha: moving a volume slider or toggling global mute fires
`globalPlaylistVolumeChanged` / `globalAmbientVolumeChanged`, whose core handler overwrites
the bus gain. The engine listens for those hooks and re-applies an active duck; without this,
a slider move mid-duck would cancel the duck.

## Approximation

The `attackMs`/`releaseMs` settings are used directly as the `setTargetAtTime` time constant
(seconds). The exponential approach reaches ~95% in ~3× that value, so perceived duck/restore
is a few times the configured number — tune the defaults against feel during live testing.
