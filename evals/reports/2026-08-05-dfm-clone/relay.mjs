#!/usr/bin/env node
// relay.mjs — the sanctioned local relay for the discover.fm replication run.
//
// It does exactly three things and no more: FETCH a discover.fm page (once per
// run, then from disk), EXTRACT the props already embedded in the page's Next.js
// RSC flight payload, and RETURN them as plain JSON with CORS open. There is no
// rendering logic here — every shaping decision belongs to the Declare app.
//
//   GET /api/home                 → { slides: [...] }
//   GET /api/browse?sort=featured → { curators: [...] }      (also top | new)
//   GET /api/curator/:slug        → { hero, curator, description, tracks: [...] }
//   GET /api/legal/:page          → { title, blocks: [...] } (privacy | terms)
//
// Politeness: every upstream URL is fetched AT MOST ONCE and written to
// task/.cache/. A cached file is never revalidated; delete the cache to refresh.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8330;
const CACHE = path.join(import.meta.dirname, ".cache");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0 Safari/537.36";

fs.mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------- fetch + cache

async function page(name, url) {
  const file = path.join(CACHE, name + ".html");
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file, "utf8");
  console.log("  fetch", url);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  const html = await res.text();
  fs.writeFileSync(file, html);
  return html;
}

// ------------------------------------------------------- image natural sizes
//
// Declare's Image has no `object-fit: cover` and no natural-size read, so the
// app computes cover geometry itself — which needs each bitmap's real aspect.
// We read it from the file header only: a single ranged request for the first
// 64 KB, then a tiny JPEG/PNG/WebP header parse. Results are cached forever.

const DIMS = path.join(CACHE, "image-dims.json");
const dims = fs.existsSync(DIMS) ? JSON.parse(fs.readFileSync(DIMS, "utf8")) : {};
let dimsDirty = false;

function parseSize(b) {
  // PNG
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  // WebP (VP8X / VP8L / VP8)
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const fmt = b.toString("ascii", 12, 16);
    if (fmt === "VP8X") return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (fmt === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (fmt === "VP8L") {
      const n = b.readUInt32LE(21);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
  }
  // JPEG: walk the segment chain to the first SOF marker.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function imageSize(url) {
  if (!url) return null;
  if (dims[url]) return dims[url];
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, range: "bytes=0-65535" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const s = parseSize(buf);
    if (s) {
      dims[url] = s;
      dimsDirty = true;
    }
    return s;
  } catch {
    return null;
  }
}

/** Attach `w`/`h` to every listed image URL on the payload, in one batch. */
async function withSizes(urls) {
  const uniq = [...new Set(urls.filter(Boolean))];
  const out = {};
  for (const u of uniq) {
    const s = await imageSize(u);
    if (s) out[u] = s;
  }
  if (dimsDirty) {
    fs.writeFileSync(DIMS, JSON.stringify(dims, null, 1));
    dimsDirty = false;
  }
  return out;
}

/** The RSC flight payload: every self.__next_f.push chunk, concatenated. */
function flight(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  const parts = [];
  let m;
  while ((m = re.exec(html))) parts.push(JSON.parse(m[1]));
  return parts.join("");
}

/**
 * Read the JSON value that starts at `from` inside `s`, by balancing brackets
 * outside of strings. The flight payload is a stream of RSC rows, not one JSON
 * document, so JSON.parse cannot be pointed at the whole thing.
 */
function jsonAt(s, from) {
  const open = s[from];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(from, i + 1));
    }
  }
  throw new Error("unbalanced JSON at " + from);
}

/** Find `"<key>":` and parse the object/array that follows it. */
function pick(s, key) {
  const at = s.indexOf('"' + key + '":');
  if (at < 0) return null;
  let i = at + key.length + 3;
  while (i < s.length && s[i] !== "{" && s[i] !== "[") {
    if (s.startsWith("null", i)) return null;
    i++;
  }
  return jsonAt(s, i);
}

// ---------------------------------------------------------------- extractors

