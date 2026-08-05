// test/schema-completeness.test.mjs — every reactive slot a runtime component
// publishes is DECLARED in its schema.
//
// A runtime component is described twice: `defineAttributes(Class, { … })`
// creates the reactive cells, and `schema.ts` declares the typed surface. Two
// hand-maintained tables for one set of facts, and nothing compared them — so a
// slot could exist, be readable in a constraint, be taught in the guide, and be
// absent from every generated artifact at the same time.
//
// That is not hypothetical. `DataSource` published `status`, `error` and (as of
// 2026-08-03) `statusCode`/`errorBody` while declaring only its five settable
// attributes. `declare-model.json` is generated from the schemas and is what
// `skill/SKILL.md` calls "the single authority for these details" — so the
// reference denied attributes `declare.md` §7 and `guide/09-data.md` teach, and
// an agent reading the authority concluded they did not exist. The stated reason
// was a comment claiming read-only means omit, which is false for every other
// class in the file: `readOnly` exists precisely so a computed slot can be both
// declared and unsettable, as `View.hovered` and `Stream.status` are.
//
// NOT COVERED, deliberately: classes written in Declare (`library/*.declare` and
// any user class). They cannot have this defect — a `.declare` class declares its
// attributes in exactly one place, its own source, so there is no second table to
// fall out of step with. The duplication is specific to runtime components. The
// library's documentation debt is real and separate; this gate is about existence,
// not prose.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { SCHEMAS } from "../runtime/dist/schema.js";

/** Slots that are MACHINERY, not surface — a reactive cell exists so the runtime
 *  can react to it, which is not the same as being an attribute. Each entry is a
 *  claim that no program reads it; if one starts to, delete the line and declare
 *  the slot. The test below also fails on a STALE entry, so this cannot become a
 *  place where real omissions go to hide. */
const EXEMPT = new Map([
  ["TweenLayout.from", "retarget() overwrites it from the children's live geometry every transition"],
  ["TweenLayout.to", "same — the destination boxes, recomputed per retarget, read by no program"],
  ["App.pageWeight", "a host-client write with no Declare surface (schema.ts notes this)"],
  ["App.sourceLines", "same — measured by the host, never authored"],
  ["App.demoSources", "an interim host channel the docs app reads (schema.ts notes this)"],
  ["App.liveReport", "same — the last live recompile's rendered report"],
]);

const SRC = readdirSync("runtime/src").filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync("runtime/src/" + f, "utf8")).join("\n");

/** Every attribute name reachable on a schema, walking its base chain. */
function declared(schema) {
  const out = new Set();
  for (let c = schema; c !== null && c !== undefined; c = c.base) for (const k of Object.keys(c.attrs)) out.add(k);
  return out;
}

/** What the runtime actually publishes: `defineAttributes` keys, plus public
 *  getters (the derived form — `get loaded()` off `status` — which is how four
 *  of DataSource's nine missing slots were spelled). */
function published() {
  const out = new Map();
  const add = (cls, name) => out.set(cls, (out.get(cls) ?? new Set()).add(name));
  for (const m of SRC.matchAll(/defineAttributes\(\s*(\w+)\s*,\s*\{([\s\S]*?)\n\}\);/g)) {
    for (const k of m[2].matchAll(/^\s{2}(\w+)\s*:\s*\{/gm)) add(m[1], k[1]);
  }
  for (const m of SRC.matchAll(/^export class (\w+)[\s\S]*?(?=\n(?:export )?class |\n\/\/ ──|$)/gm)) {
    for (const g of m[0].matchAll(/^  get (\w+)\(/gm)) add(m[1], g[1]);
  }
  return out;
}

await test("every published runtime slot is declared in its schema", () => {
  const missing = [];
  for (const [cls, names] of published()) {
    const schema = SCHEMAS[cls];
    if (schema === undefined) continue;             // not a documented component
    const known = declared(schema);
    for (const name of names) {
      if (known.has(name) || EXEMPT.has(`${cls}.${name}`)) continue;
      missing.push(`${cls}.${name}`);
    }
  }
  assert.deepEqual(missing, [],
    `these slots are live but declared nowhere, so they reach no generated reference.\n` +
    `      Add them to the schema's attrs — and to readOnly if a constraint may read but not set them\n` +
    `      (that is what the field is for; omitting a slot because it is read-only is the mistake\n` +
    `      this gate exists to catch). If one is genuinely machinery, add it to EXEMPT with a reason.\n` +
    `      Missing: ${missing.join(", ")}`);
});

await test("no EXEMPT entry has gone stale", () => {
  // An exemption outlives its reason silently, and then the list is where real
  // omissions hide. Each one must still name a slot that is still published and
  // still undeclared — otherwise the line is noise and should go.
  const live = published();
  const stale = [];
  for (const key of EXEMPT.keys()) {
    const [cls, name] = key.split(".");
    const isPublished = live.get(cls)?.has(name) === true;
    const isDeclared = SCHEMAS[cls] !== undefined && declared(SCHEMAS[cls]).has(name);
    if (!isPublished) stale.push(`${key} — no longer published`);
    else if (isDeclared) stale.push(`${key} — now declared, so the exemption is dead`);
  }
  assert.deepEqual(stale, [], `stale exemptions: ${stale.join("; ")}`);
});

await test("every attribute in the reference carries prose — runtime AND library", () => {
  // The second half of "reaches the reference": declared is not the same as
  // documented, and an attribute that lands there blank is only marginally more
  // use than one that is missing.
  //
  // THE LIBRARY EXEMPTION IS RETIRED (2026-08-05). It was a dated decision taken
  // when ~130 library attributes had no prose; the library prose pass closed that
  // to zero (documentation.md §4a), and an exemption that outlives its reason is
  // exactly where real omissions go to hide. So the gate now covers both tiers —
  // which is the ratchet the original comment asked for, and it is what stops the
  // pass from quietly eroding one component at a time.
  //
  // `**Internal.**`-marked members are excluded: whether something is API is an
  // editorial judgment (§4a), and a marker is a decision on the record — unlike
  // silence, which is what this gate exists to catch.
  const model = JSON.parse(readFileSync("docs/declare-model.json", "utf8"));
  const blank = [];
  for (const [id, e] of Object.entries(model.reference)) {
    if (e.kind !== "attribute") continue;
    if (e.api === false || e.internal === true) continue;     // structural-only / marked Internal
    if (typeof e.doc === "string" && e.doc.trim() !== "") continue;
    blank.push(id);
  }
  // The two tiers keep their prose in different places, so the fix has to name the
  // right one — a message that sends a library author to prose/<Class>.md is a
  // diagnostic that fails its own standard.
  const where = (id) => {
    const cls = id.split(".")[0];
    return SCHEMAS[cls] !== undefined
      ? `${id} → add '## ${id.split(".").pop()}' to tools/internal/doc/prose/${cls}.md`
      : `${id} → add '## ${id.split(".").pop()}' to the /* # ${cls} … */ header block in library/`;
  };
  assert.deepEqual(blank, [],
    `these attributes are declared but undocumented, so the reference shows them blank.\n` +
    `      Then re-run: node tools/internal/derive.mjs\n` +
    `      ${blank.map(where).join("\n      ")}`);
});

summarize("schema-completeness");
