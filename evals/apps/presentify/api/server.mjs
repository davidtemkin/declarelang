// The Presentify service — GIVEN to the agent as a contract (API.md), never as code. It runs
// from outside the sandbox (this app has fixtures/), so the harness endpoints below are
// out of the agent's reach.
//
//   node evals/apps/presentify/api/server.mjs [--port=8360] [--quiet]
//
// It owns the document format: presentations ("decks") and their slides, each saved on
// its own with a version, so a stale save is refused with the copy as it now is. State
// lives in this process; POST /api/_reset returns it to the seed.
//
// Harness endpoints, absent from API.md:
//   POST /api/_reset                          back to the seed
//   POST /api/_edit  { slideId, background?, elements? }
//                                             another window saves this slide now (its
//                                             version moves on, so the app's next save of it
//                                             is a conflict)
//   POST /api/_fail  { count, status? }       the next `count` writes are refused (503 by
//                                             default), as a dropped connection would be
//   GET  /api/_log                            every request since the last reset, in order
//   GET  /api/_state                          every deck and slide as stored

import { createServer } from "node:http";
import { seed } from "./seed.mjs";

const flag = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PORT = Number(flag("port", 8360));
const QUIET = process.argv.includes("--quiet");
// A save takes a moment, so an app's "saving" state is something a person can see.
const WRITE_DELAY = 250;

const COLOUR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const KINDS = new Set(["rect", "ellipse", "line", "text", "group"]);
const ALIGN = new Set(["left", "center", "right"]);

let decks, slides, log, failNext, failStatus, seq, clock;
function reset() {
  const s = seed();
  clock = Date.UTC(2026, 10, 2, 9, 0, 0);
  // the first deck is the most recently changed, so it heads the list
  const stamps = s.decks.map(() => stamp()).reverse();
  decks = new Map(s.decks.map((d, i) => [d.id, { ...d, version: 1, updatedAt: stamps[i] }]));
  slides = new Map(s.slides.map((sl) => [sl.id, { ...sl, version: 1 }]));
  log = [];
  failNext = 0; failStatus = 503;
  seq = 100;
}
// time moves on with each write, so updatedAt orders the list the way edits happened
function stamp() { clock += 1000; return new Date(clock).toISOString(); }
reset();

const nextId = (p) => `${p}${++seq}`;
const deckOut = (d) => ({ ...d, thumbnailSlideId: d.slideOrder[0] ?? null });
const slideOut = (s) => ({ id: s.id, deckId: s.deckId, version: s.version, background: s.background, elements: s.elements });
const touch = (d) => { d.version += 1; d.updatedAt = stamp(); };

