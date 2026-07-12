// Page copy and the four editable demo programs. The prose is transcribed from the
// rendered page; the demo seeds are the .declare programs the editors start with
// (needed verbatim so the live compile + preview reproduce the originals).

export const hero = {
  word: "Declare",
  rest: "is the UI language for the AI era.",
  lead: "A declarative language for real, dynamic web apps — reactive by construction, compiled live in the browser, small enough to hold in your head. This whole page is written in it.",
  actions: [
    { label: "GitHub →", href: "https://github.com/davidtemkin/declarelang", primary: true },
    { label: "Edit this page →", href: "#source" },
  ],
};

export const quoteLegible = {
  text: "Everything that makes it legible to a model makes it legible to you.",
  mono: "The declarative layer is Declare. The logic is ordinary, typed TypeScript — nothing to relearn, and everything an editor or a model already understands.",
};

export const sectionRead = {
  num: "01",
  title: "Read it. Generate it. Run it.",
  desc: "The relationships that matter — structure, data, reactivity — are explicit in the language, not hidden in imperative steps or a runtime graph.",
  cards: [
    { title: "Analyzable", body: "The compiler reads a program’s data-flow statically. So can a model." },
    { title: "Generable", body: "No ceremony, no magic. No dependency arrays or keys to get subtly wrong." },
    { title: "Runnable", body: "It compiles in the browser. Generated code runs the instant it exists." },
  ],
};

export const sectionSmall = {
  num: "02",
  title: "Small. Fast. Renderer-independent.",
  stats: [
    { num: "≈ 54 KB", cap: "over the wire, gzipped — vs the 2.3 MB median page" },
    { num: "354", cap: "lines of Declare — this entire page" },
  ],
  cols: [
    { title: "Small", body: "the whole thing — runtime, your app, and a compiler — is smaller than most sites' hero image." },
    { title: "Fast reactivity", body: "dependencies are compiled statically, not tracked at runtime — no reactive-graph tax." },
    { title: "Renderer-independent", body: "The same program paints to the DOM or to a canvas — your choice — so you can reach for raw pixel speed exactly where it matters." },
  ],
};

export const closing = {
  a: "The previous generation of frameworks were built on top of the browser’s document-oriented core.",
  b: "Declare is different: app-focused, cleaner, faster, and ready for what comes next.",
  sub: "That difference is render independence: one program, painted to the DOM or a canvas — your choice today, WebGL on the horizon — and no rewrite, no code changes. You declare what the UI is; the runtime decides how to draw it.",
};

// --- Editable demo programs (verbatim seeds) ---

export const demos = [
  {
    key: "reactivity",
    num: "03",
    title: "Declare it. It runs. It stays true.",
    desc: "A binding isn’t a callback you remember to re-run — it’s a standing relationship the runtime keeps true, re-derived the moment its inputs change.",
    note: "Three bindings track one value: the big number, the bar’s width, and its color. Click to bump v — all three update together, and the color crosses cool to warm at the halfway mark.",
    caption: "Reactive constraints · One value, many bindings · Click the preview",
    file: "reactivity.declare",
    seed: `App [ textColor = whitesmoke,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = turquoise,
    onMouseDown() { v = (v + 17) % 100 },
    View [ x = 28, y = 26, layout: SimpleLayout [ axis = y, spacing = 18 ],
        Text [ textColor = slategray, text = "click anywhere to change v" ],
        Text [ fontSize = 72, fontWeight = bold, text = { v + "" } ],
        Bar [ width = 300, value = { v },
              tint = { v < 50 ? cool : warm } ] ],
    ]
`,
  },
  {
    key: "components",
    num: "04",
    title: "Declare the shape, not the loop.",
    desc: "A view can be built from data instead of laid out by hand — the shape written once, the data deciding how many there are and what each one says.",
    note: "One Bar, instanced once per row of the data. Edit a number or add a row and the list rebuilds itself — no loop, no keys. And Bar is auto-included: no import, no definition, just use it.",
    caption: "Components & data · One Bar per record · Data drives the view",
    file: "components.declare",
    seed: `App [ facts: Dataset { { "rows": [
        { "label": "reactive", "n": 92 },
        { "label": "compiled", "n": 78 },
        { "label": "small",    "n": 64 } ] } },
    View [ x = 28, y = 26, datapath = { parent.facts.value },
           layout: SimpleLayout [ axis = y, spacing = 16 ],
        Bar [ width = 300, datapath = :rows[], label = :label, value = :n ] ],
    ]
`,
  },
  {
    key: "spring",
    num: "05",
    title: "Motion you declare, not schedule.",
    desc: "You say where a thing belongs; a Spring finds the path there and settles by physics — motion you declare, not a timeline you sequence.",
    note: "Click to toggle the ball’s target between two positions. The Spring follows and settles by physics — no timeline, no frames driven by hand.",
    caption: "Declarative motion · A Spring follows a reactive target · Click to toggle",
    file: "spring.declare",
    seed: `App [ on: boolean = false,
    onMouseDown() { on = !on },
    View [ x = 28, y = 26, layout: SimpleLayout [ axis = y, spacing = 24 ],
        Text [ textColor = slategray, text = "click anywhere to toggle" ],
        View [ height = 64, width = 64, cornerRadius = 32, fill = dodgerblue,
            Spring [ attribute = x, to = { on ? 240 : 0 },
                     stiffness = 190, damping = 17 ] ] ],
    ]
`,
  },
  {
    key: "states",
    num: "06",
    title: "Declared states, not manual wiring.",
    desc: "A State is a named bundle of overrides — a whole configuration you can apply as one. The mode is the unit of change, not each property by hand.",
    note: "Click to flip one boolean. The card’s height, its color, and an extra line of text swap in together — and revert the instant the mode turns off.",
    caption: "Declarative states · One boolean, one bundle of overrides · Click to toggle",
    file: "states.declare",
    seed: `App [ textColor = whitesmoke,
    open: boolean = false,
    onMouseDown() { open = !open },
    card: View [ x = 28, y = 26, width = 300, height = 72,
                 cornerRadius = 10, fill = midnightblue,
        Text [ x = 16, y = 16, fontWeight = bold, text = "Summary" ],
        big: State [ applied = { open }, height = 184, fill = steelblue,
            Text [ x = 16, y = 54, width = 268, textColor = gainsboro, wrap = true,
                   text = "height, colour, and this whole line swap in together" ] ],
        ],
    ]
`,
  },
];

export const navLinks = [
  { label: "Docs", href: "/docs/" },
  { label: "Examples", href: "/examples/" },
  { label: "Playground", href: "#03" },
  { label: "GitHub", href: "https://github.com/davidtemkin/declarelang" },
];
