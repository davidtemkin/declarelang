#!/usr/bin/env node
// converse.mjs — runs one engagement eval: an agent working with a (simulated) person,
// one message at a time. See evals/modes/README.md for the standard this is the record of.
//
//   converse.mjs <eval> <run-dir> --stack Declare|React --model <id>
//                [--commit <sha> | --local] [--user-model <id>] [--port <n>]
//
// The builder is one headless session kept open for the whole conversation, so what it
// starts (a dev server) stays up between turns as it would for a person. The user is a
// second session that sees the app only through see.mjs, and never the code.
import { spawn, execFileSync } from "node:child_process";
import { openSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, createWriteStream } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODES = resolve(HERE, "..");
const REPO = resolve(MODES, "../..");
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (n) => { const i = argv.indexOf(`--${n}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const STACK = opt("stack", "Declare");
const MODEL = opt("model");
const COMMIT = opt("commit");
const LOCAL = has("local");
const USER_MODEL = opt("user-model", MODEL);
let PORT = opt("port");
const [EVAL, RUN_ARG] = argv;
if (!EVAL || !RUN_ARG || !MODEL) { console.error("usage: converse.mjs <eval> <run-dir> --stack Declare|React --model <id> [--commit <sha> | --local] [--user-model <id>] [--port <n>]"); process.exit(2); }
const RUN = resolve(RUN_ARG);
const EV_DIR = join(MODES, "evals", EVAL);
const ev = JSON.parse(readFileSync(join(EV_DIR, "eval.json"), "utf8"));
const DECLARE = STACK.toLowerCase() === "declare";
if (existsSync(RUN)) { console.error(`${RUN} exists — a run directory is always fresh`); process.exit(1); }

const LOGS = join(RUN, "logs"), WORK = join(RUN, "work"), USER = join(LOGS, "user");
// frames: the harness's own picture of the app at each turn's end — for the conversation
// page (transcript.mjs), never filed: they go with the run directory
const FRAMES = join(LOGS, "frames");
for (const d of [LOGS, join(WORK, "task"), join(USER, "shots"), join(USER, "profile"), FRAMES]) mkdirSync(d, { recursive: true });
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...o });
const now = () => new Date().toISOString();
const record = [];
const note = (k, v) => { record.push(`${k}=${v}`); };

// ── the platform ─────────────────────────────────────────────────────────────
let subject = `none — ${STACK}`;
if (DECLARE) {
  const dist = join(WORK, "declarelang");
  if (LOCAL) {
    // the working tree as it stands: tracked files, with their uncommitted changes, and new files not ignored
    const files = sh("git", ["-C", REPO, "ls-files", "-co", "--exclude-standard"]).split("\n").filter(Boolean);
    for (const f of files) { const src = join(REPO, f); if (existsSync(src)) { mkdirSync(dirname(join(dist, f)), { recursive: true }); cpSync(src, join(dist, f)); } }
    const head = sh("git", ["-C", REPO, "log", "-1", "--format=%h %s"]).trim();
    const dirty = sh("git", ["-C", REPO, "status", "--porcelain"]).split("\n").filter(Boolean).length;
    sh("git", ["init", "-q"], { cwd: dist }); sh("git", ["add", "-A"], { cwd: dist }); sh("git", ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "distribution"], { cwd: dist });
    subject = `local working tree at ${head} with ${dirty} uncommitted path(s)`;
  } else {
    sh("git", ["clone", "-q", "https://github.com/davidtemkin/declarelang.git", dist]);
    if (COMMIT) sh("git", ["-C", dist, "checkout", "-q", COMMIT]);
    subject = `${sh("git", ["-C", dist, "log", "-1", "--format=%h %s"]).trim()} (GitHub)`;
  }
  // what would hand the agent an answer, as for craft runs
  for (const p of ["evals", "docs/system-design", "test"]) sh("rm", ["-rf", join(dist, p)]);
  subject += "; evals/, docs/system-design/, test/ removed";
}

// ── the app the person already has (change, tweak) ───────────────────────────
let appRel = null;
if (ev.seed) {
  const seed = join(MODES, "seeds", ev.seed, DECLARE ? "declare" : STACK.toLowerCase());
  if (!existsSync(seed)) { console.error(`no seed at ${seed}`); process.exit(1); }
  const dest = DECLARE ? join(WORK, "declarelang", "my-apps", ev.seed) : join(WORK, ev.seed);
  cpSync(seed, dest, { recursive: true });
  const brief = join(REPO, "evals", "apps", ev.service, "brief.md"), api = join(REPO, "evals", "apps", ev.service, "api", "API.md");
  if (existsSync(brief)) cpSync(brief, join(dest, "BRIEF.md"));
  if (existsSync(api)) cpSync(api, join(dest, "API.md"));
  cpSync(dest, join(LOGS, "seed"), { recursive: true });           // the diff is taken against this
  if (!DECLARE) {
    // an existing project: installed, and under version control as projects are
    note("SEED_INSTALL", "npm install (before the agent starts)");
    sh("npm", ["install", "--no-audit", "--no-fund"], { cwd: dest, stdio: "ignore" });
    writeFileSync(join(dest, ".gitignore"), "node_modules\ndist\n");
    sh("git", ["init", "-q"], { cwd: dest }); sh("git", ["add", "-A"], { cwd: dest });
    sh("git", ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "the app"], { cwd: dest });
  }
  appRel = relative(WORK, dest);
}
if (existsSync(join(EV_DIR, "assets"))) cpSync(join(EV_DIR, "assets"), join(WORK, "task"), { recursive: true });

// ── the service ──────────────────────────────────────────────────────────────
let servicePid = null;
if (ev.service) {
  const src = join(REPO, "evals", "apps", ev.service);
  const brief = readFileSync(join(src, "brief.md"), "utf8");
  // a seed may expect its service elsewhere (its own file says where)
  const seedPort = ev.seed ? join(MODES, "seeds", ev.seed, DECLARE ? "declare" : STACK.toLowerCase(), "service-port") : null;
  PORT = PORT ?? (seedPort && existsSync(seedPort) ? readFileSync(seedPort, "utf8").trim() : (brief.match(/\b83\d\d\b/) ?? ["8320"])[0]);
  const args = [join(src, "api", "server.mjs"), `--port=${PORT}`];
  if (existsSync(join(src, "fixtures"))) args.push("--seed=1");
  if (existsSync(join(src, "service-args"))) args.push(...readFileSync(join(src, "service-args"), "utf8").trim().split(/\s+/));
  const out = createWriteStream(join(LOGS, "service.log"));
  const svc = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
  svc.stdout.pipe(out); svc.stderr.pipe(out); svc.unref();
  servicePid = svc.pid;
  note("SERVICE", `node ${args.join(" ")} (pid ${servicePid})`);
  await new Promise((r) => setTimeout(r, 1500));
}

// what is listening before the agent starts: anything new at the end, running in the
// run's own folder, is what the agent left behind (a dev server outlives its shell)
const listeners = () => { try { return new Set(sh("lsof", ["-iTCP", "-sTCP:LISTEN", "-t"]).split("\n").filter(Boolean)); } catch { return new Set(); } };
const before = listeners();

// ── the opening ──────────────────────────────────────────────────────────────
const fill = (s) => s.replaceAll("{{app}}", appRel ?? "").replaceAll("{{port}}", PORT ?? "");
const opening = fill(readFileSync(join(EV_DIR, "opening.md"), "utf8").trim());
const framing = DECLARE ? "You have just downloaded the Declare distribution into `declarelang/`. Declare is a UI language not in your training data; that repository is the only source of truth and documents itself. Start at its README.md." : "";
const platformAsk = ev.seed ? "" : DECLARE ? " Use Declare." : ` Use ${STACK}.`;
const serviceLine = ev.service && !ev.seed ? ` The data service is described in \`task/api/API.md\` and is already running on port ${PORT}; do not modify it.` : ev.service ? ` Its data service is already running on port ${PORT}; do not modify it.` : "";
const first = [framing, opening + platformAsk + serviceLine].filter(Boolean).join("\n\n");
if (ev.service && !ev.seed) { mkdirSync(join(WORK, "task", "api"), { recursive: true }); cpSync(join(REPO, "evals", "apps", ev.service, "api", "API.md"), join(WORK, "task", "api", "API.md")); }
writeFileSync(join(LOGS, "prompt.txt"), first + "\n");

// ── two sessions ─────────────────────────────────────────────────────────────
const TOOLS = "Read,Glob,Grep,Bash,Write,Edit,WebSearch,WebFetch,Agent";
function session(name, model, cwd, tools, env = {}) {
  const stream = createWriteStream(join(LOGS, `${name}.stream.jsonl`), { flags: "a" });
  const p = spawn("claude", ["-p", "--model", model, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    "--tools", tools, "--allowedTools", tools, "--permission-mode", "acceptEdits", "--permission-prompts", "none", "--strict-mcp-config"],
    { cwd, stdio: ["pipe", "pipe", openSync(join(LOGS, `${name}.stderr`), "a")], env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", ...env } });
  let buf = "", waiting = null, lastText = "";
  // this message's work: each API call once, by its message id, at its latest usage (the
  // stream repeats it per part of a reply), and the tools it used, by name
  let calls = new Map(), used = {};
  const spent = () => {
    const u = { fresh: 0, cached: 0, written: 0, output: 0, calls: calls.size };
    for (const c of calls.values()) { u.fresh += c.input_tokens ?? 0; u.cached += c.cache_read_input_tokens ?? 0; u.written += c.cache_creation_input_tokens ?? 0; u.output += c.output_tokens ?? 0; }
    return { spent: u, tools: used };
  };
  p.stdout.on("data", (d) => {
    stream.write(d); buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === "assistant") {
        if (e.message?.id) calls.set(e.message.id, e.message.usage ?? {});
        for (const c of e.message?.content ?? []) {
          if (c.type === "text") lastText = c.text;
          if (c.type === "tool_use") used[c.name] = (used[c.name] ?? 0) + 1;
        }
      }
      if (e.type === "result" && waiting) { const w = waiting; waiting = null; w({ ...e, ...spent(), text: e.result ?? lastText }); }
    }
  });
  p.on("exit", (code) => { if (waiting) { const w = waiting; waiting = null; w({ type: "exit", code, ...spent(), text: lastText }); } });
  return {
    proc: p,
    say(text) {
      calls = new Map(); used = {};
      return new Promise((r) => { waiting = r; p.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n"); });
    },
    end() { try { p.stdin.end(); } catch { /* gone */ } },
  };
}

// a crash leaves nothing running: the service and both sessions go with it
let ended = false;
process.on("uncaughtException", (e) => {
  console.error(e);
  if (!ended) for (const pid of [servicePid, globalThis.__pids?.agent, globalThis.__pids?.user]) { try { if (pid) process.kill(pid); } catch { /* gone */ } }
  process.exit(1);
});
const builder = session("agent", MODEL, WORK, TOOLS);
const user = session("user", USER_MODEL, USER, "Bash,Read");
globalThis.__pids = { agent: builder.proc.pid, user: user.proc.pid };

const intents = ev.intents.map((t, i) => `${i}. ${t.ask.replaceAll("{{mockup}}", join(EV_DIR, "assets", "mockup.png"))}${t.device ? ` (by now you are on ${t.device})` : ""}`).join("\n");
const userBrief = readFileSync(join(HERE, "user.md"), "utf8")
  .replaceAll("{{persona}}", ev.persona).replaceAll("{{device}}", ev.device).replaceAll("{{intents}}", intents)
  .replaceAll("{{opening}}", opening).replaceAll("{{see}}", join(HERE, "see.mjs"))
  .replaceAll("{{profile}}", join(USER, "profile")).replaceAll("{{shots}}", join(USER, "shots"));

writeFileSync(join(LOGS, "started.txt"), [
  `STARTED=${now()}`, `EVAL=${EVAL} (${ev.kind})`, `STACK=${STACK}`, `MODEL=${MODEL}`, `USER_MODEL=${USER_MODEL}`,
  `SUBJECT=${subject}`, `APP=${appRel ?? "none"}`, `PORT=${PORT ?? "none"}`, `TOOLS=${TOOLS}`,
  `AGENT_PID=${builder.proc.pid}`, `USER_PID=${user.proc.pid}`, ...record, "",
].join("\n"));
console.log(readFileSync(join(LOGS, "started.txt"), "utf8"));

// ── the conversation ─────────────────────────────────────────────────────────
const ledger = join(LOGS, "turns.jsonl");
const jsonOf = (text) => {
  const blocks = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const b of blocks.reverse()) { try { return JSON.parse(b[1]); } catch { /* next */ } }
  return null;
};
const followups = new Map();
// The harness's picture of the app as the turn leaves it: the address the person last
// looked at, in their own browser profile (their saved data), on the device they are on
// by then — the latest intent reached that names one (`--phone`, `--dark`).
let reached = 0;
function frame(name, at) {
  reached = Math.max(reached, at ?? 0);
  if (!url) return;
  const dev = ev.intents.slice(0, reached + 1).map((t) => t.device).filter(Boolean).pop() ?? "";
  const flags = dev.match(/--phone|--dark/g) ?? [];
  const file = join(FRAMES, `${name}.png`);
  try {
    sh("node", [join(HERE, "see.mjs"), url, ...flags, "--profile", join(USER, "profile"), `shot:${file}`], { timeout: 90_000 });
    appendFileSync(ledger, JSON.stringify({ at: now(), role: "frame", name, file, device: flags.join(" ") || "laptop" }) + "\n");
  } catch (e) { appendFileSync(ledger, JSON.stringify({ at: now(), role: "frame", name, error: String(e.message).split("\n")[0] }) + "\n"); }
}
let message = first, turn = 1, asking = 0, url = null;
const maxTurns = ev.maxTurns ?? 10;
let userPrimed = false;
while (message && turn <= maxTurns) {
  const t0 = Date.now();
  appendFileSync(ledger, JSON.stringify({ turn, at: now(), role: "person", asking, text: message }) + "\n");
  const r = await builder.say(message);
  const secs = Math.round((Date.now() - t0) / 1000);
  appendFileSync(ledger, JSON.stringify({ turn, at: now(), role: "agent", secs, agentTurns: r.num_turns, spent: r.spent, tools: r.tools, durationMs: r.duration_ms, text: r.text }) + "\n");
  console.log(`turn ${turn}: the agent replied after ${secs}s (${r.num_turns ?? "?"} turns)`);
  if (r.type === "exit") break;
  const ask = `${userPrimed ? "" : userBrief + "\n\n---\n\n"}This is turn ${turn}. The agent replied:\n\n<<<\n${r.text}\n>>>\n\nLook at the app now, as you would, and answer with the JSON block.`;
  userPrimed = true;
  const u0 = Date.now();
  const u = await user.say(ask);
  const j = jsonOf(u.text) ?? { verdict: "unreadable", next: null };
  if (j.url) url = j.url;
  appendFileSync(ledger, JSON.stringify({ turn, at: now(), role: "verdict", userSecs: Math.round((Date.now() - u0) / 1000), userSpent: u.spent, userTools: u.tools, ...j }) + "\n");
  frame(`t${turn}`, j.judged ?? asking);
  console.log(`turn ${turn}: request ${j.judged} ${j.verdict} — ${j.saw ?? ""}`);
  // the bounds: two follow-ups per request, then on
  if (j.next && j.followup) {
    const n = (followups.get(j.asking) ?? 0) + 1;
    followups.set(j.asking, n);
    if (n > 2) {
      const r2 = await user.say("That would be a third follow-up on the same request. Leave it as it is and move on: answer again with the JSON block, with your next request (or null if none is left).");
      const j2 = jsonOf(r2.text);
      if (j2) Object.assign(j, j2);
    }
  }
  message = j.next ?? null;
  asking = j.asking ?? asking;
  turn++;
}

// ── the end: the person's summary, the acceptance where there is one, then stop ─
frame("final", ev.intents.length - 1);
const summary = await user.say(`The session is over. For each of your requests (0–${ev.intents.length - 1}), give your final verdict as it stands now (look again if you need to). Answer with one JSON block: {"final": [{"request": 0, "verdict": "done | partly | not done | never asked", "why": "…"}], "overall": "one or two sentences, as the person, on how it went"}.`);
appendFileSync(ledger, JSON.stringify({ at: now(), role: "summary", userSpent: summary.spent, ...(jsonOf(summary.text) ?? { text: summary.text }) }) + "\n");
if (ev.accept && url) {
  try {
    const out = sh("node", [join(REPO, ev.accept), url, `--service=http://127.0.0.1:${PORT}`, `--out=${join(LOGS, "accept")}`], { timeout: 900_000 });
    writeFileSync(join(LOGS, "accept.txt"), out);
  } catch (e) { writeFileSync(join(LOGS, "accept.txt"), String(e.stdout ?? "") + String(e.stderr ?? "") + String(e.message)); }
}
if (appRel) {
  // against the seed as handed over (diff exits 1 when there are differences)
  const x = ["-x", "node_modules", "-x", "dist", "-x", ".git", "-x", "package-lock.json"];
  const diff = (args) => { try { return sh("diff", args, { maxBuffer: 64 << 20 }); } catch (e) { return String(e.stdout ?? ""); } };
  writeFileSync(join(LOGS, "diff.txt"), diff(["-rq", ...x, join(LOGS, "seed"), join(WORK, appRel)]) + "\n" + diff(["-ruN", ...x, join(LOGS, "seed"), join(WORK, appRel)]));
}
// what the builder left running, deepest first, then the sessions
const tree = (pid) => { let kids = []; try { kids = sh("pgrep", ["-P", String(pid)]).split("\n").filter(Boolean); } catch { /* none */ } return kids.flatMap((k) => [...tree(k), k]); };
for (const p of tree(builder.proc.pid)) { try { process.kill(Number(p)); appendFileSync(join(LOGS, "finish.log"), `stopped ${p}\n`); } catch { /* gone */ } }
for (const p of listeners()) {
  if (before.has(p) || String(p) === String(servicePid)) continue;
  let cwd = ""; try { cwd = sh("lsof", ["-a", "-d", "cwd", "-p", p, "-Fn"]).split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? ""; } catch { /* gone */ }
  if (cwd.startsWith(RUN)) { try { process.kill(Number(p)); appendFileSync(join(LOGS, "finish.log"), `stopped ${p} (listening, in ${cwd})\n`); } catch { /* gone */ } }
}
builder.end(); user.end();
await new Promise((r) => setTimeout(r, 3000));
for (const s of [builder, user]) { try { process.kill(s.proc.pid); } catch { /* exited */ } }
ended = true;
appendFileSync(join(LOGS, "started.txt"), `ENDED=${now()}\nSERVICE_PID=${servicePid ?? "none"} (left up for scoring; stop it by pid once filed)\n`);
console.log(`done — ${ledger}\nthe conversation: node ${join(HERE, "transcript.mjs")} ${RUN}`);
process.exit(0);