// ── checking a slide ────────────────────────────────────────────────────────
// A refusal names the first thing wrong by its JSON pointer into the request body.
function checkSlide(body) {
  const fail = (field, message) => ({ field, message });
  if (body === null || typeof body !== "object") return fail("", "The body must be a JSON object.");
  for (const k of Object.keys(body)) {
    if (!["version", "background", "elements"].includes(k)) return fail(`/${k}`, `A slide has no field '${k}'.`);
  }
  if (typeof body.background !== "string" || !COLOUR.test(body.background)) return fail("/background", "The background must be a colour like #FFFFFF.");
  if (!Array.isArray(body.elements)) return fail("/elements", "elements must be a list.");
  const ids = new Set();
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const colourOrNull = (v) => v === null || (typeof v === "string" && COLOUR.test(v));
  const strokeOk = (v) => v !== null && typeof v === "object" && typeof v.color === "string" && COLOUR.test(v.color) && num(v.width) && v.width >= 0
    && Object.keys(v).every((k) => k === "color" || k === "width");
  const FIELDS = {
    rect: ["id", "kind", "x", "y", "width", "height", "fill", "stroke", "cornerRadius", "keepProportions"],
    ellipse: ["id", "kind", "x", "y", "width", "height", "fill", "stroke", "keepProportions"],
    text: ["id", "kind", "x", "y", "width", "height", "keepProportions", "text"],
    line: ["id", "kind", "x1", "y1", "x2", "y2", "stroke"],
    group: ["id", "kind", "children"],
  };
  const element = (e, at, depth) => {
    if (e === null || typeof e !== "object") return fail(at, "An element must be an object.");
    if (typeof e.id !== "string" || e.id === "") return fail(`${at}/id`, "An element needs an id, a string.");
    if (ids.has(e.id)) return fail(`${at}/id`, `The id '${e.id}' is used twice on this slide.`);
    ids.add(e.id);
    if (!KINDS.has(e.kind)) return fail(`${at}/kind`, `'${e.kind}' is not a kind of element: rect, ellipse, line, text or group.`);
    for (const k of Object.keys(e)) if (!FIELDS[e.kind].includes(k)) return fail(`${at}/${k}`, `A ${e.kind} has no field '${k}'.`);
    for (const k of FIELDS[e.kind]) if (!(k in e)) return fail(`${at}/${k}`, `A ${e.kind} needs '${k}'.`);
    if (e.kind === "group") {
      if (!Array.isArray(e.children) || e.children.length < 2) return fail(`${at}/children`, "A group holds two or more elements.");
      if (depth > 8) return fail(at, "Groups nest at most eight deep.");
      for (let i = 0; i < e.children.length; i++) { const f = element(e.children[i], `${at}/children/${i}`, depth + 1); if (f) return f; }
      return null;
    }
    if (e.kind === "line") {
      for (const k of ["x1", "y1", "x2", "y2"]) if (!num(e[k])) return fail(`${at}/${k}`, `${k} must be a number.`);
      if (!strokeOk(e.stroke)) return fail(`${at}/stroke`, "A line's stroke is { color, width }.");
      return null;
    }
    for (const k of ["x", "y", "width", "height"]) if (!num(e[k])) return fail(`${at}/${k}`, `${k} must be a number.`);
    if (e.width < 0 || e.height < 0) return fail(`${at}/${e.width < 0 ? "width" : "height"}`, "A size can't be negative.");
    if (typeof e.keepProportions !== "boolean") return fail(`${at}/keepProportions`, "keepProportions is true or false.");
    if (e.kind === "text") {
      const t = e.text;
      if (t === null || typeof t !== "object") return fail(`${at}/text`, "A text element's text is an object.");
      const TF = ["content", "font", "size", "weight", "italic", "color", "align"];
      for (const k of Object.keys(t)) if (!TF.includes(k)) return fail(`${at}/text/${k}`, `Text has no field '${k}'.`);
      if (typeof t.content !== "string") return fail(`${at}/text/content`, "content must be a string.");
      if (typeof t.font !== "string" || t.font === "") return fail(`${at}/text/font`, "font must name a family.");
      if (!num(t.size) || t.size <= 0) return fail(`${at}/text/size`, "size must be a positive number.");
      if (!num(t.weight) || t.weight < 100 || t.weight > 900) return fail(`${at}/text/weight`, "weight is a number from 100 to 900.");
      if (typeof t.italic !== "boolean") return fail(`${at}/text/italic`, "italic is true or false.");
      if (typeof t.color !== "string" || !COLOUR.test(t.color)) return fail(`${at}/text/color`, "color must be a colour like #1F2328.");
      if (!ALIGN.has(t.align)) return fail(`${at}/text/align`, "align is left, center or right.");
      return null;
    }
    if (!colourOrNull(e.fill)) return fail(`${at}/fill`, "fill is a colour like #2F6F8F, or null.");
    if (e.stroke !== null && !strokeOk(e.stroke)) return fail(`${at}/stroke`, "stroke is { color, width }, or null.");
    if (e.kind === "rect" && (!num(e.cornerRadius) || e.cornerRadius < 0)) return fail(`${at}/cornerRadius`, "cornerRadius is a number, 0 or more.");
    return null;
  };
  for (let i = 0; i < body.elements.length; i++) { const f = element(body.elements[i], `/elements/${i}`, 0); if (f) return f; }
  return null;
}

