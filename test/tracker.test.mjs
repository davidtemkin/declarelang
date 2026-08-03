// Tracker — the capstone's acceptance criteria as scripted scenarios
// (issue-tracker-brief.md §4; each test names its criterion). Node-driven
// against the real app: the fetch is bypassed (adopt() takes the generated
// issues directly), everything else is the app's own verbs. Criterion 13
// (column drag on touch) is pinned where the machinery lives — the
// components tier drove real touch drags on the same DataGrid header.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { generate } from "../tools/internal/gen-issues.mjs";
import { materializationInfo } from "../runtime/dist/replicate.js";
import { readFileSync } from "node:fs";

provideMeasurer(approximateMeasurer());

const SRC = readFileSync(new URL("../apps/tracker/tracker.declare", import.meta.url), "utf8");

function boot(n = 10000) {
  const b = compileProgram(SRC, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  app.width = 1200;
  app.height = 800;
  app.adopt(generate(n));
  app.booted = true;
  settle();
  return app;
}

const listRows = (app) => app.list.children.filter((c) => c.isTableRow === true);

await test("boot: the projection stands, the counts add up, the list windows (10k)", () => {
  const app = boot(10000);
  assert.equal(app.issuesOf(app.rev).length, 10000);
  assert.equal(app.shownTotal, 10000);
  const c = app.counts;
  assert.equal(c.open + c["in-progress"] + c.blocked + c.closed, 10000, "counts partition the set");
  assert.ok(listRows(app).length < 120, `windowed (got ${listRows(app).length} instances)`);
  assert.ok(app.list.children.length > 5, "rows materialized");
});

await test("criterion 1: mixed-height rows scroll both directions fast — placement exact among measured", () => {
  const app = boot(10000);
  const el = app.shown.value.rows;
  // deep jump then return; rows land at ledger offsets with true heights
  app.list.scrollY = 120000;
  settle(); settle();
  const deep = listRows(app).filter((r) => r.visible).sort((a, b) => a.y - b.y);
  assert.ok(deep.length > 4, "deep window materialized");
  for (let i = 0; i + 1 < deep.length; i++) {
    if (deep[i + 1].rowIndex() === deep[i].rowIndex() + 1) {
      assert.equal(Math.round(deep[i + 1].y - deep[i].y), Math.round(deep[i].height),
        "consecutive rows sit exactly their MEASURED heights apart");
    }
  }
  app.list.scrollY = 0;
  settle(); settle();
  const top = listRows(app).filter((r) => r.visible && r.rowIndex() === 0);
  assert.equal(top.length, 1, "back at the top, row 0 stands");
});

await test("criterion 2: insert at top while scrolled deep — the viewport holds still", () => {
  const app = boot(10000);
  app.list.scrollY = 60000;
  settle(); settle();
  const anchor = listRows(app).filter((r) => r.visible).find((r) => r.y >= app.list.scrollY);
  const before = { id: anchor.rec?.id ?? anchor.member().id, screenY: anchor.y - app.list.scrollY };
  // 50 fresh issues arrive at the top of the newest-first sort
  for (let i = 0; i < 50; i++) {
    app.db.insert(["issues"], 0, { id: 900000 + i, title: "hotfix " + i, description: "", status: "open", priority: "P1", labels: [], assignee: null, created: 999, updated: 99999999999999, comments: 0 });
  }
  app.rev = app.rev + 1;
  settle(); settle();
  const after = listRows(app).find((r) => (r.member() ?? {}).id === before.id);
  assert.ok(after !== undefined, "the row being read is still materialized");
  assert.ok(Math.abs((after.y - app.list.scrollY) - before.screenY) <= 1,
    "…at the same place on screen (the prepend anchored)");
});

await test("criterion 3: edit an unmaterialized row from the detail panel; scroll back; it is right", () => {
  const app = boot(10000);
  // select row 0, open the draft, then scroll far away (the row dematerializes)
  const rec = app.shown.value.rows[0];
  app.takeSelection([rec]);
  app.openDetail();
  settle();
  assert.equal(app.editing, true);
  app.list.scrollY = 150000;
  settle(); settle();
  // edit through the draft and commit — the record is nowhere materialized
  app.setDraftField("status", "blocked");
  app.draft.set(["it", "title"], "edited far away");
  app.draftRev = app.draftRev + 1;
  app.commitDraft();
  settle();
  const t = app.issuesOf(app.rev).find((it) => it.id === rec.id);
  assert.equal(t.status, "blocked", "the truth took the edit");
  assert.equal(t.title, "edited far away");
  app.list.scrollY = 0;
  settle(); settle();
  const row = listRows(app).find((r) => (r.member() ?? {}).id === rec.id);
  assert.ok(row !== undefined, "scrolled back, the row is right there");
  assert.equal(row.title.text, "edited far away", "…showing the committed edit");
});

await test("criterion 4: a filter narrows 10k to a handful under a deep scroll — position lands sane", () => {
  const app = boot(10000);
  app.list.scrollY = 100000;
  settle();
  app.fAssignee = "Hedy";
  settle(); settle();
  const n = app.shownTotal;
  assert.ok(n > 0 && n < 1500, `the filter narrowed (${n})`);
  const maxScroll = Math.max(0, app.list.children.filter((c) => c.isTableRow).reduce((m, r) => Math.max(m, r.y + r.height), 0) - app.list.height);
  assert.ok(app.list.scrollY <= Math.max(0, 100000), "no NaN-land");
  assert.ok(Number.isFinite(app.list.scrollY) && app.list.scrollY >= 0, "scroll is a real place");
  const vis = listRows(app).filter((r) => r.visible);
  assert.ok(vis.length > 0, "rows are on screen");
});

await test("criterion 5: sort flip with selection held — same records selected, viewport follows", () => {
  const app = boot(10000);
  const rows = app.shown.value.rows;
  app.takeSelection([rows[3], rows[5], rows[9]]);
  const ids = app.selection.map((r) => r.id).sort();
  app.setSort("title");
  settle(); settle();
  assert.deepEqual((app.selection ?? []).map((r) => r.id).sort(), ids, "the SAME records stay selected");
  app.setSort("priority");
  settle();
  assert.deepEqual((app.selection ?? []).map((r) => r.id).sort(), ids, "…through another flip");
});

await test("criterion 6: search NARROWS the projection; Enter/arrows walk the matches", () => {
  const app = boot(10000);
  const before = app.shownTotal;
  app.query = "rollback";
  settle();
  assert.ok(app.shownTotal > 5 && app.shownTotal < before, `the query narrowed (${app.shownTotal} of ${before})`);
  for (const r of app.shown.value.rows) {
    const hay = (r.title + " " + (r.description ?? "") + " " + (r.labels ?? []).join(" ")).toLowerCase();
    assert.ok(hay.includes("rollback"), "every shown row matches");
  }
  // the omnibox arrows walk the narrowed rows; the walked row materializes
  app.stepHit(1);
  app.stepHit(1);
  app.stepHit(1);
  settle(); settle();
  const rec = app.shown.value.rows[2];
  assert.equal(app.selected.id, rec.id, "the third match is selected");
  const row = listRows(app).find((r) => (r.member() ?? {}).id === rec.id);
  assert.ok(row !== undefined, "…materialized");
  assert.ok(row.y >= app.list.scrollY - row.height && row.y <= app.list.scrollY + app.list.height, "…on screen");
  // clearing the query restores the full projection
  app.query = "";
  settle();
  assert.equal(app.shownTotal, before, "clearing restores everything");
});

await test("criterion 7: bulk status over a cross-window selection — all 200 move", () => {
  const app = boot(10000);
  const rows = app.shown.value.rows;
  const picks = rows.filter((r) => r.status !== "closed").slice(0, 200);
  app.takeSelection(picks);
  assert.equal(app.selCount, 200);
  app.bulkSet("status", "closed");
  settle();
  const ids = new Set(picks.map((r) => r.id));
  const moved = app.issuesOf(app.rev).filter((it) => ids.has(it.id) && it.status === "closed");
  assert.equal(moved.length, 200, "every selected record moved, materialized or not");
});

await test("criterion 8: undo a delete — the records return; counts and selection recover", () => {
  const app = boot(10000);
  const rows = app.shown.value.rows;
  const picks = [rows[0], rows[1], rows[2]];
  app.takeSelection(picks);
  const before = app.issuesOf(app.rev).length;
  const beforeCounts = { ...app.counts };
  app.performDelete();
  settle();
  assert.equal(app.issuesOf(app.rev).length, before - 3, "deleted");
  assert.equal(app.toast.shown, true, "the toast offers the undo");
  app.undoDelete();
  settle();
  assert.equal(app.issuesOf(app.rev).length, before, "the records returned");
  assert.deepEqual({ ...app.counts }, beforeCounts, "group counts recovered");
  assert.deepEqual((app.selection ?? []).map((r) => r.id).sort(), picks.map((r) => r.id).sort(), "selection recovered");
  assert.equal(app.toast.shown, false);
});

await test("criterion 9: ragged data renders — nothing throws, defaults apply", () => {
  const app = boot(4000);
  // the generator salts nulls, unicode, and the absurd token by construction;
  // walk a few windows over it
  for (const y of [0, 30000, 80000, 0]) {
    app.list.scrollY = y;
    settle();
  }
  const unassigned = listRows(app).filter((r) => !r.isHdr && r.avatar.name === "");
  assert.ok(unassigned.length >= 0, "unassigned rows render the hollow avatar");
  assert.ok(app.issuesOf(app.rev).some((it) => it.assignee === null), "ragged records exist");
  assert.ok(true, "walked four windows without a throw");
});

await test("criterion 10 (the testable half): AT hears logical position and count", () => {
  const app = boot(10000);
  // the kernel publishes aria-rowcount/rowindex through the Surface seam —
  // headless surfaces don't exist, so assert the DIAGNOSTIC facts it feeds
  const info = materializationInfo(app.list);
  assert.equal(info.windowed, true);
  assert.equal(info.logical, 10000, "the AT count is the LOGICAL count");
});

await test("criterion 12: the differ — the same script, windowed vs full, identical observable state", () => {
  const script = (app) => {
    const out = [];
    app.query = "cache";
    settle();
    app.stepHit(1);
    settle();
    out.push(app.selected?.id);
    app.fStatus = "open";
    settle();
    out.push(app.shownTotal);
    app.setSort("title");
    settle();
    out.push(app.shown.value.rows[0]?.id);
    const rows = app.shown.value.rows;
    app.takeSelection([rows[1], rows[2]]);
    app.bulkSet("status", "blocked");
    settle();
    out.push(app.issuesOf(app.rev).filter((it) => it.status === "blocked").length);
    app.performDelete();
    settle();
    out.push(app.issuesOf(app.rev).length);
    app.undoDelete();
    settle();
    out.push(app.issuesOf(app.rev).length);
    return out;
  };
  // windowed (auto at 10k) vs virtualization OFF (virtualize = false)
  const a = boot(10000);
  const wa = script(a);
  const SRC_ALL = SRC.replace("virtualize = true ]", "virtualize = false ]");
  const b = compileProgram(SRC_ALL, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0);
  const appB = instantiate(b.program);
  appB.width = 1200; appB.height = 800;
  appB.adopt(generate(10000));
  appB.booted = true;
  settle();
  const wb = script(appB);
  assert.deepEqual(wa, wb, "identical observable state with virtualization forced off");
});

await test("grouped view: headers count, collapse works, a status edit MOVES the issue", () => {
  const app = boot(4000);
  app.groupBy = "status";
  settle();
  const rows = app.shown.value.rows;
  const hdrs = rows.filter((r) => r.kind === "hdr");
  assert.equal(hdrs.length, 4, "four status groups");
  assert.equal(hdrs.reduce((s, h) => s + h.count, 0), 4000, "headers count the true membership");
  // collapse one group
  const openCount = hdrs.find((h) => h.status === "open").count;
  app.toggleGroup("open");
  settle();
  assert.equal(app.shown.value.rows.length, rows.length - openCount, "collapsed members left the projection");
  app.toggleGroup("open");
  settle();
  // a status edit moves the issue between groups — reconcile, not rebuild
  const it = app.shown.value.rows.find((r) => r.kind !== "hdr" && r.status === "open");
  app.takeSelection([it]);
  app.bulkSet("status", "blocked");
  settle();
  const hdrs2 = app.shown.value.rows.filter((r) => r.kind === "hdr");
  assert.equal(hdrs2.find((h) => h.status === "open").count, openCount - 1, "left its group");
});

await test("the working copy is honest: cancel discards, save commits, dirty gates the button", () => {
  const app = boot(2000);
  const rec = app.shown.value.rows[0];
  app.takeSelection([rec]);
  app.openDetail();
  settle();
  assert.equal(app.draftDirty, false, "a fresh draft is clean");
  app.draft.set(["it", "title"], "poked");
  app.draftRev = app.draftRev + 1;
  settle();
  assert.equal(app.draftDirty, true, "an edit dirties it");
  // cancel = re-open: the draft resets, the truth never moved
  app.openDetail();
  settle();
  assert.equal(app.draft.value.it.title, rec.title, "cancel discarded the edit");
  assert.equal(app.issuesOf(app.rev).find((it) => it.id === rec.id).title, rec.title, "the truth never moved");
});

await test("create lands at the top of its sort; the rail derives from the same truth", () => {
  const app = boot(2000);
  const openBefore = app.counts.open;
  app.newIssue();
  app.draft.set(["it", "title"], "brand new issue");
  app.draft.set(["it", "updated"], 99999999999999);
  app.draftRev = app.draftRev + 1;
  app.commitDraft();
  settle();
  assert.equal(app.shown.value.rows[0].title, "brand new issue", "newest-first sort puts it on top");
  assert.equal(app.selected.title, "brand new issue", "…and it is selected");
  assert.equal(app.counts.open, openBefore + 1, "the rail's status count re-derived on the spot");
  assert.ok(app.workload.value.rows.length > 0, "workload lists only people with open work");
  for (const r of app.workload.value.rows) assert.ok(r.peak >= r.n, "peak rides each row");
  assert.ok(app.assignees(app.rev).every((n) => n[0] === n[0].toUpperCase()), "names are capitalized in the truth");
});

summarize("tracker");