async function home() {
  const f = flight(await page("home", "https://discover.fm/"));
  const carousel = pick(f, "promoCarousel");
  const slides = (carousel && carousel.slides) || [];
  // Slide 0 is not in the payload: the value-props slide is authored into the
  // page itself, with a fixed asset. The app draws it; the relay only reports
  // the asset's natural size alongside the data-driven ones.
  const VALUE_PROPS = "https://discover.fm/images/promo-carousel/home-value-props-placeholder.webp";
  return {
    slides,
    valuePropsImage: VALUE_PROPS,
    sizes: await withSizes([VALUE_PROPS, ...slides.map((s) => s.heroImageUrl)]),
  };
}

const SORTS = {
  featured: ["browse", "https://discover.fm/browse"],
  top: ["browse-followers", "https://discover.fm/browse?sort=followers"],
  new: ["browse-new", "https://discover.fm/browse?sort=new"],
};

async function browse(sort) {
  const [name, url] = SORTS[sort] || SORTS.featured;
  const f = flight(await page(name, url));
  const curators = pick(f, "browseCurators") || [];
  return { sort, curators, sizes: await withSizes(curators.map((c) => c.image)) };
}

async function curator(slug) {
  const f = flight(await page("curator-" + slug, "https://discover.fm/curator/" + slug));
  // The curator page's client component is handed one props object; the fields
  // we want sit at its top level. `tracks` anchors the right one.
  const at = f.indexOf('"tracks":[');
  if (at < 0) return { found: false, slug };
  let start = at;
  while (start > 0 && f[start] !== "{") start--;
  // Walk out to the enclosing object that carries `curator` as well.
  for (let guard = 0; guard < 40; guard++) {
    try {
      const obj = jsonAt(f, start);
      if (obj && obj.tracks && obj.curator) {
        const portrait = obj.curator.portraitImage || (obj.hero && obj.hero.heroImage) || "";
        return {
          found: true,
          slug,
          hero: obj.hero || null,
          curator: obj.curator,
          description: obj.description || "",
          playlistTitle: (obj.hero && obj.hero.title) || "",
          updatedAt: (obj.hero && obj.hero.updatedAt) || "",
          tracks: obj.tracks,
          sizes: await withSizes([portrait, obj.hero && obj.hero.heroImage]),
        };
      }
    } catch {
      /* keep walking outward */
    }
    start--;
    while (start > 0 && f[start] !== "{") start--;
    if (start <= 0) break;
  }
  return { found: false, slug };
}

/**
 * Privacy / terms: only the page's own heading and effective date. The brief
 * sanctions a static placeholder for these, so the relay deliberately does NOT
 * mirror the site's legal prose — it returns the chrome the app needs and a link
 * back to the authoritative document.
 */
async function legal(which) {
  const html = await page(which, "https://discover.fm/" + which);
  const clean = (s) =>
    s
      .replace(/<[^>]+>|<!--[\s\S]*?-->/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const eff = /Effective date:[\s\S]{0,120}?<\/p>/.exec(html);
  return {
    page: which,
    heading: h1 ? clean(h1[1]) : which,
    effective: eff ? clean(eff[0]) : "",
    source: "https://discover.fm/" + which,
  };
}

// ---------------------------------------------------------------- server

const routes = async (url) => {
  const u = new URL(url, "http://x");
  const p = u.pathname;
  if (p === "/api/home") return home();
  if (p === "/api/browse") return browse(u.searchParams.get("sort") || "featured");
  if (p.startsWith("/api/curator/")) return curator(decodeURIComponent(p.slice(13)));
  if (p === "/api/legal/privacy") return legal("privacy");
  if (p === "/api/legal/terms") return legal("terms");
  return null;
};

http
  .createServer(async (req, res) => {
    const head = {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    try {
      const body = await routes(req.url);
      if (!body) {
        res.writeHead(404, head);
        return res.end(JSON.stringify({ error: "no such route", url: req.url }));
      }
      res.writeHead(200, head);
      res.end(JSON.stringify(body));
    } catch (e) {
      console.error(req.url, e);
      res.writeHead(500, head);
      res.end(JSON.stringify({ error: String(e && e.message) }));
    }
  })
  .listen(PORT, () => console.log(`relay on http://127.0.0.1:${PORT}  (cache: ${CACHE})`));
