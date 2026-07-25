// PROOF-OF-CONCEPT: a minimal standard-CSS block plugin built ENTIRELY on PR A's
// seam — ZERO core changes. Shows the actual motivating consumer (`css Name { … }`)
// parsing and type-checking through build(). The runtime styling engine (applying
// rules to views) needs the deferred PR B (compiler threading) + PR C (per-view
// seam + cssRules type) and is intentionally out of scope here.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build } from "../runtime/dist/index.js";

// A tiny allowlist standing in for the real CSS_PROPERTIES table.
const KNOWN_PROPS = new Set(["color", "background", "width", "height", "opacity", "font-size"]);

const cssPlugin = {
  name: "css",
  blocks: [{
    keyword: "css",
    bodyKind: "code",
    parse(p) {
      p.expect("ident", "'css'");
      const name = p.expect("ident", "the css block's name");
      const body = p.expect("code", "a { … } css body");
      return { kind: "css", keyword: "css", name: name.text, text: body.str ?? "", bodyOffset: body.pos.offset + 1, pos: name.pos };
    },
    check(node, ctx) {
      const errors = [];
      if (ctx.nameTaken(node.name)) {
        errors.push({ message: `css '${node.name}' collides with an existing declaration`, pos: node.pos });
      }
      // Validate each `prop: value` declaration; position unknown props exactly
      // against the ORIGINAL source via ctx.posAt (the whole point of the seam).
      const re = /([a-zA-Z-]+)\s*:/g;
      let m;
      while ((m = re.exec(node.text)) !== null) {
        const prop = m[1];
        if (!KNOWN_PROPS.has(prop)) {
          errors.push({ message: `unknown CSS property '${prop}'`, pos: ctx.posAt(node.bodyOffset + m.index) });
        }
      }
      return errors;
    },
    instantiate() {
      // PR A can intern/validate here; per-view application is the deferred PR C seam.
    },
  }],
};

await test("PROOF: a valid css block parses + type-checks through build()", () => {
  const app = build(`css Dark { color: whitesmoke; background: #1e3a49; }\nApp [ ]`, { plugins: [cssPlugin] });
  assert.equal(app.constructor.name, "App");
});

await test("PROOF: an unknown CSS property is a positioned error", () => {
  const src = `css Dark { colr: red; }\nApp [ ]`; // 'colr' typo → unknown prop
  let err;
  try { build(src, { plugins: [cssPlugin] }); } catch (e) { err = e; }
  assert.ok(err, "expected build to throw");
  assert.match(err.message, /unknown CSS property 'colr'/);
});

await test("PROOF: a css block name collides with a stylesheet of the same name", () => {
  const src = `stylesheet Dark [ ]\ncss Dark { color: red; }\nApp [ ]`;
  assert.throws(() => build(src, { plugins: [cssPlugin] }), /collides/);
});

await test("PROOF: with NO css plugin, `css` stays an ordinary identifier", () => {
  // Contextual keyword: unregistered, `css` is just a component name — inert seam.
  assert.throws(() => build(`css Dark { color: red; }\nApp [ ]`), /end of input|Dark/);
});

summarize("css-demo");
