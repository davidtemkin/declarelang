# Get started

Just as SQL is a domain-specific language for querying data, Declare is purpose-built for creating modern UIs. Here is how to run it locally and write your first program — no build step, no scaffold, no config.

## Quick start

<!-- generated:setup-commands -->
```bash
git clone https://github.com/davidtemkin/declarelang.git && cd declarelang
```
Get the repository.

```bash
npm install
```
Install the toolchain's dependencies (TypeScript; esbuild and puppeteer-core for builds and visual tests). The clone ships prebuilt — no build step before first run.

```bash
npm start
```
Start the dev server on http://127.0.0.1:8200/ — browse to any .declare file's URL and the server compiles and returns the running app.

Write a program to my-apps/hello.declare and browse to http://127.0.0.1:8200/my-apps/hello.declare — the program URL is the app's address.
<!-- /generated:setup-commands -->

## The whole model in one program

<!-- generated:flagship-example -->
```declare
App [ width = 400, height = 140, fill = darkslategray, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = royalblue,
        onClick() { count = count + 1 },             // a bare name resolves like the read below
        Text [ x = 16, y = 8, text = "Add one" ],
        ],

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
    ]
```
<!-- /generated:flagship-example -->

Two delimiters carry the whole model: **`[ … ]`** is the view tree — components, attributes, children; **`{ … }`** is TypeScript — a value, a handler body. The `{ }` lines are *constraints*, standing relationships the runtime keeps true: click the view and the text updates, resize and it re-centers — you wrote no update logic for either. (The hand-built button above shows the composition model; a themed `Button` also ships in the small standard library.)

## Where everything is

- [**docs/declare.md**](https://github.com/davidtemkin/declarelang/blob/main/docs/declare.md) — the whole language, in one file, for you and your model.
- [**The guide**](https://github.com/davidtemkin/declarelang/blob/main/docs/guide/00-shape.md) — how to think in Declare, starting from an app just like the one above.
- [**GitHub**](https://github.com/davidtemkin/declarelang) — the full source. The homepage you are reading is itself a Declare app, and every app is editable in the browser.
