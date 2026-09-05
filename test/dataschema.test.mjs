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

await test("the shape literal parses and rides the artifact; embedded data validates at build", async () => {
  const good = await compile(`App [ width=1, height=1,
    e: Dataset [ schema = [ city: string, rows[]: [ id: string, n?: number ], tags[]: string ] ] { { "city": "SF", "rows": [ { "id": "a" }, { "id": "b", "n": 2 } ], "tags": ["x"] } },
  ]`);
  assert.deepEqual(good.errors.map((e) => e.message), []);
  // The same shape ON the embedded dataset refuses a mismatched body — loudly, at build.
  const src = (body) => `App [ width=1, height=1,
    e: Dataset [ schema = [ rows[]: [ id: string ] ] ] { ${body} },
  ]`;
  assert.ok(build((await compile(src('{ "rows": [ { "id": "a" } ] }'))).source), "a conforming body builds");
  await assert.rejects(
    async () => build((await compile(src('{ "rows": [ { "id": 7 } ] }'))).source),
    /embedded data does not match the schema — \/rows\/0\/id — expected string, got number/
  );
  await assert.rejects(
    async () => build((await compile(src('{ "rows": [ {} ] }'))).source),
    /\/rows\/0\/id is missing — the schema requires string \(mark it 'id\?'/
  );
});

await test("validate-on-receipt: a bad response lands in .failed with the pointed path, never in .value", async () => {
  const src = await compile(`App [ width=1, height=1,
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

await test("INFERRED identity drives reconciliation — no key=, no schema, no declaration anywhere", async () => {
  const src = await compile(`App [ width=1, height=1,
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

await test("the ! marker refuses with the convention named; key= overrides an unconventional field", async () => {
  const bad = await compile(`App [ width=1, height=1,
    d: Dataset [ schema = [ rows[]: [ id!: string ] ] ] { { "rows": [] } },
  ]`.replace("id!:", "id" + String.fromCharCode(33) + ":"));
  assert.match(bad.errors[0].message, /identity is never declared: a record's 'id' field IS its identity by convention/);
  // key= remains the explicit override for an unconventional identity field —
  // and it outranks the inferred id (a record carrying BOTH pools by uuid).
  const src = await compile(`App [ width=1, height=1,
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

await test("windowed retention keys by INFERRED identity across wholesale replacement", async () => {
  const src = await compile(`App [ width=400, height=400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width=300, height=300,
      content: View [ width=300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = true, width=300, height=30,
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

await test("DataSource.credentials — a token surface, the Fetch API's spelling on the wire", async () => {
  // The three Fetch credentials modes, as a closed set. `same-origin` cannot be
  // a token (the hyphen is subtraction), so the language spells it `sameOrigin`
  // and data.ts maps it back — exactly as `blend` maps colorDodge → color-dodge.
  const src = (v) => `App [ width = 10, height = 10, d: DataSource [ url = "/x"${v} ] ]`;
  for (const tok of ["omit", "sameOrigin", "include"]) {
    const r = await compile(src(`, credentials = ${tok}`), { typecheck: false });
    assert.notEqual(r.source, null, `credentials = ${tok} must compile: ${r.report}`);
  }
  // a miss is a COMPILE error naming the legal set, not a TypeError from fetch
  const bad = await compile(src(", credentials = sameorigin"), { typecheck: false });
  assert.equal(bad.source, null, "a misspelled mode must not reach fetch");
  assert.match(bad.report, /one of omit \| sameOrigin \| include/);

  // and what actually reaches fetch(url, init)
  const seen = [];
  const prev = provideTransport((url, init) => { seen.push(init); return jsonResponse({ ok: 1 }); });
  try {
    const cases = [
      ["", undefined],                                     // unset → bare url, as before credentials existed
      [", credentials = sameOrigin", undefined],           // fetch's OWN default: nothing to say
      [", credentials = include", { credentials: "include" }],
      [", credentials = omit", { credentials: "omit" }],
    ];
    for (const [decl, want] of cases) {
      seen.length = 0;
      const app = build(src(decl));
      app.d.fetch();
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(seen[0], want, `init for '${decl || "(unset)"}'`);
    }
    // orthogonal to the verb: a POST carries body, headers AND credentials
    seen.length = 0;
    const app = build(src(`, method = "POST", body = { { a: 1 } }, credentials = include`));
    app.d.fetch();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(seen[0], { method: "POST", body: '{"a":1}',
      headers: { "Content-Type": "application/json" }, credentials: "include" });
  } finally {
    provideTransport(prev);
  }
});

// ── TYPED DATA (2026-09-01 — "the schema is a type"): a top-level
// `schema Name [ … ]` is ONE type in the one type system: projected as a TS
// interface for every { } body and method signature, resolvable in decl type
// positions, narrowing a dataset's `.value`, and enforced by the runtime at
// every boundary data crosses — arrival, the embedded body, and the mutation
// verbs. The schema grammar is the proper subset of TS that can be checked
// against data while the program runs. ──────────────────────────────────────

const TYPED_HEAD = `
schema Task [ id: string, title: string, done: boolean, status: "open" | "closed", pri?: 0 | 1 | 2, born: number, note?: string ]
`;

await test("typed data: one declaration serves compiler and runtime — the flagship walls", async () => {
  // clean: the guide's shape — named schema, doc literal referencing it,
  // typed .value chain, a Task-typed slot, a Task-typed method param
  const good = await compile(TYPED_HEAD + `
    App [ width=1, height=1,
      nest: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [ { "id": "t1", "title": "a", "done": false, "status": "open", "born": 1 } ] } },
      sel: Task = null,
      pick(id: string) { app.sel = (app.nest.value?.tasks ?? []).find(t => t.id == id) ?? null },
      open: Text [ text = { (app.nest.value?.tasks ?? []).filter(t => !t.done).length + "" } ],
    ]`);
  assert.deepEqual(good.errors.map((e) => e.message), []);
  // the typed .value chain: a misspelled field DIES, with the near name
  const chain = await compile(TYPED_HEAD + `
    App [ width=1, height=1,
      nest: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [] } },
      open: Text [ text = { (app.nest.value?.tasks ?? []).filter(t => !t.don).length + "" } ],
    ]`);
  assert.match(chain.errors[0].message, /'don' is not a member of Task — did you mean 'done'/);
  // a Task-typed slot read
  const slot = await compile(TYPED_HEAD + `
    App [ width=1, height=1, sel: Task = null,
      t: Text [ text = { app.sel ? app.sel.titel : "" } ],
    ]`);
  assert.match(slot.errors[0].message, /'titel' is not a member of Task — did you mean 'title'/);
  // a Task-typed method parameter (root and class methods both check)
  const meth = await compile(TYPED_HEAD + `
    class Panel extends View [ bad(t: Task) -> string { return t.titel } ]
    App [ width=1, height=1, p: Panel [ ] ]`);
  assert.match(meth.errors[0].message, /'titel' is not a member of Task/);
  // the attribute-surface :path check resolves the NAMED document form
  const path = await compile(`
    schema Row [ id: string, label: string ]
    schema Doc [ rows[]: Row ]
    App [ width=1, height=1,
      d: Dataset [ schema = Doc ] { { "rows": [] } },
      list: View [ datapath = { d.value },
        View [ datapath = :rows[], t: Text [ text = :labell ] ],
      ],
    ]`);
  assert.match(path.errors[0].message, /'labell' is not in the schema here; fields: id, label/);
});

await test("typed data: the verbs are held to the shape — refused at the write, extras pass", async () => {
  const src = await compile(TYPED_HEAD + `
    App [ width=1, height=1,
      nest: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [ { "id": "t1", "title": "a", "done": false, "status": "open", "born": 1 } ] } },
    ]`);
  assert.deepEqual(src.errors, []);
  const app = build(src.source);
  assert.throws(() => app.nest.set(["tasks", 0, "done"], "yes"), /'\/tasks\/0\/done' refuses this write — expected boolean, got string/);
  assert.throws(() => app.nest.set(["tasks", 0, "status"], "paused"), /expected "open" \| "closed", got string/, "a literal union validates by membership");
  assert.throws(() => app.nest.set(["tasks", 0, "pri"], 7), /expected 0 \| 1 \| 2, got number/, "…numbers too");
  app.nest.set(["tasks", 0, "pri"], 2);
  assert.equal(app.nest.read(["tasks", 0, "pri"]), 2);
  app.nest.set(["tasks", 0, "status"], "closed");
  assert.equal(app.nest.read(["tasks", 0, "status"]), "closed");
  assert.throws(() => app.nest.insert(["tasks"], 0, { id: 7 }), /refuses this insert/);
  app.nest.insert(["tasks"], 0, { id: "t0", title: "z", done: true, status: "open", born: 2 });
  assert.equal(app.nest.read(["tasks"]).length, 2, "a conforming insert lands");
  app.nest.set(["tasks", 0, "extra"], 42);
  assert.equal(app.nest.read(["tasks", 0, "extra"]), 42, "undeclared keys pass — a schema declares what the program RELIES on");
});

await test("typed data: an array-root document (schema = Row[]) — validated arrival, typed .value", async () => {
  const src = await compile(`
    schema Row [ id: string, label: string ]
    App [ width=1, height=1,
      ds: DataSource [ url = "/x", schema = Row[] ],
      t: Text [ text = { (ds.value ?? []).map(r => r.label).join(",") } ],
    ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  const prev = provideTransport(() => jsonResponse([{ id: "a", label: "x" }]));
  try {
    await app.ds.fetch();
    assert.equal(app.ds.status, "loaded");
    provideTransport(() => jsonResponse({ not: "an array" }));
    await app.ds.fetch();
    assert.equal(app.ds.status, "failed");
    assert.match(app.ds.error, /the document is an ARRAY of records/);
  } finally { provideTransport(prev); }
  // and the typed chain dies on a wrong member
  const bad = await compile(`
    schema Row [ id: string, label: string ]
    App [ width=1, height=1,
      ds: DataSource [ url = "/x", schema = Row[] ],
      t: Text [ text = { (ds.value ?? []).map(r => r.labl).join(",") } ],
    ]`);
  assert.match(bad.errors[0].message, /'labl' is not a member of Row — did you mean 'label'/);
});

await test("typed data: the producer's wall — `contents` on a schema'd derived dataset checks against the document type", async () => {
  const bad = await compile(`
    schema Col [ name: string ]
    App [ width=1, height=1,
      board: Dataset [ schema = [ cols[]: Col ], contents = { ({ cols: [ { nam: "x" } ] }) } ],
    ]`);
  assert.match(bad.errors[0].message, /'contents' is typed \{ cols: Col\[\]/, "an inline mismatch dies at compile");
  const good = await compile(`
    schema Col [ name: string ]
    schema Board [ cols[]: Col ]
    App [ width=1, height=1,
      mk() -> Board { return { cols: [ { name: "a" } ] } },
      board: Dataset [ schema = Board, contents = { app.mk() } ],
    ]`);
  assert.deepEqual(good.errors.map((e) => e.message), [], "a typed producer chain is clean end to end");
});

await test("typed data: the crossings a TS arrival types first each name their rewrite", async () => {
  const say = async (src) => (await compile(src + "\nApp [ width=1, height=1 ]")).errors[0]?.message ?? "clean";
  assert.match(await say(`schema T [ tags: string[] ]`), /the array marker rides the NAME: write 'tags\[\]: string'/);
  assert.match(await say(`schema T [ note: string? ]`), /the optional marker rides the FIELD name: write 'note\?: string'/);
  assert.match(await say(`schema T [ x: string = "a" ]`), /a schema field takes no default/);
  assert.match(await say(`schema T [ f(x) { return 1 } ]`), /a schema declares shape, not behavior/);
  assert.match(await say(`schema A [ x: string ]\nschema B extends A [ y: string ]`), /schemas do not extend — a schema is composed by NESTING/);
  assert.match(await say(`schema T [ a: 1 | "b" ]`), /a literal union is all strings or all numbers/);
  const tag = await compile(`schema Task [ id: string ]\nApp [ width=1, height=1, Task [ ] ]`);
  assert.match(tag.errors[0].message, /'Task' is a schema — a data shape, not a component/);
  const q = await compile(`App [ width=1, height=1, f(c?: number) { return 1 } ]`);
  assert.match(q.errors[0].message, /in a signature the '\?' marks the TYPE: write 'c: number\?'/);
});

await test("typed data: a schema-typed slot is LIVE past its identity — the record's own field wakes its readers", async () => {
  const src = await compile(TYPED_HEAD + `
    App [ width=1, height=1,
      nest: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [ { "id": "t1", "title": "old", "done": false, "status": "open", "born": 1 } ] } },
      sel: Task = null,
      pick(id: string) { app.sel = (app.nest.value?.tasks ?? []).find(t => t.id == id) ?? null },
      detail: Text [ text = { app.sel ? app.sel.title : "none" } ],
    ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  settle();
  app.pick("t1");
  settle();
  assert.equal(app.detail.text, "old");
  app.nest.set(["tasks", 0, "title"], "NEW");
  settle();
  assert.equal(app.detail.text, "NEW", "the binding re-derived from the record's region cell — never a stale view");
  const raw = app.sel;
  assert.equal(typeof raw, "object");
  assert.equal(raw.title, "NEW", "handlers/methods still see the plain record");
});

await test("typed data: one namespace of type names — collisions and unknown refs refuse pointedly", async () => {
  const collide = await compile(`
    class Task extends View [ ]
    schema Task [ x: string ]
    App [ width=1, height=1 ]`);
  assert.match(collide.errors[0].message, /'Task' is already a component — schemas and classes share one namespace/);
  const unknownRef = await compile(`
    schema Card [ owner: Person ]
    App [ width=1, height=1 ]`);
  assert.match(unknownRef.errors[0].message, /'owner: Person' names no schema/);
  const unknownDoc = await compile(`
    schema A [ x: string ]
    App [ width=1, height=1, d: Dataset [ schema = B ] { {} } ]`);
  assert.match(unknownDoc.errors[0].message, /schema = B: 'B' names no schema — declared schemas: A/);
  const badDefault = await compile(`
    schema T [ x: string ]
    App [ width=1, height=1, sel: T = 5 ]`);
  assert.match(badDefault.errors[0].message, /a T record .* or null for none/);
});

await test("DataSource carries headers — the API-keyed / Bearer-token endpoint (field report 2026-09-04)", async () => {
  // Without this a DataSource could not reach any authenticated or API-keyed
  // service at all (AppSync, most GraphQL), and a real port fell back to
  // hand-written fetch() in a script block for EVERY call, re-declaring the
  // loading/loaded/failed lifecycle by hand once per screen.
  const src = await compile(`App [ width=1, height=1,
    token: string = "",
    gql: DataSource [ url = "/graphql", method = "POST",
      headers = { ({ "x-api-key": "KEY", Authorization: app.token != "" ? "Bearer " + app.token : "" }) },
      body = { ({ query: "{ q }" }) } ],
  ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  settle();
  let seen = null;
  const prev = provideTransport((url, init) => { seen = init; return jsonResponse({ ok: 1 }); });
  try {
    await app.gql.fetch();
    assert.equal(seen.headers["x-api-key"], "KEY", "the api key rides every request");
    assert.equal(seen.headers["Content-Type"], "application/json", "the JSON body's own header survives");
    assert.ok(!("Authorization" in seen.headers), "an EMPTY value is not sent — the conditional-header idiom");
    // the token lands: the header re-derives, no imperative re-plumbing
    app.token = "abc";
    settle();
    await app.gql.fetch();
    assert.equal(seen.headers.Authorization, "Bearer abc", "headers are reactive like any other slot");
  } finally { provideTransport(prev); }
});

await test("a literal union is sayable in EVERY type position, not just a schema field", async () => {
  // The asymmetry a real port hit (field report 2026-09-04) and a design review
  // flagged before it: `status: "idle" | "loading"` was legal as a schema FIELD
  // and refused as an ordinary declaration — the same closed set sayable about
  // data and unsayable about the state derived from it.
  const src = await compile(`App [ width=1, height=1,
      phase: "idle" | "loading" | "done" = "idle",
      pick(s: "a" | "b") -> "a" | "b" { return s },
      n: number = 0,
      go() { app.phase = "done"; app.n = app.pick("a") == "a" ? 1 : 2 },
      t: Text [ text = { app.phase } ],
    ]`);
  assert.deepEqual(src.errors.map((e) => e.message), [], "declaration, parameter and return all accept it");
  const app = build(src.source);
  settle();
  assert.equal(app.t.text, "idle", "the value flows like any other");
  app.go();
  settle();
  assert.equal(app.phase, "done");
  assert.equal(app.n, 1, "the union-typed parameter and return check and run");

  // the members are enforced, at both ends
  const badDefault = await compile(`App [ width=1, height=1, phase: "idle" | "loading" = "nope" ]`);
  assert.match(badDefault.errors[0].message, /expects one of "idle" \| "loading"/);
  const badAssign = await compile(`App [ width=1, height=1, phase: "idle" | "loading" = "idle",
      go() { app.phase = "wat" } ]`);
  assert.match(badAssign.errors[0].message, /not assignable to type '"idle" \| "loading"'/);

  // a member may itself contain the separator — the union is parsed as string
  // literals, not split on '|' (review, 2026-09-04)
  const piped = await compile(`App [ width=1, height=1, sep: "a|b" | "c" = "a|b" ]`);
  assert.deepEqual(piped.errors.map((e) => e.message), [], "a member containing '|' parses");
  // and a NUMBER union on a declaration is refused by name, not by accident
  const numeric = await compile(`App [ width=1, height=1, col: 0 | 1 | 2 = 0 ]`);
  assert.match(numeric.errors[0].message, /number-literal union is a schema-field type/);
});

await test("spell a member the way its declaration spells it — an authored union takes the QUOTED member only (ruling 2026-09-05)", async () => {
  // `Axis` declares `y`, so `axis = y`; a literal union declares `"idle"`, so
  // `phase = "idle"`. The bare token was accepted for authored unions too until
  // the ruling — two spellings for one thing.
  const H = `class Fetcher extends View [ phase: "idle" | "loading" | "done" = "idle" ]\n`;
  const quoted = await compile(H + `App [ width=1, height=1, f: Fetcher [ phase = "loading" ] ]`);
  assert.deepEqual(quoted.errors.map((e) => e.message), [], "the quoted member is the spelling");
  const bare = await compile(H + `App [ width=1, height=1, f: Fetcher [ phase = loading ] ]`);
  assert.equal(bare.errors.length, 1, "the bare token is refused");
  assert.match(bare.errors[0].message, /written in quotes, in a slot as in \{ \}: "loading"/, "…and the refusal names the spelling");
  // a built-in vocabulary is unchanged: token only
  const axisTok = await compile(`App [ width=1, height=1, layout: SimpleLayout [ axis = y ] ]`);
  assert.deepEqual(axisTok.errors.map((e) => e.message), []);
  const axisStr = await compile(`App [ width=1, height=1, layout: SimpleLayout [ axis = "y" ] ]`);
  assert.match(axisStr.errors[0].message, /expects an Axis \(one of x \| y\), got the string/);
});

await test("DataSource.method / .format are closed sets checked at compile — slot AND body (2026-09-05)", async () => {
  // Both were `kind: "string"` with the union only on the runtime class,
  // invisible to programs: `method = "PATCHE"` passed every rung and failed at
  // the fetch. Now the same authored-union AttrType — spelled as it always was.
  const ok = await compile(`App [ width=1, height=1, d: DataSource [ url = "/x", method = "POST", format = "text" ] ]`);
  assert.deepEqual(ok.errors.map((e) => e.message), [], "the documented spellings still compile");
  const slot = await compile(`App [ width=1, height=1, d: DataSource [ url = "/x", method = "PATCHE" ] ]`);
  assert.match(slot.errors[0].message, /one of "GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"/, "a typo is refused in the slot");
  const body = await compile(`App [ width=1, height=1, d: DataSource [ url = "/x" ], go() { app.d.method = "PATCHE" } ]`);
  assert.match(body.errors[0].message, /not assignable/, "…and in a { } body, by the typechecker");
  const bare = await compile(`App [ width=1, height=1, d: DataSource [ url = "/x", method = POST ] ]`);
  assert.match(bare.errors[0].message, /written in quotes/, "a bare verb is refused with the quoted spelling named");
});

summarize("dataschema");
