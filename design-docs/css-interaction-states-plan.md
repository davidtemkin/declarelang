# CSS Interaction States (`:hover`/`:active`/`:focus`) — Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD (red → green → commit). Steps are checkboxes.

**Goal:** Add engine-native `:hover`/`:active`/`:focus` to declarelang's standard-CSS engine — reactive state slots the matcher reads, an auto-installed interaction sink for pointer-pseudo-targeted views, and `:focus` via the focus service.

**Spec:** `design-docs/css-interaction-states.md` (implements it).

## Global Constraints

- Build before test: `npm run build`; tests run against `runtime/dist/*.js`.
- Tests append to `test/css.test.mjs`, `await test(...)`, end with the single `summarize("css")`.
- Pure modules (`css-parse`, `css-match`) stay View-free.
- Precedence unchanged: author `$set` > class-dict > CSS(incl. pseudo) > follow > default.
- TDD: failing test → run red → minimal impl → green → commit.

---

## M1 — Parser + matcher (pure)

### Task 1: `pseudo` condition + parse

**Files:** Modify `runtime/src/css-parse.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Flip the existing throw-test + add pseudo parse tests.** In `test/css.test.mjs`, find the test `"parseSelectorText: rejects unsupported combinators/pseudo"` and remove its `a:hover` throw assertion (keep the `a > b` combinator one). Add:

```js
await test("parseSelectorText: pseudo-classes", () => {
  assert.deepEqual(parseSelectorText(".card:hover"), [{ conditions: [
    { kind: "class", name: "card" }, { kind: "pseudo", name: "hover" }] }]);
  assert.deepEqual(parseSelectorText("Button:active"), [{ conditions: [
    { kind: "tag", name: "Button" }, { kind: "pseudo", name: "active" }] }]);
  assert.deepEqual(parseSelectorText("#f:focus"), [{ conditions: [
    { kind: "id", name: "f" }, { kind: "pseudo", name: "focus" }] }]);
  assert.deepEqual(parseSelectorText(".a:hover:focus").at(0).conditions.filter(c => c.kind === "pseudo").length, 2);
  assert.throws(() => parseSelectorText(".a:bogus"), /unsupported/i);
});
await test("specificityOf: pseudo adds 10", () => {
  assert.equal(specificityOf(parseSelectorText(".card:hover")), 20);
  assert.equal(specificityOf(parseSelectorText("view:hover")), 11);
});
```

- [ ] **Step 2: Run red** — `npm run build && node test/css.test.mjs`. Expected: the new tests FAIL (`:` throws / `pseudo` kind absent).

- [ ] **Step 3: Implement.** In `css-parse.ts`, add to the `Condition` union:
```ts
  | { kind: "pseudo"; name: "hover" | "active" | "focus" };
