# The standing model

Reactivity and continuity — the central idea the whole language is arranged
around.

### TENET-1 — A binding is a standing relationship the runtime keeps true
Read a reactive value inside a binding and you are subscribed; assign to one and
everything bound to it updates. That is the defining idea, and it holds with no
re-render, no diffing, no dependency array, and no hook — the relationship is
kept true for you, not re-run by you.
*Held in:* declare.md §1.

### TENET-2 — Reactivity is derived by the compiler, not guessed at runtime
The compiler works out what every binding depends on, statically. Behavior is
therefore predictable and analyzable by tools rather than discovered as the
program runs — the model reasons about exactly what the compiler verifies.
*Held in:* FAQ ("reactivity is *derived by the compiler*, not guessed at runtime"); the "why" essay.

### TENET-3 — Continuity is the grain, not the garnish
Layout, states, springs, and data all derive from the same constraints, so a view
doesn't switch so much as *become* the next one — and the continuous version of
an interface is often *less* code than the discrete one. The prized, usually
bespoke layer of UX moves into the declarative, analyzable layer.
*Held in:* declare.md §1 ("continuity is the grain, not the garnish"); the "why" essay ("Declare makes continuity the grain, not the garnish").

### TENET-4 — Motion, layout, and modes are all just values
Motion is physics on an attribute — a `Spring` toward where a thing belongs, with
interruption just the target changing. Layout is a reactive slot you can swap,
derive, or animate. A mode is a reversible bundle of overrides that cannot leak,
so modes compose and interrupt cleanly.
*Held in:* declare.md §1, §5, §8.

### TENET-5 — State derives from data and location, not from control flow
Screens follow data state (`shown = { data.loaded }`), not navigation code. There
is no router object: `location` is an attribute wired to the URL fragment, and
state *derives* from it the same way everything else derives — a deep link is
just an initial value.
*Held in:* declare.md §7; FAQ ("There's no router object — location is an attribute, like everything else").
