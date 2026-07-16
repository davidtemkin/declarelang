# Check it: verify and the diagnostics

The way you work in Declare is part of the language, not a tool bolted beside it. A program's
URL is the address of everything — the running app by default, `?view=edit` to edit it in the
browser, `?view=reader` to read it as an annotated document, `?render=canvas` to run the same
program on the canvas backend. And when something is wrong, one idea governs what you hear
about it:

> **Verify climbs as far as it can; what reaches you is only what needs you.**

## The ladder

`node tools/verify.mjs app.declare` checks a program by climbing a ladder of rungs, cheapest
first, and stops at the first one that fails:

1. **structure** — does it parse?
2. **resolution** — does every name, tag, and datapath resolve?
3. **analysis** — does it typecheck, and do the constraints' reads have known targets?
4. **boot** — does it construct and settle headlessly?
5. **behavior** — does it do what a drive/expect script says?
6. **visual** — does it match its named baselines?

Cheap rungs run first because a parse error makes a visual diff meaningless. You get the
*first* real problem, not a cascade of downstream noise — the ladder reaches rung 3 only if
rungs 1 and 2 passed, so an error at rung 3 is genuinely about types, not a typo three levels
up masquerading as ten failures.

## The diagnostics name the fix

An error is not a stack trace; it is a sentence that tells you what to do. Misspell a name
and reload:

```
cannot resolve 'kount' — not a member of Text → App, a parameter, or a global [NEO4001] (line 5, col 31)
```

It names the bad token, the scope chain it searched, the code, and the position. Within a
rung, verify reports **every independent error at once**, in source order — you fix a batch
per pass, not one-then-recompile-then-the-next. And you can trust the message: when the first
eval cycle found a program failing because the docs never showed how to draw a border, the
fix was one sentence added to the docs, and the very next run came back clean. The loop works
because the message is true — read it, apply it, recompile.

The command details — flags, JSON output, the CLI surface — live in
[operational/verify](declare-docs:operational:verify). This chapter is the concept: the
ladder is not a gate you fight but a teammate that tells you exactly where you are.

---

**Next:** turning a checked program into something you can deploy — [Ship it](declare-docs:guide:shipping).