```
Replace the `:` rejection branch in `parseSimple` (the `else if (ch === ":" || ch === ">" …)` — split `:` out):
```ts
    } else if (ch === ":") {
      const m = /^:([\w-]+)/.exec(token.slice(i));
      if (!m || (m[1] !== "hover" && m[1] !== "active" && m[1] !== "focus")) {
        throw new CssUnsupported(`unsupported pseudo-class near '${token.slice(i)}'`);
      }
      conditions.push({ kind: "pseudo", name: m[1] });
      i += m[0].length;
    } else if (ch === ">" || ch === "+" || ch === "~") {
      throw new CssUnsupported(`unsupported selector feature '${ch}'`);
    } else {
```
(`specificityOf`'s `else → 10` already gives pseudo +10 — no change.)

- [ ] **Step 4: Run green.** Expected: PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/css-parse.ts runtime/dist/css-parse.* test/css.test.mjs && git commit -m "M1: parse :hover/:active/:focus pseudo-classes"`.

### Task 2: matcher — `pseudo`, `forcePointer`, `containsPointerPseudo`

**Files:** Modify `runtime/src/css-match.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Extend `fakeView` + add matcher tests.** Update the shared `fakeView` helper to add `pseudo: (n) => (over.pseudo ?? {})[n]`. Add:

```js
await test("matches: pseudo reads MatchView.pseudo", () => {
  const v = fakeView({ styleclass: "card", pseudo: { hover: true } });
  assert.equal(matches(v, parseSelectorText(".card:hover")), true);
  assert.equal(matches(fakeView({ styleclass: "card" }), parseSelectorText(".card:hover")), false);
});
await test("matches forcePointer + containsPointerPseudo", () => {
  const v = fakeView({ styleclass: "card" }); // hover NOT set
  assert.equal(matches(v, parseSelectorText(".card:hover")), false);
  assert.equal(matches(v, parseSelectorText(".card:hover"), true), true);   // forced
  assert.equal(matches(v, parseSelectorText(".card:focus"), true), false);  // focus not forced
  assert.equal(containsPointerPseudo(parseSelectorText(".card:hover")), true);
  assert.equal(containsPointerPseudo(parseSelectorText(".card:focus")), false);
  assert.equal(containsPointerPseudo(parseSelectorText(".card")), false);
});
```
Also import `containsPointerPseudo` in the `css-match` destructure at the top of the M1 section.

- [ ] **Step 2: Run red** — Expected: FAIL (`pseudo` case missing, no `forcePointer`, `containsPointerPseudo` undefined).

- [ ] **Step 3: Implement** in `css-match.ts`:
  (a) `MatchView` gains `pseudo(name: string): boolean`.
  (b) `simpleMatches` and `matches` gain `forcePointer = false`:
```ts
function simpleMatches(view: MatchView, conditions: readonly Condition[], forcePointer = false): boolean {
  for (const c of conditions) {
    // … existing tag/id/class/attr …
    else if (c.kind === "pseudo") {
      if (forcePointer && (c.name === "hover" || c.name === "active")) continue;
      if (!view.pseudo(c.name)) return false;
    }
  }
  return true;
}
export function matches(view: MatchView, sel: SelectorAST, forcePointer = false): boolean {
  // pass forcePointer through to each simpleMatches(...) call
}
export function containsPointerPseudo(sel: SelectorAST): boolean {
  return sel.some((s) => s.conditions.some((c) => c.kind === "pseudo" && (c.name === "hover" || c.name === "active")));
}
```
(Thread `forcePointer` into the ancestor-walk `simpleMatches` calls in `matches` too.)

- [ ] **Step 4: Run green.** Expected: PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/css-match.ts runtime/dist/css-match.* test/css.test.mjs && git commit -m "M1: matcher pseudo + forcePointer + containsPointerPseudo"`.

---

## M2 — Reactive slots + applier adapter

### Task 3: `hovered`/`pressed`/`focused` slots + `pseudo` adapter + tracking in compute/apply

**Files:** Modify `runtime/src/view.ts` (slots), `runtime/src/css-apply.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Write the failing test** (state → re-cascade; revert-to-base; precedence):

```js
await test("pseudo state re-cascades; reverts to base rule; author outranks", () => {
  const v = new View();
  v.styleclass = "card";
  v.cssRules = buildRuleSet(`.card { background-color: #111111 } .card:hover { background-color: #222222 }`);
  settle();
  assert.equal(v.fill, 0x111111);
  v.hovered = true; settle();
  assert.equal(v.fill, 0x222222);          // :hover (spec 20) wins
  v.hovered = false; settle();
  assert.equal(v.fill, 0x111111);          // reverts to base .card, not default
  v.fill = 0x0000ff;                        // author $set
  v.hovered = true; settle();
  assert.equal(v.fill, 0x0000ff);          // author outranks :hover
});
```

- [ ] **Step 2: Run red** — Expected: FAIL (`hovered` not a slot; adapter has no `pseudo`).

- [ ] **Step 3: Implement.**
  (a) `view.ts` — add to `defineAttributes(View, {...})` (near `focusable`):
```ts
  hovered: { def: false },
  pressed: { def: false },
  focused: { def: false },
```
  and declare the fields on the class (`declare hovered: boolean;` etc., near `focusable`).
  (b) `css-apply.ts` — in `asMatchView`, add:
```ts
    pseudo: (name) => (name === "hover" ? v.hovered : name === "active" ? v.pressed : v.focused),
```
  and add `Styled` interface fields `hovered/pressed/focused: boolean`.
  (c) `css-apply.ts` — import `containsPointerPseudo` and `matches` from `css-match.js`; change `compute` to also compute `tracked` and return both, and `apply` to consume it. Since the current `compute` returns `offers` (a record) and `apply` takes `offers`, wrap:
```ts
() => {
  const rules = v.cssRules;
  const offers = Object.create(null);
  let tracked = false;
  if (rules !== null) {
    // … existing matched() loop building offers …
    tracked = rules.rules.some((r) => containsPointerPseudo(r.selector) && matches(asMatchView(v), r.selector, true));
  }
  return { offers, tracked };
},
(result) => {
  const { offers, tracked } = result;
  v.setInteractionTracked?.(tracked);   // optional-chained until Task 4 adds it
  // … existing withdraw/install using offers …
}
```
  (Note: `setInteractionTracked` lands in Task 4; the optional-chain keeps Task 3 green.)

- [ ] **Step 4: Run green** — `npm run build && node test/css.test.mjs`. Expected: PASS.
- [ ] **Step 5: Full suite** — `npm test`. Expected: green (slots are additive; view.ts is core).
- [ ] **Step 6: Commit** — `git add runtime/src/view.ts runtime/src/css-apply.ts runtime/dist/{view,css-apply}.* test/css.test.mjs && git commit -m "M2: hovered/pressed/focused slots + css-apply pseudo adapter + tracking flag"`.

---

## M3 — Pointer wiring + auto-sink

### Task 4: `refreshInputSink` + combined sink + `setInteractionTracked`

**Files:** Modify `runtime/src/view.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Write the failing test** (drive the sink directly — no browser):

```js
await test("interaction sink sets hovered/pressed; :hover restyles; drag-off keeps pressed", () => {
  const v = new View();
  v.styleclass = "card";
  const root = new View(); root.appendChild(v);
  root.cssRules = buildRuleSet(`.card { background-color: #111 } .card:hover { background-color: #222 } .card:active { background-color: #333 }`);
  // instantiate path isn't run here; the applier + tracking install via cssRulesArrived.
  // A real surface is needed for setInput; attach a backend:
  // (use the Node-safe backend the unit tests already use — see how test/unit.test.mjs attaches)
  attachForTest(root);                 // helper per unit.test.mjs conventions
  settle();
  const sink = v.surface.__sinkForTest;  // or drive via v's installed sink
  sink("mouseOver", 0, 0); settle(); assert.equal(v.fill, 0x222222);
  sink("mouseDown", 0, 0); settle(); assert.equal(v.fill, 0x333333); // :active (spec 20) ties → source order: last wins
  sink("mouseOut", 0, 0); settle();  assert.equal(v.pressed, true);  // drag-off keeps pressed
  sink("mouseUp", 0, 0); settle();   assert.equal(v.pressed, false);
});
```
> Implementer: `test/unit.test.mjs` defines `mockBackend(log)` (line 579) and retrieves an installed sink from the log as `log.filter(([m]) => m === "setInput")[0][1]` (line 1001). Add a small `mockBackend`/`surf` helper to `css.test.mjs` (copy the pattern), attach `root.attach(mockBackend(log), null)` after `cssRules` is set + settle, then grab the tracked view's sink from the log and drive it. Assert via `v.hovered`/`v.pressed`/`v.fill`.

- [ ] **Step 2: Run red** — Expected: FAIL (`setInteractionTracked`/sink absent).

- [ ] **Step 3: Implement** in `view.ts`:
  (a) A private `interactionTracked = false` field.
  (b) Rework `inputSink()` → `refreshInputSink()`:
```ts
private buildSink(): InputSink | null {
  const self = this as unknown as Record<string, unknown>;
  const hasHandlers = POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function");
  if (!hasHandlers && !this.interactionTracked) return null;
  return (type, x, y) => {
    if (this.interactionTracked) {
      if (type === "mouseOver") this.hovered = true;
      else if (type === "mouseOut") this.hovered = false;
      else if (type === "mouseDown") this.pressed = true;
      else if (type === "mouseUp") this.pressed = false;
    }
    fireEvent(this, type, { x, y });
  };
}
refreshInputSink(): void { this.surface?.setInput(this.buildSink()); }
setInteractionTracked(on: boolean): void {
  if (this.interactionTracked === on) return;
  this.interactionTracked = on;
  if (!on) { this.hovered = false; this.pressed = false; }
  this.refreshInputSink();
}
```
  (c) In `flush` (view.ts ~437), replace the inline `inputSink()`+guard with `this.refreshInputSink();`.
  (d) In `discard`, before teardown, `this.hovered = false; this.pressed = false;`.
  (e) Remove the `?.` in css-apply's `v.setInteractionTracked?.(tracked)` → `v.setInteractionTracked(tracked)` and add `setInteractionTracked` to the `Styled` interface.

- [ ] **Step 4: Run green.** Expected: PASS.
- [ ] **Step 5: Full suite** — `npm test`. Expected: green (input path is core — verify no regression).
- [ ] **Step 6: Commit** — `git add runtime/src/view.ts runtime/src/css-apply.ts runtime/dist/{view,css-apply}.* test/css.test.mjs && git commit -m "M3: interaction sink + setInteractionTracked + refreshInputSink; pointer :hover/:active"`.

### Task 5: real-mouse end-to-end confirmation

- [ ] **Step 1:** Confirm `:hover` restyles the DOM under a **real mouse** — either via the puppeteer perceptual harness (a small fixture app + `page.mouse.move`) or interactively via the Playwright MCP against `demo/css-playground.html` after M5. Assert the hovered view's computed background changes and reverts on leave. (No committed browser test required beyond M5's demo verification; the sink logic is already covered in Task 4.)

---

## M4 — Focus

### Task 6: `focused` via `FocusService` + `:focus`

**Files:** Modify `runtime/src/focus.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Write the failing test:**

