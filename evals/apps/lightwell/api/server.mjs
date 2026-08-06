// Lightwell fixture — a dumb photo service. GIVEN to the agent, never written by it.
//
// Deliberately knows NOTHING about image dimensions: the manifest is names and
// titles only, so an app that needs a picture's shape must learn it from the
// picture — which is the point of the brief. Reflections are generated
// deterministically from the title, so every run reads the same words.
//
//   node evals/apps/lightwell/api/server.mjs [--port=8340] [--photos=<dir>]
//
// The photo payload is NOT committed: at sandbox setup, copy the corpus
// (e.g. ~/Code/Mesa/sample-files/originals/jpeg — 560 files, 67MB) into the
// sandbox at task/api/photos/ and it dies with the tree. --photos overrides.
import { createServer } from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split("=").slice(1).join("=");
const PORT = Number(arg("port", "8340"));
const DIR = arg("photos", join(HERE, "photos"));

const files = existsSync(DIR) ? readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f)).sort() : [];
const title = f => f.replace(/\.jpe?g$/i, "");
const hash = s => { let h = 0x811C9DC5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const OPENERS = ["Shot on a still morning,", "Found by accident,", "Waited an hour for this light —", "One frame, no second chance:", "From the far end of the walk,", "Late, and nearly didn't stop —"];
const MIDDLES = ["the kind of scene that looks staged and isn't.", "everything in it arranged by nobody.", "the color did all the work.", "what the place actually felt like.", "geometry first, subject second.", "it only reads at full size."];
const CLOSERS = ["Print it big.", "The edges matter here.", "Look at the corners.", "Best of that day.", "Almost deleted it. Glad I didn't.", "It grew on me."];
const reflect = t => `${OPENERS[hash(t) % 6]} ${MIDDLES[hash(t + "m") % 6]} ${CLOSERS[hash(t + "c") % 6]}`;

const photos = files.map((f, i) => ({ id: `p${String(i + 1).padStart(3, "0")}`, file: `/photos/${encodeURIComponent(f)}`, title: title(f), reflection: reflect(title(f)) }));
const byFile = new Map(files.map(f => [encodeURIComponent(f), f]));
const CORS = { "access-control-allow-origin": "*" };

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/photos") {
    const q = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const out = q ? photos.filter(p => p.title.toLowerCase().includes(q)) : photos;
    res.writeHead(200, { ...CORS, "content-type": "application/json" });
    return res.end(JSON.stringify({ photos: out }));
  }
  const m = url.pathname.match(/^\/photos\/(.+)$/);
  if (m && byFile.has(m[1])) {
    res.writeHead(200, { ...CORS, "content-type": "image/jpeg", "cache-control": "public, max-age=86400" });
    return res.end(readFileSync(join(DIR, byFile.get(m[1]))));
  }
  res.writeHead(404, CORS); res.end("{}");
}).listen(PORT, "127.0.0.1", () => console.log(`lightwell — ${photos.length} photographs on :${PORT} (dir: ${DIR})`));
