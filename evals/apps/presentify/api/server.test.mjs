// The Presentify service's contract, end to end against a running copy:
//   node evals/apps/presentify/api/server.test.mjs   (starts its own on a spare port)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 8369;
const srv = spawn("node", [fileURLToPath(new URL("./server.mjs", import.meta.url)), `--port=${PORT}`, "--quiet"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 400));
const api = async (method, path, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};
let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log("  ok —", name); };
try {
  await t("the seed: three presentations, the richest first, with first-slide pictures", async () => {
    const r = await api("GET", "/api/decks");
    assert.equal(r.body.decks.length, 3);
    assert.equal(r.body.decks[0].title, "Field notes from the coast");
    assert.equal(r.body.decks[0].slideCount, 8);
    assert.ok(r.body.decks[0].thumbnailSlideId);
  });
  await t("a saved slide moves its version on; a stale save is a 409 carrying the current copy", async () => {
    const s = (await api("GET", "/api/decks/d1/slides")).body.slides[2];
    const ok = await api("PUT", `/api/slides/${s.id}`, { version: s.version, background: "#000000", elements: s.elements });
    assert.equal(ok.status, 200); assert.equal(ok.body.version, s.version + 1);
    const stale = await api("PUT", `/api/slides/${s.id}`, { version: s.version, background: "#FFFFFF", elements: [] });
    assert.equal(stale.status, 409); assert.equal(stale.body.current.background, "#000000");
  });
  await t("a malformed element is a 422 naming it by pointer", async () => {
    const s = (await api("GET", "/api/slides/s3")).body;
    const bad = await api("PUT", "/api/slides/s3", { version: s.version, background: "#FFFFFF", elements: [{ id: "x", kind: "star", x: 0, y: 0, width: 1, height: 1 }] });
    assert.equal(bad.status, 422); assert.equal(bad.body.field, "/elements/0/kind");
    const neg = await api("PUT", "/api/slides/s3", { version: s.version, background: "#FFFFFF", elements: [{ id: "x", kind: "ellipse", x: 0, y: 0, width: -1, height: 1, fill: null, stroke: null, keepProportions: false }] });
    assert.equal(neg.body.field, "/elements/0/width");
    const extra = await api("PUT", "/api/slides/s3", { version: s.version, background: "#FFFFFF", elements: [{ id: "x", kind: "ellipse", x: 0, y: 0, width: 1, height: 1, fill: null, stroke: null, keepProportions: false, rotation: 0 }] });
    assert.equal(extra.body.field, "/elements/0/rotation");
  });
  await t("a new presentation has one empty slide; slides add after, reorder, and the last can't go", async () => {
    const made = await api("POST", "/api/decks", { title: "Trip" });
    assert.equal(made.status, 201); assert.equal(made.body.slides.length, 1);
    const d = made.body.deck, first = d.slideOrder[0];
    const added = await api("POST", `/api/decks/${d.id}/slides`, { after: first, elements: [] });
    assert.deepEqual(added.body.deck.slideOrder, [first, added.body.slide.id]);
    const re = await api("PATCH", `/api/decks/${d.id}`, { version: added.body.deck.version, slideOrder: [added.body.slide.id, first] });
    assert.equal(re.status, 200); assert.equal(re.body.thumbnailSlideId, added.body.slide.id);
    const stale = await api("PATCH", `/api/decks/${d.id}`, { version: d.version, title: "x" });
    assert.equal(stale.status, 409);
    await api("DELETE", `/api/slides/${first}`);
    const last = await api("DELETE", `/api/slides/${added.body.slide.id}`);
    assert.equal(last.status, 409); assert.equal(last.body.error, "last_slide");
    assert.equal((await api("DELETE", `/api/decks/${d.id}`)).status, 204);
  });
  await t("the harness: _edit moves a slide on, _fail refuses the next write, _log and _reset", async () => {
    const before = (await api("GET", "/api/slides/s1")).body;
    const e = await api("POST", "/api/_edit", { slideId: "s1", background: "#123456" });
    assert.equal(e.body.version, before.version + 1);
    await api("POST", "/api/_fail", { count: 1 });
    const refused = await api("PUT", "/api/slides/s1", { version: e.body.version, background: "#FFFFFF", elements: [] });
    assert.equal(refused.status, 503);
    assert.ok((await api("GET", "/api/_log")).body.requests.length > 0);
    await api("POST", "/api/_reset");
    assert.equal((await api("GET", "/api/slides/s1")).body.version, 1);
    assert.equal((await api("GET", "/api/_log")).body.requests.length, 1);
  });
  console.log(`presentify service: ${pass} passed`);
} finally { srv.kill(); }
