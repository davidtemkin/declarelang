# When it misbehaves
<!-- index: compiles but wrong: verify, explain, explainHit, the wake trace -->

**Use when** the program compiles but does the wrong thing: a value that won't update,
a click that lands nowhere, a view in the wrong place, a list that doesn't follow.

```
npx declare-verify my-apps/todo/todo.declare            # rungs 1–4: structure → boot, every error at once
npx declare-verify my-apps/todo/todo.declare --assert my-apps/todo/tests/assert.mjs   # 5: real input
```

```js
// in the page's console, or through a driven browser
__declare.inspect("app.list")                     // the subtree as data: geometry, values, children
__declare.explain("app.list.0.t", "text")         // WHY it holds that value: the expression, what it read, their values
__declare.explainHit(120, 80)                     // what a press at that point actually lands on
__declare.slots("app.card")                       // every attribute, its value, and its origin
__declare.trace.start(32); /* do the thing */ __declare.trace.text()   // what changed, and which rule changed it
```

**Rules**
- A clean compile means the checker found nothing, not that nothing is wrong: layout,
  fonts, paint and input don't exist until it runs. Stop re-reading the source and
  **ask the running program**.
- Each diagnostic names its fix: apply exactly that, change nothing else, re-check.
  Fix the whole list the checker reports, not one error per run.
- A value that won't update: `explain` shows what its constraint actually read. Usually
  it read something else than you meant, or it's a formula you assigned over.
- A click that does nothing: `explainHit(x, y)` names what takes the press, usually an
  invisible box, a scroller, or a drag ghost without `pointerEvents = "none"`.
- Something changes and you don't know why: the wake trace lists each settle's origin,
  what code wrote, and what followed, with the rule for each.
- Paths are dotted from the root: named members, else child index (`app.list.3.title`).
- A production build ships the bridge as a stub; verify a dev build, or `declarec --debug`.

**Look up** `docs/operational/introspection.md` (the whole bridge), `docs/operational/verify.md`
(the rungs, `--assert`, `--states`).

**Examples** `apps/desktop/tests/assert.mjs`: an R5 script driving real input ·
`apps/calendar/tests/states.mjs`: named visual states.

**Guide** Running and checking § Debugging a running program.
