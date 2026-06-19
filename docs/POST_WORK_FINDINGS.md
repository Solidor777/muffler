# Post-Work Findings

Living record of post-work review issues, gotchas, and things that deserve attention.
Not a to-do list.

## Not yet verified live (build complete, unit-tested only)

Muffler was just created while Foundry was already running, so the server has not scanned the
new module. To verify in-app: restart Foundry (so it detects `modules/muffler`), enable
Muffler in the world, then reload. Two paths remain unverified against a live instance:

- **Foundry-coupled glue:** the `game.audio` ducking, the `MappingMenu` render-override shim
  (a settings menu whose `render()` opens a DialogV2 instead of an app frame), and the
  settings registration. The duck e2e (`test/e2e/duck.spec.js`) drives a mock relay against
  the real `game.audio` buses and is ready to run once the module is enabled.
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
