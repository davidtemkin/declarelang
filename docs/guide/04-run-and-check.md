<!-- nav: Running and checking -->
<!-- part: Start here -->

# Running and checking a program

The examples in this guide run in the page. This chapter is how to run your own
programs, read what the compiler tells you, and check that a program does what you
meant. It comes this early because everything after it is easier with the loop in hand:
edit, run, read the error, apply the fix.

> **A program's URL is its address — for running it, editing it, reading it, and
> checking what a crawler sees.**

## Running a program

Clone the repository and start the dev server:

```bash
git clone https://github.com/davidtemkin/declarelang.git && cd declarelang
npm install
npm start
```

The server prints its address, `http://127.0.0.1:8200/` by default. Write a program to
`my-apps/hello.declare` and browse to `http://127.0.0.1:8200/my-apps/hello.declare`. The
server compiles the file and returns the running app. There is no build step, no
project scaffold and no configuration: edit the file, reload, and the change is there.
A directory whose program shares its name is the same address in short form —
`…/apps/calendar/` means `…/apps/calendar/calendar.declare`. The
[getting-started page](declare-docs:operational:getting-started) has the details.

To run the dev server from your own project instead of the repository, add the package
as a dependency and run `npx declare-dev` from the project directory;
[Embedding Declare in a project](declare-docs:operational:embedding) covers the setup.

The same address answers a few requests, each a query on the URL:

| append | you get |
|---|---|
| `?viewer=edit` | a live editor beside the running program |
| `?viewer=reader` | the source as a highlighted, readable document |
| `?render=canvas` | the program drawn to a single canvas instead of DOM elements ([Renderers and hosts](declare-docs:guide:renderers)) |
| `?inspector` | the Inspector, open over the running program (also **⌥⌘D**) |
| `?extract` | the HTML a crawler reads ([Packaging for production](declare-docs:guide:packaging)) |

## Reading an error

Every compiler message has the same parts: what is wrong, where, and — for the
mistakes the compiler anticipates — what to write instead. Here is one a CSS habit
produces:

```
Text has no attribute 'color' — the CSS instinct: text color is 'textColor'
(a provided value — set it on a container to cascade) [DECLARE2000] (line 2, col 28)
```

Trust the message and apply the fix it names; that habit is worth more than any
chapter here. The code in brackets identifies the family of error. `npx declare-help`
answers any code, class or attribute from the command line:

```bash
npx declare-help DECLARE7001      # an error code
npx declare-help Slider.value     # an attribute, with its type, default and notes
npx declare-help textColor        # every class that carries it
```

Every error in a compile is reported at once, in source order, so you can fix several
in one pass.

## Checking a program: `declare-verify`

`npx declare-verify app.declare` is the edit-run-read loop as a single command. It
climbs a ladder, cheapest rung first, and reports the first real problem instead of a
cascade of consequences:

1. **structure** — does it parse?
2. **resolution** — does every name, tag and data path resolve?
3. **analysis** — does every `{ }` typecheck, with every constraint's reads known?
4. **boot** — does it construct and settle, headlessly?
5. **behavior** — does it do what a drive-and-assert script says?
6. **visual** — does it match its named screenshots?

The first four need no browser and no flags. The last two are worth adding once a
program does something. A behavior script drives the real app and asserts by **view
path** rather than by DOM selector, so it keeps working whatever renderer draws the
view:

```js
// checks.mjs — npx declare-verify app.declare --assert checks.mjs
export default async ({ drive, expect }) => {
  await drive.click("app.card.add");
  await drive.settleMotion();                   // run any motion to rest, frame-exact
  await expect.text("app.card.count", "1 open");
};
```

`settleMotion` takes the app's clock and runs animation to rest deterministically, so a
spring's end state can be asserted at all.

## When it checks clean and still misbehaves

A green rung means that rung found nothing. The first four run without a browser —
approximate text metrics, no real layout engine, no input routing — so some problems
are invisible to them: a transparent view swallowing clicks, a size that only goes
wrong with real fonts. When the checker is happy and the program is not, stop
re-reading the source and **ask the running program**. In the page's console:

```js
__declare.explain("app.card.list", "height")
// → the expression, every value it read, and their current values
```

The Inspector (**⌥⌘D**, or `?inspector`) is the same answer with a face: click a value
to see what produced it, pick a view to see which one a click actually reaches, and
type an expression to see what it evaluates to right now.
[Introspection](declare-docs:operational:introspection) documents the whole surface.

## Formatting

There is one canonical layout for Declare source, and `npx declare-format --write
app.declare` produces it. It never reorders your attributes or re-wraps your lines; it
fixes indentation, commas and spacing. `--check` makes it a CI gate.
[Formatting](declare-docs:guide:formatting) is the appendix with the rules.

---

**What you can now do:** run any program from its URL, read an error and apply its
fix, check a program up the six rungs, and question a running program when reading its
source is not enough.

[Next: **Components and the tree** →](declare-docs:guide:components)