// ── plumbing ────────────────────────────────────────────────────────────────
function cors(req) {
  const origin = req.headers.origin;
  return origin
    ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" }
    : { "access-control-allow-origin": "*" };
}
const send = (req, res, code, body, extra = {}) => {
  res.writeHead(code, { ...cors(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => { if (buf === "") return resolve(undefined); try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invalid = (f) => ({ code: 422, body: { error: "invalid", field: f.field, message: f.message } });
const notFound = (what) => ({ code: 404, body: { error: "not_found", message: `There's no such ${what}.` } });

// ── the endpoints ───────────────────────────────────────────────────────────
function route(method, path, body) {
  if (path === "/api/decks" && method === "GET") {
    const list = [...decks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, slideCount: d.slideOrder.length, thumbnailSlideId: d.slideOrder[0] ?? null }));
    return { code: 200, body: { decks: list } };
  }
  if (path === "/api/decks" && method === "POST") {
    const title = body?.title ?? "Untitled presentation";
    if (typeof title !== "string" || title.trim() === "") return invalid({ field: "/title", message: "A title can't be empty." });
    const d = { id: nextId("d"), title, slideOrder: [], version: 1, updatedAt: stamp() };
    const s = { id: nextId("s"), deckId: d.id, version: 1, background: "#FFFFFF", elements: [] };
    d.slideOrder.push(s.id);
    decks.set(d.id, d); slides.set(s.id, s);
    return { code: 201, body: { deck: deckOut(d), slides: [slideOut(s)] } };
  }

  const dm = /^\/api\/decks\/([^/]+)(\/slides)?$/.exec(path);
  if (dm) {
    const d = decks.get(dm[1]);
    if (!d) return notFound("presentation");
    if (!dm[2]) {
      if (method === "GET") return { code: 200, body: deckOut(d) };
      if (method === "DELETE") {
        for (const id of d.slideOrder) slides.delete(id);
        decks.delete(d.id);
        return { code: 204 };
      }
      if (method === "PATCH") {
        if (body === null || typeof body !== "object") return invalid({ field: "", message: "The body must be a JSON object." });
        for (const k of Object.keys(body)) if (!["version", "title", "slideOrder"].includes(k)) return invalid({ field: `/${k}`, message: `A presentation has no field '${k}' to change.` });
        if (body.version !== d.version) return { code: 409, body: { error: "conflict", message: "This presentation was changed somewhere else.", current: deckOut(d) } };
        if ("title" in body && (typeof body.title !== "string" || body.title.trim() === "")) return invalid({ field: "/title", message: "A title can't be empty." });
        if ("slideOrder" in body) {
          const o = body.slideOrder;
          const same = Array.isArray(o) && o.length === d.slideOrder.length && new Set(o).size === o.length && o.every((id) => d.slideOrder.includes(id));
          if (!same) return invalid({ field: "/slideOrder", message: "slideOrder must list this presentation's slides, each once." });
          d.slideOrder = [...o];
        }
        if ("title" in body) d.title = body.title;
        touch(d);
        return { code: 200, body: deckOut(d) };
      }
    } else {
      if (method === "GET") return { code: 200, body: { slides: d.slideOrder.map((id) => slideOut(slides.get(id))) } };
      if (method === "POST") {
        const b = body ?? {};
        for (const k of Object.keys(b)) if (!["after", "background", "elements"].includes(k)) return invalid({ field: `/${k}`, message: `A new slide has no field '${k}'.` });
        const at = b.after === undefined || b.after === null ? d.slideOrder.length : d.slideOrder.indexOf(b.after) + 1;
        if (b.after != null && at === 0) return invalid({ field: "/after", message: "after must be one of this presentation's slides, or null." });
        const content = { background: b.background ?? "#FFFFFF", elements: b.elements ?? [] };
        const f = checkSlide(content);
        if (f) return invalid(f);
        const s = { id: nextId("s"), deckId: d.id, version: 1, ...content };
        slides.set(s.id, s);
        d.slideOrder.splice(at, 0, s.id);
        touch(d);
        return { code: 201, body: { slide: slideOut(s), deck: deckOut(d) } };
      }
    }
  }

  const sm = /^\/api\/slides\/([^/]+)$/.exec(path);
  if (sm) {
    const s = slides.get(sm[1]);
    if (!s) return notFound("slide");
    const d = decks.get(s.deckId);
    if (method === "GET") return { code: 200, body: slideOut(s) };
    if (method === "PUT") {
      if (body === null || typeof body !== "object") return invalid({ field: "", message: "The body must be a JSON object." });
      if (body.version !== s.version) return { code: 409, body: { error: "conflict", message: "This slide was changed somewhere else.", current: slideOut(s) } };
      const f = checkSlide(body);
      if (f) return invalid(f);
      s.background = body.background; s.elements = body.elements; s.version += 1;
      d.updatedAt = stamp();
      return { code: 200, body: slideOut(s) };
    }
    if (method === "DELETE") {
      if (d.slideOrder.length === 1) return { code: 409, body: { error: "last_slide", message: "A presentation keeps at least one slide." } };
      d.slideOrder = d.slideOrder.filter((id) => id !== s.id);
      slides.delete(s.id);
      touch(d);
      return { code: 200, body: { deck: deckOut(d) } };
    }
  }
  return { code: 404, body: { error: "not_found", message: "There's no such endpoint." } };
}

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...cors(req),
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "content-type",
      "access-control-max-age": "600",
    });
    return res.end();
  }
  const body = WRITES.has(req.method) ? await readBody(req) : undefined;

  // ── harness only ──
  if (path.startsWith("/api/_")) {
    if (path === "/api/_reset" && req.method === "POST") { reset(); return send(req, res, 200, { reset: true }); }
    if (path === "/api/_log" && req.method === "GET") return send(req, res, 200, { requests: log });
    if (path === "/api/_state" && req.method === "GET") {
      return send(req, res, 200, { decks: [...decks.values()].map(deckOut), slides: [...slides.values()].map(slideOut) });
    }
    if (path === "/api/_fail" && req.method === "POST") {
      failNext = Math.max(0, Number(body?.count ?? 1)); failStatus = Number(body?.status ?? 503);
      return send(req, res, 200, { failing: failNext, status: failStatus });
    }
    if (path === "/api/_edit" && req.method === "POST") {
      const s = slides.get(body?.slideId);
      if (!s) return send(req, res, 404, { error: "not_found" });
      const next = { background: body.background ?? s.background, elements: body.elements ?? s.elements };
      const f = checkSlide(next);
      if (f) return send(req, res, 422, { error: "invalid", ...f });
      Object.assign(s, next); s.version += 1;
      decks.get(s.deckId).updatedAt = stamp();
      return send(req, res, 200, slideOut(s));
    }
    return send(req, res, 404, { error: "not_found" });
  }

  log.push({ t: Date.now(), method: req.method, path: path + url.search, body });
  if (WRITES.has(req.method)) {
    await sleep(WRITE_DELAY);
    if (failNext > 0) {
      failNext -= 1;
      return send(req, res, failStatus, { error: "unavailable", message: "The service isn't answering right now. Nothing was saved." });
    }
  }
  if (body === null) return send(req, res, 400, { error: "bad_json", message: "The body isn't valid JSON." });
  const out = route(req.method, path, body);
  send(req, res, out.code, out.body);
});

server.listen(PORT, "127.0.0.1", () => {
  if (!QUIET) console.log(`presentify service — http://127.0.0.1:${PORT} · ${decks.size} presentation, ${slides.size} slides`);
});
