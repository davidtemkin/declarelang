# Eval runs, the page

`runs.declare` shows every timed craft run: minutes (reading, writing, checking), turns by
what came before each, tokens (output and thinking) and pace, by date or grouped by app, with
the chosen run's figures and a table of every run. It reads `runs.json`.

## Updating it

```bash
python3 -I evals/craft/runs.py --json > evals/dashboard/runs.json    # after a run's timing record is filed
node tools/declarec.mjs evals/dashboard/runs.declare --kernel=js -o <out>
```

Publish `<out>/app.<hash>.js` and `runs.json` beside a small page that imports the script
(`boot({ main: "./runs.declare" })`), with a `<title>` and a body background that follows
light and dark. The JavaScript kernel keeps the page free of WebAssembly, which an embedding
page's security policy may refuse.

## How it is built, and what building it found

Each run is a view, not a mark in a drawing: a bar is a `Control` with its own press, tooltip
and accessibility label; its five segments spring to the chosen measure's heights; the bars
are replicated from a derived dataset, and their layout is a `TweenLayout`, so a filter or a
change of order glides them. Only the gridlines are drawn.

Built by Claude on 2026-11-14 as a small eval of its own: one session, the SKILL's reading
first. Two refusals on the way, both of the program's names:

- **A class named `Axis`** took the name of Declare's own `Axis` type (`x | y`). The errors
  appeared in library files ("SimpleLayout.axis expects a Axis…") instead of at the class.
  **Fixed:** such a class is kept out of name resolution, its uses are not reported again,
  and the typecheck says why at the declaration (DECLARE4015), as it already did for
  `Color` or `Cupertino` (`runtime/src/program-schema.ts`, `check.ts`; `unit.test`).
- **A method named `appName`**, which is an App attribute: refused at once, naming both.
  One step.

Everything else held on the first compile: the derived dataset, the springs, the layout,
the scrolling pane on a phone, the `DataGrid`.
