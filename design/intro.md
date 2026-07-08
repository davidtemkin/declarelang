# neo-LZX — what it is, and why

A small declarative language for building **application UIs**. You compose components, bind them to data, and handle events. Structure, data-binding, and reactivity are declarative; all logic is ordinary **TypeScript**.

## Why

A modern app UI carries a lot of machinery the framework can't see for you: effect dependency arrays, memoization, list keys, stores, manual subscribe/unsubscribe. neo-LZX makes the parts that *should* be declarative — structure, data binding, reactivity, event subscription — actually declarative, and leaves only real logic to TypeScript. A binding isn't a function you remember to re-run; it's a standing relationship the runtime keeps true.

It targets what you'd otherwise build in React, Vue, Svelte, or SwiftUI — forms, lists, dashboards, editors, tools. (It's a modern take on OpenLaszlo, a 2000s framework that had this model — components-as-classes, automatic constraints, declarative data binding — years early, on the wrong runtime.)

## The gist (everything else should read for itself)

- `[ … ]` holds a component's members (attributes, children, methods); `{ … }` is TypeScript. A bare value is a literal (`white`, `100%`, `12`).
- `name = { expr }` is a **constraint** — a live expression that re-runs whenever its inputs change.
- `:path` reads bound data (`:now.temp`); a node on an array path (`:list[]`) **replicates**, one instance per element.
- `on<event>() { … }` handles an event; `evt(a) <- Source { … }` subscribes to an external one. Components are classes: `class X extends View [ … ]`.

## Runtime

It runs on the DOM today. A far faster, lighter own-pixels (canvas) runtime is in progress — **with no change to the language**: same syntax, same semantics, same programs.

## See it

The included `weather.neolzx` is a complete tabbed weather app — data binding, list replication, animation, keyboard navigation. Read it; it should mostly explain itself.
