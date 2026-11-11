// KEYBOARD FOLLOWS FOCUS, headless (docs/system-design/keyboard-follows-focus.md).
// A page can run more than one program — the top-level one and the tenants of its
// islands — over one keyboard. Pins:
//   - nothing focused: the top-level program has the keyboard;
//   - focus on an island hands it to the island's tenant; focus on a host view, back;
//   - Keyboard.isDown answers for the asking body's program;
//   - a key held when the keyboard moves is released to the program that had it,
//     and is no program's after;
//   - focusing an island whose tenant already holds focus leaves focus there;
//   - a polled key is claimed while a shown view of the keyboard program polls it.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, linkIslandTenant, Keys, Focus } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return app;
}

const HOST = `App [ width = 200, height = 100,
    downs: number = 0,
    keys: KeyListener [ onKeyDown(e: KeyEvent) { app.downs = app.downs + 1 } ],
    held() -> boolean { return Keyboard.isDown("KeyA") },
    isl: DOMIsland [ width = 50, height = 50, focusable = true ],
    btn: View [ x = 60, width = 10, height = 10, focusable = true ],
    ]`;

const TENANT = `App [ width = 50, height = 50,
    downs: number = 0,
    ups: number = 0,
    keys: KeyListener [
        onKeyDown(e: KeyEvent) { app.downs = app.downs + 1 },
        onKeyUp(e: KeyEvent) { app.ups = app.ups + 1 }
        ],
    held() -> boolean { return Keyboard.isDown("KeyA") },
    shift() -> boolean { return Keyboard.isDown("ShiftLeft") },
    game: View [ width = 10, height = 10, focusable = true,
        thrust() -> boolean { return Keyboard.isDown("KeyQ") }
        ],
    ]`;

const key = (code) => ({ code, key: code, shift: false, ctrl: false, alt: false, meta: false, repeat: false });

async function pair() {
  const host = await boot(HOST);
  const tenant = await boot(TENANT);
  const unlink = linkIslandTenant(host.isl, tenant);
  Focus.reset();
  Focus.setRoot(host);
  Keys.clearHeld();
  return { host, tenant, done: () => { unlink(); Keys.clearHeld(); Focus.reset(); } };
}

await test("nothing focused: the top-level program has the keyboard", async () => {
  const { host, tenant, done } = await pair();
  Keys.keyDown(key("KeyX")); Keys.keyUp(key("KeyX"));
  assert.equal(host.downs, 1, "the host's Keys member hears it");
  assert.equal(tenant.downs, 0, "the tenant's does not");
  done();
});

await test("focus on an island hands the keyboard to its tenant, and a host view takes it back", async () => {
  const { host, tenant, done } = await pair();
  Focus.focus(host.isl);
  Keys.keyDown(key("KeyX")); Keys.keyUp(key("KeyX"));
  assert.equal(tenant.downs, 1, "the tenant hears it");
  assert.equal(host.downs, 0, "the host does not");
  Focus.focus(host.btn);
  Keys.keyDown(key("KeyX")); Keys.keyUp(key("KeyX"));
  assert.equal(host.downs, 1, "back with the host");
  assert.equal(tenant.downs, 1, "the tenant hears no more");
  done();
});

await test("Keyboard.isDown answers for the asking body's program", async () => {
  const { host, tenant, done } = await pair();
  Focus.focus(host.isl);
  Keys.keyDown(key("KeyA"));
  assert.equal(tenant.held(), true, "down in the tenant, which has the keyboard");
  assert.equal(host.held(), false, "not down in the host");
  Keys.keyUp(key("KeyA"));
  assert.equal(tenant.held(), false, "released");
  done();
});

await test("a key held as the keyboard moves is released to its program, and is no program's after", async () => {
  const { host, tenant, done } = await pair();
  Focus.focus(host.isl);
  Keys.keyDown(key("KeyA"));
  Focus.focus(host.btn);
  assert.equal(tenant.ups, 1, "the tenant is told the key went up");
  assert.equal(tenant.held(), false, "and it is not down there");
  assert.equal(host.held(), false, "nor in the host, which has the keyboard now");
  Focus.focus(host.isl);
  assert.equal(tenant.held(), false, "nor back in the tenant: a press counts where it went down");
  Keys.keyUp(key("KeyA"));
  assert.equal(tenant.ups, 1, "the real release reaches no program again");
  done();
});

await test("a held modifier is the keyboard's state: every program sees it, and the keyboard moving keeps it", async () => {
  const { host, tenant, done } = await pair();
  Keys.keyDown(key("ShiftLeft"));
  Focus.focus(host.isl);
  assert.equal(tenant.shift(), true, "Shift held before the click into the tenant still reads as held there");
  assert.equal(tenant.ups, 0, "and was not released to anyone");
  Keys.keyUp(key("ShiftLeft"));
  done();
});

await test("focusing an island whose tenant holds focus leaves focus where it is", async () => {
  const { host, tenant, done } = await pair();
  Focus.focus(tenant.game);
  Focus.focus(host.isl);
  assert.equal(Focus.getFocus(), tenant.game, "focus stays inside the tenant");
  Keys.keyDown(key("KeyX")); Keys.keyUp(key("KeyX"));
  assert.equal(tenant.downs, 1, "and the tenant has the keyboard");
  Focus.focus(host.btn);
  assert.equal(Focus.getFocus(), host.btn, "a host view takes focus as ever");
  done();
});

await test("a polled key is claimed while a shown view of the keyboard program polls it", async () => {
  const { host, tenant, done } = await pair();
  tenant.game.thrust();
  assert.equal(Keys.claimed("KeyQ"), false, "the host has the keyboard: the tenant's claim is not live");
  Focus.focus(host.isl);
  assert.equal(Keys.claimed("KeyQ"), true, "the tenant has it: the polling view claims the key");
  assert.equal(Keys.claimed("KeyZ"), false, "a key nobody polls is the browser's");
  tenant.game.visible = false;
  settle();
  assert.equal(Keys.claimed("KeyQ"), false, "a hidden view claims nothing");
  tenant.game.visible = true;
  settle();
  tenant.discard();
  assert.equal(Keys.claimed("KeyQ"), false, "a discarded view's claim is gone");
  done();
});

summarize("keyboard-focus");
