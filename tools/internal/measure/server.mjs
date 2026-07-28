// Gesture-measurement beacon server. Serves ./pages and appends every POST
// /beacon line to ./results.jsonl — the durable record a later session reads.
// No dependencies. Run:  node tools/internal/measure/server.mjs
import http from "node:http";
import { readFile, appendFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "pages");
const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "results.jsonl");
const PORT = 8377;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/beacon") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const line = JSON.stringify({ at: new Date().toISOString(), ...safeParse(body) });
    await appendFile(RESULTS, line + "\n");
    console.log(line);
    res.writeHead(204).end();
    return;
  }
  const path = req.url === "/" ? "/index.html" : (req.url ?? "/").split("?")[0];
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});

function safeParse(s) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`gesture lab up:`);
  console.log(`  Simulator:  http://127.0.0.1:${PORT}/`);
  for (const addrs of Object.values(networkInterfaces()))
    for (const a of addrs ?? [])
      if (a.family === "IPv4" && !a.internal) console.log(`  device:     http://${a.address}:${PORT}/`);
  console.log(`  results →  ${RESULTS}`);
});
