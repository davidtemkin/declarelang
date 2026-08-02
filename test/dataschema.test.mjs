// The optional dataset schema (B4, language §9 — built 2026-07-30): the
// shape literal, validate-on-receipt, static `:path` checking — and the
// INVISIBLE identity rule (ruled 2026-07-30): a record's `id` field is its
// identity by CONVENTION, inferred, never declared; `key = :field` is the
// explicit override; the structural fallback sits beneath. The schema is
// validation-only.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build, settle, Dataset } from "../runtime/dist/index.js";
import { provideTransport } from "../runtime/dist/data.js";
import { validateShape } from "../runtime/dist/data-schema.js";

const jsonResponse = (body, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });

await test("the shape literal parses and rides the artifact; embedded data validates at build", () => {
  const good = compile(`App [ width=1, height=1,
    e: Dataset [ schema = [ city: string, rows[]: [ id: string, n?: number ], tags[]: string ] ] { { "city": "SF", "rows": [ { "id": "a" }, { "id": "b", "n": 2 } ], "tags": ["x"] } },
  ]`);
  assert.deepEqual(good.errors.map((e) => e.message), []);
  // The same shape ON the embedded dataset refuses a mismatched body — loudly, at build.
  const src = (body) => `App [ width=1, height=1,
    e: Dataset [ schema = [ rows[]: [ id: string ] ] ] { ${body} },
  ]`;
  assert.ok(build(compile(src('{ "rows": [ { "id": "a" } ] }')).source), "a conforming body builds");
  assert.throws(
    () => build(compile(src('{ "rows": [ { "id": 7 } ] }')).source),
    /embedded data does not match the schema — \/rows\/0\/id — expected string, got number/
  );
  assert.throws(
    () => build(compile(src('{ "rows": [ {} ] }')).source),
    /\/rows\/0\/id is missing — the schema requires string \(mark it 'id\?'/
  );
});

await test("validate-on-receipt: a bad response lands in .failed with the pointed path, never in .value", async () => {
  const src = compile(`App [ width=1, height=1,
    ds: DataSource [ url = "/x", schema = [ city: string, rows[]: [ id: string ] ] ],
  ]`);
  assert.deepEqual(src.errors, []);
  const app = build(src.source);
  const prev = provideTransport(() => jsonResponse({ city: "SF", rows: [{ id: "a" }] }));
  try {
    await app.ds.fetch();
    assert.equal(app.ds.status, "loaded", "a conforming response loads");
    assert.equal(app.ds.value.city, "SF");
    provideTransport(() => jsonResponse({ city: "SF", rows: [{ id: "a" }, { nope: 1 }] }));
    await app.ds.fetch();
    assert.equal(app.ds.status, "failed", "a malformed response FAILS — never undefined three layers deep");
    assert.match(app.ds.error, /the response does not match the schema — \/rows\/1\/id is missing/);
    assert.equal(app.ds.value.rows.length, 1, "the previous good value is untouched");
  } finally {
    provideTransport(prev);
  }
});

await test("validateShape semantics: optionals, ragged extras, scalar arrays", () => {
  const shape = [
    { name: "title", array: false, optional: false, identity: false, type: "string" },
    { name: "hits", array: false, optional: true, identity: false, type: "number" },
    { name: "tags", array: true, optional: false, identity: false, type: "string" },
  ];
  assert.equal(validateShape({ title: "t", tags: [] }, shape), null, "optional absent is fine");
  assert.equal(validateShape({ title: "t", hits: null, tags: ["a"] }, shape), null, "optional null is fine");
  assert.equal(validateShape({ title: "t", tags: [], EXTRA: { deep: true } }, shape), null, "undeclared keys pass — a shape declares what you RELY on");
  assert.match(validateShape({ title: "t", tags: ["a", 3] }, shape), /\/tags\/1 — expected string, got number/);
  assert.match(validateShape({ title: 4, tags: [] }, shape), /\/title — expected string, got number/);
});

await test("INFERRED identity drives reconciliation — no key=, no schema, no declaration anywhere", () => {
  const src = compile(`App [ width=1, height=1,
    raw: Dataset { { "rows": [ { "id": "a", "label": "one" }, { "id": "b", "label": "two" } ] } },
    derived: Dataset [
      contents = { ({ rows: (app.raw.read(["rows"]) ?? []).map(r => ({ id: r.id, label: r.label.toUpperCase() })) }) } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], height = 10, t: Text [ text = :label ] ],
    ],
  ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  settle();
  const before = app.list.children.filter((c) => c.t);
  assert.deepEqual(before.map((v) => v.t.text), ["ONE", "TWO"]);
  // A recompute manufactures fresh objects with fresh content — identity by
  // the SCHEMA's id field keeps the instances, and bindings re-derive.
  app.raw.set(["rows", 0, "label"], "uno");
  settle();
  const after = app.list.children.filter((c) => c.t);
  assert.equal(after[0], before[0], "same id → same instance — the convention, zero declaration");
  assert.equal(after[1], before[1]);
  assert.equal(after[0].t.text, "UNO", "…and the new value flowed through");
});

await test("the ! marker refuses with the convention named; key= overrides an unconventional field", () => {
  const bad = compile(`App [ width=1, height=1,
    d: Dataset [ schema = [ rows[]: [ id!: string ] ] ] { { "rows": [] } },
  ]`.replace("id!:", "id" + String.fromCharCode(33) + ":"));
  assert.match(bad.errors[0].message, /identity is never declared: a record's 'id' field IS its identity by convention/);
  // key= remains the explicit override for an unconventional identity field —
  // and it outranks the inferred id (a record carrying BOTH pools by uuid).
  const src = compile(`App [ width=1, height=1,
    raw: Dataset { { "rows": [ { "uuid": "u1", "id": "decoy-a", "label": "one" }, { "uuid": "u2", "id": "decoy-b", "label": "two" } ] } },
    derived: Dataset [
      contents = { ({ rows: (app.raw.read(["rows"]) ?? []).map(r => ({ uuid: r.uuid, id: "FRESH-" + r.label, label: r.label.toUpperCase() })) }) } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], key = :uuid, height = 10, t: Text [ text = :label ] ],
    ],
  ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  settle();
  const before = app.list.children.filter((c) => c.t);
  app.raw.set(["rows", 0, "label"], "uno");
  settle();
  const after = app.list.children.filter((c) => c.t);
  assert.equal(after[0], before[0], "key= pooled by uuid even though the id field churned every recompute");
  assert.equal(after[0].t.text, "UNO");
});

await test("windowed retention keys by INFERRED identity across wholesale replacement", () => {
  const src = compile(`App [ width=400, height=400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width=300, height=300,
      content: View [ width=300, datapath = { d.value },
        View [ datapath = :rows[], materialize = window, width=300, height=30,
          flag: boolean = false,
          t: Text [ text = :label ],
        ],
      ],
    ],
  ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, label: "row " + i }));
  app.d.value = { rows: rows(1000) };
  settle();
  const { blocksOf } = awaitedReplicate;
  const w = blocksOf(app.sc.content)[0].realized();
  const touched = w.find(({ index }) => index === 2).view;
  touched.flag = true;
  app.sc.scrollY = 15000;
  settle();
  // Wholesale replacement: new array, new record OBJECTS, same ids — the
  // retained row's membership continues because identity is the id field.
  app.d.value = { rows: rows(1000) };
  settle();
  app.sc.scrollY = 0;
  settle();
  const back = blocksOf(app.sc.content)[0].realized();
  assert.equal(back.find(({ index }) => index === 2).view, touched, "the touched instance survived replacement by inferred id — no declaration anywhere");
  assert.equal(touched.flag, true);
});

// (replicate.js is imported once here so the windowed test above can reach
// the kernel window API without a second import block.)
import * as awaitedReplicate from "../runtime/dist/replicate.js";

summarize("dataschema");