```js
await test(":focus matches a focusable view via the focus service", () => {
  const v = new View();
  v.styleclass = "field"; v.focusable = true; v.visible = true;
  const root = new View(); root.appendChild(v);
  root.cssRules = buildRuleSet(`.field { background-color: #111 } .field:focus { background-color: #444 }`);
  attachForTest(root); settle();
  Focus.setRoot(root); Focus.focus(v); settle();
  assert.equal(v.fill, 0x444444);
  Focus.focus(null); settle();
  assert.equal(v.fill, 0x111111);
});
```
> Import `Focus`/`FocusService` per `test/unit.test.mjs` (it imports `Focus`).

- [ ] **Step 2: Run red** — Expected: FAIL (`focused` never set → `:focus` never matches).

- [ ] **Step 3: Implement** in `focus.ts` `focus(view)`: after computing `old`/`current`, add `if (old !== null) old.focused = false;` and `if (view !== null) view.focused = true;` (alongside the existing `focusChanged` calls). In `reset()`, nothing extra needed (views recreated).

- [ ] **Step 4: Run green.** Expected: PASS.
- [ ] **Step 5: Full suite** — `npm test`. Expected: green (focus is core).
- [ ] **Step 6: Commit** — `git add runtime/src/focus.ts runtime/dist/focus.* test/css.test.mjs && git commit -m "M4: :focus via FocusService setting the focused slot"`.

---

## M5 — Demo

### Task 7: replace the playground hover hack with real `:hover`/`:active`

**Files:** Modify `demo/css-playground.html`.

- [ ] **Step 1:** Delete the JS hover block (`addHover`/`dropHover`/`let hovered`/the host `pointermove`/`pointerleave` listeners). Keep everything else.
- [ ] **Step 2:** In each of the three SKIN strings, rewrite `.card.hover { … }` → `.card:hover { … }`, and add a `.card:active { … }` rule (a slightly stronger press color). Update the "Selectors seen here" copy to list `:hover`/`:active`. Leave the top `<style>` block's `button.skin:hover` (real DOM control CSS) untouched.
- [ ] **Step 3:** Serve + verify with a **real mouse** (Playwright MCP / puppeteer): hover a card → it restyles via `.card:hover`; press → `.card:active`; leave → reverts. Screenshot.
- [ ] **Step 4: Commit** — `git add demo/css-playground.html && git commit -m "M5: demo uses engine-native .card:hover/.card:active (delete the JS hover hack)"`.

### Task 8: milestone review + land on PR #3

- [ ] **Step 1:** `npm test` — all green.
- [ ] **Step 2:** Request code review (superpowers:requesting-code-review) over the interaction-states commits; apply Critical/Important findings.
- [ ] **Step 3:** Merge `feat/css-interaction-states` into `feat/css-engine` (fast-forward) and push → **updates PR #3**.

---

## Self-review

**Coverage:** parse (Task 1), matcher + forcePointer + containsPointerPseudo (Task 2), slots + adapter + tracking flag (Task 3), sink + setInteractionTracked + state machine (Task 4), real-mouse (Task 5), focus (Task 6), demo (Task 7), land (Task 8). All spec decisions have a task: `:active` drag-off (Task 4 test), stale-state clear (Task 4 impl), compute/apply split + idempotent (Task 3/4), focus in FocusService (Task 6), forcePointer/containsPointerPseudo (Task 2).

**Type/name consistency:** `pseudo` condition, `MatchView.pseudo`, `matches(…, forcePointer)`, `containsPointerPseudo`, `hovered`/`pressed`/`focused`, `setInteractionTracked`/`refreshInputSink`/`buildSink` — consistent across tasks.

**Known risks flagged inline:** Task 4's `attachForTest`/sink-access must match the real Node-safe backend API (`test/unit.test.mjs`); Task 3's `setInteractionTracked?.` optional-chain bridges until Task 4.
