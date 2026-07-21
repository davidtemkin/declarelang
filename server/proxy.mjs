// server/proxy.mjs — forward selected URL prefixes to a back end.
//
// Why this exists is worth stating, because the obvious answer is wrong. It is
// NOT for CORS: a back end can send `Access-Control-Allow-Origin` itself, and
// many already do. The proxy earns its place because it makes the app's own
// source contain RELATIVE urls:
//
//   • The identical compiled app works in production, where the UI and the API
//     really are one origin. No environment-specific urls in source, no
//     build-time substitution, no "which host am I on" branch.
//   • The static-extraction path survives. crawl.ts refuses an ABSOLUTE
//     DataSource url during extraction (a 422, by design — network-fetched data
//     is never indexed), so an app whose data is cross-origin cannot be crawled
//     and one whose data is same-origin can.
//
// Bare node:http, no dependency (packaging-options.md §5). Everything is STREAM
// PIPING, never buffering, so SSE and chunked responses work for free — which
// matters for LLM-backed endpoints that grow streaming variants.

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export class ProxyError extends Error {}

/** Hop-by-hop headers (RFC 7230 §6.1) — meaningful to one connection only, so a
 *  proxy must not forward them. `connection` itself names further ones. */
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

function stripHopByHop(headers) {
  const out = {};
  const extra = new Set(
    String(headers.connection ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || extra.has(lk)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Build the proxy table. `spec` is { "/prefix": "http://host:port", … }.
 *
 * Unlike MOUNTS, proxy prefixes may nest and the LONGEST match wins — routing
 * `/api` to one service and `/api/auth` to another is an ordinary thing to want,
 * and unlike a filesystem there is no "which file" ambiguity to protect against.
 * The banner prints the table so the routing is never a guess.
 */
export function createProxy(spec = {}) {
  const routes = Object.entries(spec).map(([prefix, target]) => {
    const p = prefix.startsWith("/") ? prefix : "/" + prefix;
    let url;
    try { url = new URL(String(target)); }
    catch { throw new ProxyError(`proxy target for ${p} is not a url: ${target}`); }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new ProxyError(`proxy target for ${p} must be http or https: ${target}`);
    return { prefix: p, target: url };
  }).sort((a, b) => b.prefix.length - a.prefix.length);  // longest first

  /** The route for a url path, or null. A prefix matches a path boundary only,
   *  so `/intent` never captures `/intentional-typo`. */
  function match(urlPath) {
    return routes.find((r) =>
      urlPath === r.prefix ||
      urlPath.startsWith(r.prefix.endsWith("/") ? r.prefix : r.prefix + "/") ||
      urlPath.startsWith(r.prefix + "?")) ?? null;
  }

  function forward(req, res, route) {
    const agent = route.target.protocol === "https:" ? https : http;
    const headers = stripHopByHop(req.headers);
    headers.host = route.target.host;                       // the back end sees its own name
    const fwd = req.socket.remoteAddress ?? "";
    headers["x-forwarded-for"] = req.headers["x-forwarded-for"] ? `${req.headers["x-forwarded-for"]}, ${fwd}` : fwd;
    headers["x-forwarded-proto"] = "http";
    if (req.headers.host) headers["x-forwarded-host"] = req.headers.host;

    const upstream = agent.request({
      protocol: route.target.protocol,
      hostname: route.target.hostname,
      port: route.target.port || (route.target.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: req.url,                                        // path + query, verbatim
      headers,
    }, (up) => {
      res.writeHead(up.statusCode ?? 502, stripHopByHop(up.headers));
      up.pipe(res);                                         // STREAM — never buffer (SSE)
    });

    upstream.on("error", (e) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`proxy: ${route.prefix} → ${route.target.origin} failed\n  ${e.message}\n\n` +
        `is the back end running?\n`);
    });
    req.pipe(upstream);                                     // STREAM the request body in
  }

  /** WebSocket. A WS connection begins as an HTTP request that MUTATES, and node
   *  surfaces it as the server's `upgrade` event. Proxying is a dumb socket pipe
   *  below the protocol: replay the handshake upstream and, on 101, join the two
   *  raw sockets. No frame parsing — the same thing http-proxy's `ws:true` does.
   *
   *  Declare's own dev loop needs no socket today (live recompile is POST
   *  /compile), so everything here is back-end traffic passing through untouched.
   *  Building it now also leaves the plumbing in place for a future
   *  `<platform>/ws` of Declare's own. */
  function forwardUpgrade(req, socket, head, route) {
    const agent = route.target.protocol === "https:" ? https : http;
    const headers = { ...req.headers, host: route.target.host };
    const upstream = agent.request({
      protocol: route.target.protocol,
      hostname: route.target.hostname,
      port: route.target.port || (route.target.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: req.url,
      headers,
    });
    upstream.on("upgrade", (upRes, upSocket, upHead) => {
      const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`];
      for (const [k, v] of Object.entries(upRes.headers))
        for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upHead && upHead.length) socket.unshift(upHead);
      upSocket.on("error", () => socket.destroy());
      socket.on("error", () => upSocket.destroy());
      upSocket.pipe(socket).pipe(upSocket);
    });
    upstream.on("error", () => socket.destroy());
    if (head && head.length) upstream.write(head);
    upstream.end();
  }

  const describe = () => routes.length === 0 ? null : (() => {
    // group by target so a shared back end reads as one line
    const byTarget = new Map();
    for (const r of routes) {
      const k = r.target.origin;
      byTarget.set(k, [...(byTarget.get(k) ?? []), r.prefix]);
    }
    return [...byTarget].map(([t, ps]) => `    ${ps.join("  ")}   →  ${t}`).join("\n");
  })();

  return { routes, match, forward, forwardUpgrade, describe };
}
