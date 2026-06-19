# Finish Muffler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the project's plan-execution skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the correctness, robustness, verification, and packaging gaps so Muffler is a complete, shippable Discord-ducking module + bot.

**Architecture:** The Foundry module connects to the self-hosted bot relay over WebSocket and ducks `game.audio` while others speak. This plan extracts a testable `DuckController` (so disconnect-release is covered), surfaces connection status, hardens the bot (command permissions, clear-on-leave, voice-reconnect), and adds live e2e for self-exclusion and the mapping menu, plus packaging docs.

**Tech Stack:** Vanilla ES modules + Vite + SCSS (Foundry module); Vitest + Playwright + ESLint/Prettier; Node + discord.js ^14 + @discordjs/voice ^0.18 + ws ^8 (bot).

## Global Constraints

- Foundry VTT v14; `compatibility.verified: "14"`.
- Foundry module is vanilla ESM, no framework, **no dynamic imports** in shipping builds; built by Vite to `dist/`.
- Ducking is **disconnect-safe**: never write the user's saved volume settings; only scale the bus `gainNode`.
- `:global` SCSS selectors forbidden; ESLint + Prettier at `printWidth: 120`.
- Test/e2e artifacts build to `test/build/`; no test code in `dist/`.
- The `bot/` package is separate from the module and never loaded by Foundry; the Vite build and module ESLint ignore it.
- Every function: multi-line JSDoc with typed `@param`/`@returns`. Comments present-tense, current-state only.

## File Structure

- Create `src/duck/controller.js` — owns the speaking set + duck decision; testable in isolation.
- Modify `src/main.js` — use `DuckController`; release on relay disconnect; status notifications.
- Modify `bot/src/relay.js` — add `reset()` (broadcast quiet for all, clear set).
- Modify `bot/src/bot.js` — restrict commands to managers; clear relay on leave; handle voice disconnect.
- Create `src/README.md`… (module `README.md` at repo root) — user-facing setup.
- Tests: `test/unit/controller.test.js`, additions to `bot/test/relay.test.js`, new `test/e2e/self-exclude.spec.js` and `test/e2e/mapping.spec.js`.
- Create `docs/VERIFICATION.md` — the manual bot↔Discord smoke checklist.

---

### Task 1: Extract a testable DuckController and release on disconnect

**Files:**

- Create: `src/duck/controller.js`
- Modify: `src/main.js`
- Test: `test/unit/controller.test.js`

**Interfaces:**

- Consumes: `shouldDuck`, `resolveOwnDiscordId` from `src/duck/resolve.js`; a `DuckEngine` with `setDucked(boolean)`.
- Produces: `class DuckController { constructor(engine); onSpeaking(userId: string): void; onQuiet(userId: string): void; reset(): void }`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/controller.test.js
import { afterEach, describe, expect, it, vi } from "vitest";
import { DuckController } from "../../src/duck/controller.js";

function mockGame(values) {
  globalThis.game = { user: { id: "u1" }, settings: { get: (m, k) => values[k] } };
}

