<!-- nav: Typed data: schemas -->
<!-- part: Building -->

# Typed data: schemas

A program relies on the shape of its data. When the server renames `label`, three screens
go blank; when a number arrives as a string, the wrong value surfaces four constraints away
from the fetch that caused it. Most stacks answer with a validation library on one side
and type annotations on the other, glued by hand. Declare answers with one declaration.

> **A schema states the shape you rely on, once. The compiler checks every read it can
> see; the runtime checks every piece of data that crosses into the program.**

## Declaring a shape

```declare-fragment
schema Task [ id: string, title: string, done: boolean, due: number, note?: string ]
```

A schema is a top-level declaration. Squint past the brackets and it is a TypeScript
interface — and it is a real type: `Task` works in any type position, in a declared
attribute (`sel: Task = null`), a method signature (`advance(t: Task)`), or a field of
another schema. A schema's brackets hold fields only — no defaults, no behavior.

Field types are the ones JSON can say: `string`, `number`, `boolean`, `any`, another
schema's name, a nested `[ … ]` record, or a literal union (`"open" | "closed"`,
`0 | 1 | 2`). `?` marks a field the data may omit or send as null, and `[]` on the field's
name marks an array — `tags[]: string` — the same spelling as the path that reads it,
`:tags[]`. What the grammar leaves out of full TypeScript is deliberate: a schema states
facts that can be checked against each document as it arrives. It is where an API
contract's prose — "`col` is 0, 1, or 2" — becomes a check.

## Pointing data at it

```declare
schema Task [ id: string, title: string, done: boolean, due: number, note?: string ]

App [ width = 360, height = 170, fill = white, textColor = #172530,
    tasks: Dataset [ schema = [ items[]: Task ] ] {
        { "items": [ { "id": "t1", "title": "Post the reading list", "done": false, "due": 3 },
                     { "id": "t2", "title": "Clear the gutters", "done": true, "due": 1 } ] }
        },
    open: number = { (app.tasks.value?.items ?? []).filter((t) => !t.done).length },
    col: View [ x = 20, y = 20, width = 320, datapath = { app.tasks.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ fontWeight = semibold, text = { app.open + " open" } ],
        View [ datapath = :items[], width = 100%, height = 28,
            layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
            Checkbox [ checked = :done, input(v: boolean) { :done = v } ],
            Text [ text = { :title + " · due in " + :due + " days" } ]
            ]
        ]
    ]
```

A dataset declares its document with `schema = [ … ]` — here, a document whose `items` is
an array of `Task`. From then on:

- **The compiler checks the paths it can see.** `text = :titel` on an attribute, a
  misspelled `key = :…`, or a replication path that does not match the schema is a
  compile error naming the real fields.
- **The typed value is typed everywhere.** `app.tasks.value.items` is `Task[]` to every
  constraint and method, so in the `filter` above `t` is a `Task`, and `t.don` is an error
  that suggests `done`. No `as` cast is needed anywhere.
- **The runtime checks every boundary.** A fetched response that does not match lands in
  `.failed` with the exact path of the mismatch. An embedded body that does not match fails
  the build. And a write is held to the schema: `:done = "yes"` or
  `d.set(["items", 0, "done"], "yes")` is refused at the write, naming the path and what
  was expected. A refusal throws, so route values a person typed through a text field's
  edit session ([Data](declare-docs:guide:data@editing-text-and-forms)), which validates before writing.

Validation is permissive about extra keys: a schema declares what you *rely on*, and keys
it does not mention pass through untouched, because real data is ragged. That has one
consequence to know: a misspelled field name in a *write* (`:donee = true`) is not a type
error, just a new key nothing reads.

Your own state can use the same names. `sel: Task = null` is a declaration whose type is
the schema; a record-typed attribute may be null until something sets it, so reads are
`app.sel!.title` behind a null test, or `app.sel?.title ?? ""`. And a record-typed
attribute is live past its identity: a constraint reading `app.sel.title` follows when
that record's title is edited, not only when `sel` points at a different record.

## Schemas are optional, and partial is normal

Nothing here changes the untyped layer: a dataset with no schema reads, replicates and
writes exactly as before, and plenty of real payloads — mixed feeds, converted trees,
maps keyed by dates — have no regular shape. Declare the fields you rely on and let the
rest flow; `meta: any` is the sanctioned door for an irregular subtree. A shape used once
can be written inline at the dataset — `schema = [ city: string, rows[]: [ id: string ] ]`
— and named the moment a second declaration would repeat it. `schema = Card[]` on a
[`DataSource`](declare-docs:DataSource) declares a response that is a bare array.

**A schema is not a parser.** It checks what arrives; it never converts it. When a
payload needs reshaping — string ids to numbers, a ragged feed filtered to the records you
keep — that is ordinary code in a derived dataset: declare the *wire* shape on the raw
source, project with a method, and declare the *model* shape on the projection. Both ends
are checked.

> **From React:** compare what this replaces — an `interface` for the compiler, a zod or
> io-ts schema for the runtime, glue to keep them agreeing, and `as` casts where they do
> not reach. One declaration serves both sides because it is limited to what both sides
> can enforce.

## Who checks what

| data crosses… | checked by | when | a violation… |
|---|---|---|---|
| a fetched response | runtime | on arrival | lands in `.failed` with the path; `.value` keeps the last good document |
| an embedded `{ json }` body | runtime | at build | fails the build, path named |
| a write — `:field = v`, [`set`](declare-docs:Dataset.method.set), [`insert`](declare-docs:Dataset.method.insert) | runtime | at the write | throws, naming the path and the expectation |
| a text field's `<->` draft | the edit session | at commit | an unreadable draft makes the session invalid; nothing is written |
| a `:path` on an attribute, `key`, or a replication path | compiler | at compile | error with the schema's fields named |
| the typed `.value` chain in any `{ }` or method | compiler | at compile | type error, nearest name suggested |
| a declaration or signature — `sel: Task`, `advance(t: Task)` | compiler | at compile | type error |
| a `:path` *inside* a `{ }` body | nobody yet | — | reads null; the attribute falls back to its default |
| a subtree under a computed cursor — `datapath = { cond ? a : b }` | nobody, by design | — | beyond what a static checker can follow |

The principle behind the table: **the runtime stands where data the program did not
construct comes in; the compiler stands where the program constructs it.** The last two
rows are the honest edge — one a check the compiler does not make, one a horizon no static
checker crosses.

---

**What you can now do:** declare the shape your program relies on, point data at it, and
know which mistakes the compiler catches, which the runtime refuses, and which are still
yours to get right.

[Next: **Large collections** →](declare-docs:guide:collections)
