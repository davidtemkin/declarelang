// profile-mac — declare-profile --mac: the profile taken in the Mac host, where a
// program runs natively (docs/operational/mac-host.md), with the host's own frames.
//
// The runtime's half is the same profiler (runtime/src/profile.ts), reached through
// the host's control channel (`eval`, the __declare bridge): the turns, the rules,
// what was built, the drawings, and the frames as the program sees them (its
// animation frames ride the host's display link). The host's half is what only it
// can see: each frame's commit — the runtime's ops applied to the layer tree and
// Core Animation's commit — against the display's budget (Bridge.swift statsReport),
// which is where a drawing's cost lands on the Mac (drawn in the host, not a GPU
// process out of sight).
//
// The program is served by a server of this process's own; the host is launched
// with its control channel, in the background, and stopped by its PID when done.
// `--for <ms>` is how long to record; a person may use the window meanwhile (the
// session lets real input through).
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, unlinkSync } from "node:fs";
import { createDeclareServer } from "../../server/create.mjs";
import { CTL_IN, hostBinary, NO_HOST, stopStrayHosts } from "../../mac-host/app.mjs";
import { channel } from "../../mac-host/channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Profile `file` in the Mac host for `forMs`; answers `{ text, report, host }`. */
export async function profileOnMac({ file, forMs = 3000, why = true }) {
  const bin = hostBinary();
  if (process.platform !== "darwin" || bin === null) throw new Error(process.platform !== "darwin" ? "--mac profiles in the Mac host, which runs on macOS" : NO_HOST);
  stopStrayHosts(CTL_IN);
  const dir = path.dirname(path.resolve(file));
  const server = createDeclareServer({
    mountSpecs: [{ prefix: "/declare/", dir: ROOT, platform: true }, { prefix: "/", dir }],
    mode: "distro",
  });
  const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${httpServer.address().port}/${encodeURIComponent(path.basename(file))}`;
  const host = spawn(bin, [], { detached: true, stdio: "ignore", env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_URL: url } });
  const ctl = channel(CTL_IN);
  try {
    // up, and the program booted with its bridge
    let up = false;
    for (let i = 0; i < 150 && !up; i++) { try { up = (await ctl.send("ping", 500)) === "ok"; } catch { await sleep(100); } }
    if (!up) throw new Error("the Mac host never answered");
    await ctl.send("attach declare-profile input");
    let booted = false;
    for (let i = 0; i < 200 && !booted; i++) {
      const r = await ctl.send("eval typeof __declare === 'object' && __declare !== null && typeof __declare.profile === 'object' ? 'yes' : 'no'").catch(() => "no");
      booted = /yes/.test(r);
      if (!booted) await sleep(100);
    }
    if (!booted) throw new Error("the program did not boot in the Mac host (or its bridge lacks the profiler: rebuild the app with npm run build:mac)");
    await sleep(500);   // past the first frames
    await ctl.send("statsreset");
    await ctl.send(`eval __declare.profile.start({ why: ${why} }), 'ok'`);
    await sleep(forMs);
    const raw = await ctl.send("eval __declare.profile.stop(), JSON.stringify(__declare.profile.report())", 60000);
    const stats = await ctl.send("stats");
    await ctl.send("detach").catch(() => {});
    const report = JSON.parse(raw.replace(/^ok\s*/, ""));
    const text = await ctl.send(`eval __declare.profile.text()`, 60000);
    const hostFrames = macFrames(stats);
    return { report, host: hostFrames, text: text.replace(/^ok\s*/, "") + "\n\n" + macFramesText(hostFrames) };
  } finally {
    try { process.kill(host.pid); } catch { /* gone */ }
    httpServer.close();
    for (const p of [CTL_IN, CTL_IN.replace(/\.in$/, ".out")]) { try { if (existsSync(p)) unlinkSync(p); } catch { /* fine */ } }
  }
}

/** The host's frames, read from its stats report: commits against the display's budget. */
export function macFrames(s) {
  const num = (re) => { const m = s.match(re); return m === null ? null : m.slice(1).map(Number); };
  const commits = num(/commits=(\d+) over ([\d.]+)s/);
  const ms = num(/commit ms\s+p50=([\d.]+) p95=([\d.]+) max=([\d.]+)/);
  const gap = num(/gap ms\s+p50=([\d.]+) p95=([\d.]+) max=([\d.]+)\s+\(display budget ([\d.]+)\) over=(\d+)/);
  const ca = num(/CATransaction\.commit total=([\d.]+)ms \(\d+% of commit\)\s+of which CPU=([\d.]+)ms, WAITING=([\d.]+)ms/);
  const draw = num(/drawings shown=(\d+)\s+showMs total=([\d.]+)/);
  const text = num(/TextLayer\.draw n=(\d+) total=([\d.]+)ms/);
  const present = num(/PRESENT made=(\d+) missed=(\d+)\s+missedBy ms p50=([\d.]+) max=([\d.]+)/);
  return {
    commits: commits?.[0] ?? 0, seconds: commits?.[1] ?? 0,
    commitMs: ms === null ? null : { p50: ms[0], p95: ms[1], max: ms[2] },
    gapMs: gap === null ? null : { p50: gap[0], p95: gap[1], max: gap[2] }, budget: gap?.[3] ?? null, over: gap?.[4] ?? 0,
    coreAnimation: ca === null ? null : { ms: ca[0], cpu: ca[1], waiting: ca[2] },
    drawings: draw === null ? null : { n: draw[0], ms: draw[1] },
    text: text === null ? null : { n: text[0], ms: text[1] },
    present: present === null ? null : { made: present[0], missed: present[1], byP50: present[2], byMax: present[3] },
  };
}
const f1 = (n) => (n ?? 0).toFixed(1);
export function macFramesText(h) {
  if (h.commits === 0) return "frames in the Mac host: none committed while profiling";
  const out = [`frames in the Mac host: ${h.commits} committed in ${f1(h.seconds)} s · the display's budget ${f1(h.budget)} ms`];
  if (h.gapMs !== null) out.push(`  from one commit to the next: median ${f1(h.gapMs.p50)} ms · p95 ${f1(h.gapMs.p95)} · worst ${f1(h.gapMs.max)} · ${h.over} over one and a half budgets`);
  if (h.present !== null && h.present.made + h.present.missed > 0) out.push(`  to the screen: ${h.present.made} of ${h.present.made + h.present.missed} commits were done before their frame was due${h.present.missed > 0 ? `; ${h.present.missed} missed it, by ${f1(h.present.byP50)} ms (median), ${f1(h.present.byMax)} at worst, and were shown a frame or more later` : ""}`);
  if (h.commitMs !== null) out.push(`  a commit's own work (the runtime's changes applied to the layers, and Core Animation's commit): median ${f1(h.commitMs.p50)} ms · p95 ${f1(h.commitMs.p95)} · worst ${f1(h.commitMs.max)}`);
  const parts = [];
  if (h.coreAnimation !== null) parts.push(`Core Animation's commit ${f1(h.coreAnimation.ms)} ms (${f1(h.coreAnimation.cpu)} working, ${f1(h.coreAnimation.waiting)} waiting)`);
  if (h.drawings !== null && h.drawings.n > 0) parts.push(`drawings shown ×${h.drawings.n}, ${f1(h.drawings.ms)} ms`);
  if (h.text !== null && h.text.n > 0) parts.push(`text drawn ×${h.text.n}, ${f1(h.text.ms)} ms`);
  if (parts.length > 0) out.push(`  over the whole profile: ${parts.join(" · ")}`);
  out.push("  (the program's own frames follow the host's display link whatever the commits cost, so these are the ones that say how often a new picture reached the layers; the Mac draws a drawing in the host as it is shown, so its cost is in the commit, where a browser's lands in its GPU process)");
  return out.join("\n");
}