describe("DuckController", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it("ducks when another user speaks and releases when they go quiet", () => {
    mockGame({ selfExclude: false });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("a");
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
    controller.onQuiet("a");
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it("does not duck for the local user's own Discord ID", () => {
    mockGame({ selfExclude: true, ownDiscordId: "me", userMapping: {} });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("me");
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it("reset() clears all speakers and releases the duck", () => {
    mockGame({ selfExclude: false });
    const engine = { setDucked: vi.fn() };
    const controller = new DuckController(engine);
    controller.onSpeaking("a");
    controller.onSpeaking("b");
    engine.setDucked.mockClear();
    controller.reset();
    expect(engine.setDucked).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/controller.test.js`
Expected: FAIL — cannot resolve `../../src/duck/controller.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/duck/controller.js
import { resolveOwnDiscordId, shouldDuck } from "./resolve.js";

/**
 * Tracks the set of currently-speaking Discord users and drives a DuckEngine. Ownership of the
 * speaking set here (rather than in main.js) keeps the duck decision unit-testable, including
 * release-on-disconnect via reset().
 */
export class DuckController {
  /** @type {{setDucked: (ducked: boolean) => void}} The engine to drive. */
  #engine;
  /** @type {Set<string>} Currently-speaking Discord user IDs. */
  #speaking = new Set();

  /**
   * @param {{setDucked: (ducked: boolean) => void}} engine - The duck engine to drive.
   */
  constructor(engine) {
    this.#engine = engine;
  }

  /**
   * Records a user as speaking and recomputes the duck state.
   * @param {string} userId - The speaking Discord user ID.
   * @returns {void}
   */
  onSpeaking(userId) {
    this.#speaking.add(userId);
    this.#recompute();
  }

  /**
   * Records a user as quiet and recomputes the duck state.
   * @param {string} userId - The quiet Discord user ID.
   * @returns {void}
   */
  onQuiet(userId) {
    this.#speaking.delete(userId);
    this.#recompute();
  }

  /**
   * Clears all speaking state and releases the duck. Used when the relay disconnects, since no
   * further "quiet" events will arrive to clear stale speakers.
   * @returns {void}
   */
  reset() {
    this.#speaking.clear();
    this.#recompute();
  }

  /**
   * Recomputes and applies the duck decision from the speaking set and self-exclusion.
   * @returns {void}
   */
  #recompute() {
    this.#engine.setDucked(shouldDuck(this.#speaking, resolveOwnDiscordId()));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/controller.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewire main.js to use the controller and release on disconnect**

In `src/main.js`, replace the module-level `speaking` set and `recompute()` with a `DuckController`, and call `controller.reset()` on disconnect:

```js
// src/main.js — relevant changes
import { DuckController } from "./duck/controller.js";
// remove: import { resolveOwnDiscordId, shouldDuck } from "./duck/resolve.js";
// remove: const speaking = new Set(); and function recompute()

let controller = null; // alongside `engine` and `client`

// in startDucking(), after engine.start():
controller = new DuckController(engine);
client = new RelayClient({
  url,
  token: game.settings.get(MODULE_ID, "relayToken"),
  onSpeaking: (id) => controller.onSpeaking(id),
  onQuiet: (id) => controller.onQuiet(id),
  onStatus: (status) => {
    logger.info(`Relay ${status}.`);
    if (status === "connected") {
      ui.notifications.info("Muffler: relay connected.");
    } else {
      ui.notifications.warn("Muffler: relay disconnected.");
      controller?.reset();
    }
  },
});

// in stopDucking(): controller = null; (after engine = null)
```

- [ ] **Step 6: Run the full module suite + build**

Run: `npm test && npm run build`
Expected: all unit tests pass (including the 3 new controller tests); build clean.

- [ ] **Step 7: Commit**

```bash
git add src/duck/controller.js src/main.js test/unit/controller.test.js
git commit -m "Extract DuckController; release duck and notify on relay disconnect"
```

---

### Task 2: Bot — clear speaking state on leave and voice disconnect

**Files:**

- Modify: `bot/src/relay.js`
- Modify: `bot/src/bot.js`
- Test: `bot/test/relay.test.js`

**Interfaces:**

- Produces: `RelayHandle.reset(): void` — broadcasts `{type:"quiet",userId}` for every speaking user, then clears the set.

- [ ] **Step 1: Write the failing test (append to `bot/test/relay.test.js`)**

```js
import { describe, expect, it, vi } from "vitest";
import { createRelay } from "../src/relay.js";

describe("relay reset", () => {
  it("broadcasts quiet for every speaking user and clears the set", () => {
    const relay = createRelay({ port: 0, token: null });
    const sent = [];
    // Replace broadcast by tracking via a fake client.
    relay.setSpeaking("a", true);
    relay.setSpeaking("b", true);
    const fake = { readyState: 1, send: (m) => sent.push(m) };
    // Access internals via a connected client is not exposed; assert on speakingUsers + a spy.
    const spy = vi.spyOn(relay, "broadcast");
    relay.reset();
    expect(relay.speakingUsers.size).toBe(0);
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ type: "quiet", userId: "a" }));
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ type: "quiet", userId: "b" }));
    relay.close();
    void fake;
    void sent;
  });
});
```

Note: `createRelay({ port: 0 })` binds an ephemeral port; `relay.close()` releases it.

- [ ] **Step 2: Run to verify it fails**

Run: `cd bot && npx vitest run test/relay.test.js`
Expected: FAIL — `relay.reset is not a function`.

- [ ] **Step 3: Implement `reset()` in `bot/src/relay.js`**

Add inside `createRelay`, before the `return`:

```js
/**
 * Clears all speaking state and broadcasts a quiet event for each previously-speaking user,
 * so connected clients release any active duck. Used when the bot leaves a channel or the
 * voice connection drops.
 * @returns {void}
 */
function reset() {
  for (const userId of speakingUsers) {
    broadcast(JSON.stringify({ type: "quiet", userId }));
  }
  speakingUsers.clear();
}
```

Add `reset,` to the returned handle and document it on the `RelayHandle` typedef.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bot && npx vitest run test/relay.test.js`
Expected: PASS (existing 21 + the new reset test).

- [ ] **Step 5: Call reset on leave and voice disconnect in `bot/src/bot.js`**

In the `leave` subcommand, before replying, add `relay.reset();` after `activeConnection.destroy()`. Add a voice-state handler after the connection becomes Ready:

```js
import { VoiceConnectionStatus, entersState } from "@discordjs/voice";

activeConnection.on(VoiceConnectionStatus.Disconnected, async () => {
  try {
    await Promise.race([
      entersState(activeConnection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(activeConnection, VoiceConnectionStatus.Connecting, 5_000),
    ]);
    // Reconnecting — keep the connection.
  } catch {
    activeConnection.destroy();
    activeConnection = null;
    relay.reset();
  }
});
```

- [ ] **Step 6: Commit**

```bash
cd bot && git -C .. add bot/src/relay.js bot/src/bot.js bot/test/relay.test.js
git -C .. commit -m "Bot: clear speaking state on leave and voice disconnect"
```

---

### Task 3: Bot — restrict /muffler to channel managers

**Files:**

- Modify: `bot/src/bot.js`

**Interfaces:** none new.

- [ ] **Step 1: Add a default-member-permission gate to the command**

In `bot/src/bot.js`, import `PermissionFlagsBits` from `discord.js` and chain it onto `mufflerCommand`:

```js
import { Client, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";

const mufflerCommand = new SlashCommandBuilder()
  .setName("muffler")
  .setDescription("Controls Muffler voice channel connection.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
// …existing subcommands…
```

(Correct casing: `.setDescription`.)

- [ ] **Step 2: Verify the command still registers (manual)**

Run: `cd bot && node -e "import('./src/bot.js').then(()=>console.log('import ok'))"`
Expected: prints `import ok` (no syntax error). Full registration is verified in Task 7's smoke test.

- [ ] **Step 3: Commit**

```bash
git -C .. commit -am "Bot: restrict /muffler commands to channel managers"
```

---

### Task 4: Live e2e — self-exclusion

**Files:**

- Create: `test/e2e/self-exclude.spec.js`

**Interfaces:** drives `game.modules.get("muffler").api.startDucking()` against a mock relay, as in `test/e2e/duck.spec.js`.

- [ ] **Step 1: Write the e2e**

Reuse the mock-relay + `joinReadyUnlock` pattern from `test/e2e/duck.spec.js`. Configure `selfExclude=true`, `ownDiscordId="self-1"`, set core volumes to 1. Then:

- broadcast `{type:"speaking",userId:"self-1"}` → assert `game.audio.music.gainNode.gain.value` stays `> 0.8` (no duck for self).
- broadcast `{type:"speaking",userId:"other-1"}` → after 700 ms assert `< 0.5` (ducked by another).
- broadcast quiet for both → after 2500 ms assert `> 0.8` (restored).

Full file mirrors `duck.spec.js`'s structure (server setup/teardown, `joinReadyUnlock`, evaluate blocks). Copy that file and adjust the settings + assertions above.

- [ ] **Step 2: Run live (requires Muffler enabled in a running world)**

Run: `npx playwright test test/e2e/self-exclude.spec.js --timeout=120000 --workers=1`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/self-exclude.spec.js
git commit -m "Add live e2e for self-exclusion"
```

---

### Task 5: Live e2e — GM mapping editor

**Files:**

- Create: `test/e2e/mapping.spec.js`

- [ ] **Step 1: Write the e2e**

After `joinReadyUnlock`, open the mapping dialog via the API and assert it persists:

```js
await page.evaluate(() => globalThis.game.modules.get("muffler").api.openMappingDialog());
const dialog = page.locator("dialog.application.dialog:has(h1.window-title)");
await expect(dialog).toBeVisible();
// Fill the current GM user's row and save.
const userId = await page.evaluate(() => globalThis.game.user.id);
await dialog.locator(`input[name="${userId}"]`).fill("999000");
await dialog.locator('button[data-action="save"]').click();
const mapped = await page.evaluate(() => globalThis.game.settings.get("muffler", "userMapping"));
expect(mapped[userId]).toBe("999000");
// Cleanup: reset the mapping.
await page.evaluate(() => globalThis.game.settings.set("muffler", "userMapping", {}));
```

- [ ] **Step 2: Run live**

Run: `npx playwright test test/e2e/mapping.spec.js --timeout=120000 --workers=1`
Expected: PASS (also confirms the `MappingMenu` dialog path renders).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/mapping.spec.js
git commit -m "Add live e2e for the GM mapping editor"
```

---

### Task 6: Packaging — module README and manifest links

**Files:**

- Create: `README.md` (repo root)
- Modify: `module.json`

- [ ] **Step 1: Write `README.md`**

Cover: what Muffler does; the two parts (module + bot); install the module; point to `bot/README.md` for the bot; the key client settings (Relay URL, token, self-exclusion + own Discord ID, duck level/timing); the deployment caveat (relay must be reachable from each client). Keep it concise and accurate to the shipped behavior.

- [ ] **Step 2: Add manifest metadata to `module.json`**

Add `"url"`, `"readme"`, `"bugs"`, and (when a release host exists) `"manifest"`/`"download"` fields. Until a release host is chosen, set `url`/`readme` to the repo and omit `manifest`/`download` (do not point them at non-existent URLs).

- [ ] **Step 3: Commit**

```bash
git add README.md module.json
git commit -m "Add module README and manifest metadata"
```

---

### Task 7: Manual bot↔Discord smoke verification

**Files:**

- Create: `docs/VERIFICATION.md`

- [ ] **Step 1: Write the checklist**

Document the one path that cannot be automated here: create a Discord application + bot, set `bot/.env` (`DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `WS_PORT`, optional `RELAY_TOKEN`), invite with scopes `bot applications.commands`, `cd bot && npm install && npm start`, run `/muffler join` in a voice channel, point a Foundry client's **Relay URL** at `ws://<host>:<port>`, then: speaking in Discord ducks that client's music/ambient; stopping restores; `/muffler leave` clears the duck. Record pass/fail and any tuning of the duck level/timing.

- [ ] **Step 2: Run the checklist (user-assisted) and record results**

This task is complete when the checklist has been executed once against a live Discord channel and the result recorded in `docs/VERIFICATION.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/VERIFICATION.md
git commit -m "Add bot to Discord manual verification checklist"
```

---

## Self-Review

- **Spec coverage:** relay-disconnect release (Task 1), status surface (Task 1), bot clear-on-leave/disconnect (Task 2), command permissions (Task 3), self-exclusion live (Task 4), mapping menu (Task 5), packaging/docs (Task 6), bot↔Discord verification (Task 7). All identified gaps mapped.
- **Placeholders:** none — code is shown for every code step; manual/e2e tasks reference the concrete pattern file (`duck.spec.js`) to copy.
- **Type consistency:** `DuckController` methods (`onSpeaking`/`onQuiet`/`reset`) match their use in `main.js`; `relay.reset()` matches its use in `bot.js`.

## Notes / sequencing

Tasks 1–3 are code + unit tests (no live Foundry needed). Tasks 4–5 require Muffler enabled in a running world (Playwright, as with `duck.spec.js`). Task 7 requires a Discord app/token and is user-assisted. Task 6 is docs. Recommended order: 1 → 2 → 3 → 6 → 4 → 5 → 7.
