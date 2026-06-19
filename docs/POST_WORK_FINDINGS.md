# Post-Work Findings

Living record of post-work review issues, gotchas, and things that deserve attention.
Not a to-do list.

## Verified live

Against a running v14 world: the duck path (`test/e2e/duck.spec.js`), self-exclusion
(`self-exclude.spec.js` — own ID does not duck, others do), and the GM mapping dialog
(`mapping.spec.js` — fill, save, persist). These confirm the relay client + `DuckController`,
the self-exclusion resolve, settings wiring, and the disconnect-safe `game.audio` gain
mechanism work live. Disconnect-release is unit-tested (`controller.test.js`,
`bot/test/reset.test.js`).

## Still verified manually only

- **Settings-menu button:** the e2e opens the mapping dialog via `api.openMappingDialog()`;
  the `MappingMenu` render-override shim (the button under Configure Settings) is exercised on
  first GM use, not by the e2e.
- **Bot ↔ Discord:** the real voice → bot → relay link requires a Discord application + bot
  token and a voice channel — see `docs/VERIFICATION.md`. The relay's pure logic and `reset()`
  have unit coverage.

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
