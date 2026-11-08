#!/usr/bin/env node
// Conduit's backend: the RealWorld API (specs/api/openapi.yml), in memory.
//
//   node api/server.mjs [--port=8380] [--now=2026-11-08T12:00:00Z]
//
// The community (users, articles, follows, favorites, comments) is generated
// from a seeded PRNG, dated relative to --now (default: the moment the process
// starts). The same --now gives identical bytes. A write is stamped with --now
// plus the time since start, never earlier than the previous write, so
// createdAt/updatedAt always move forward. Writes live for the life of the
// process.

import { createServer } from "node:http";
import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const flag = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PORT = Number(flag("port", 8380));
const TEST_HOOKS = process.argv.includes("--test-hooks");
const STARTED = Date.now();
const NOW = (() => {
  const given = flag("now", null);
  if (given === null) return Math.floor(STARTED / 1000) * 1000;
  const t = Date.parse(given);
  if (Number.isNaN(t)) { console.error("--now must be an ISO date-time, e.g. 2026-11-08T12:00:00Z"); process.exit(2); }
  return t;
})();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DAY = 86400000, HOUR = 3600000, MIN = 60000;

// The clock for writes: --now plus elapsed time, strictly increasing.
let lastStamp = 0;
function clock() {
  const t = Math.max(NOW + (Date.now() - STARTED), lastStamp + 1);
  lastStamp = t;
  return t;
}
const iso = (ms) => new Date(ms).toISOString();
const sec = (ms) => Math.floor(ms / 1000) * 1000;

// ── seeded randomness ────────────────────────────────────────────────────────
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
function rngFor(key) {
  let a = hash(`conduit:${key}`);
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r(); r();
  return r;
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
function sample(r, xs, n) {
  const pool = xs.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

// ── passwords and tokens ─────────────────────────────────────────────────────
const JWT_SECRET = "conduit-local-secret-7f3a9c2e";
const TOKEN_DAYS = 60;
function hashPassword(password, saltKey) {
  const salt = createHash("sha256").update(`salt:${saltKey}`).digest("hex").slice(0, 32);
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}
function checkPassword(password, stored) {
  const [, salt, hex] = stored.split("$");
  const want = Buffer.from(hex, "hex");
  const got = scryptSync(password, salt, want.length);
  return timingSafeEqual(want, got);
}
const b64url = (x) => Buffer.from(x).toString("base64url");
function signToken(user) {
  const iat = Math.floor(clock() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ id: user.id, username: user.username, iat, exp: iat + TOKEN_DAYS * 86400 }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const sig = createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (given.length !== sig.length || !timingSafeEqual(given, sig)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
  if (!payload || typeof payload.id !== "number") return null;
  if (typeof payload.exp === "number" && payload.exp * 1000 < NOW + (Date.now() - STARTED)) return null;
  return payload;
}

// ── the community ────────────────────────────────────────────────────────────
// [username, email, password, bio, avatar colour or null (null = no image)]
const PEOPLE = [
  ["jake", "jake@jake.jake", "jakejake", "Frontend developer in Lisbon. I write about JavaScript, the web platform and shipping small things.", "#5cb85c"],
  ["johndoe", "johndoe@conduit.test", "password123", "Backend engineer. Postgres enthusiast. Occasional Rust tinkerer.", "#3d8bfd"],
  ["mira_chen", "mira@conduit.test", "password123", "Design systems lead. Accessibility is not optional.", "#d63384"],
  ["tomasz", "tomasz@conduit.test", "password123", "SRE at a payments company. Mostly writing about incidents and how to have fewer of them.", null],
  ["amara.okafor", "amara@conduit.test", "password123", "Engineering manager, former teacher. Careers, mentoring and feedback.", "#fd7e14"],
  ["leo_park", "leo@conduit.test", "password123", null, "#6f42c1"],
  ["sofia_r", "sofia@conduit.test", "password123", "Freelance web developer and CSS nerd. <b>Bold</b> claims, plain text.", null],
  ["devon", "devon@conduit.test", "password123", "Testing all the things. Opinions on flaky tests available on request.", "#20c997"],
  ["priya_n", "priya@conduit.test", "password123", "Data engineer by day, home baker by night.", "#e0a800"],
  ["hugo.martin", "hugo@conduit.test", "password123", "Rust and systems programming. Slowly rewriting everything.", null],
  ["nadia_k", "nadia@conduit.test", "password123", null, null],
  ["eli_w", "eli@conduit.test", "password123", "Productivity, tools and the occasional mechanical keyboard.", "#0dcaf0"],
];
const avatarUrl = (username) => `${ORIGIN}/images/avatars/${username}.svg`;
const AVATAR_COLOUR = new Map(PEOPLE.filter((p) => p[4]).map((p) => [p[0], p[4]]));
function avatarSvg(username) {
  const colour = AVATAR_COLOUR.get(username);
  const letters = username.replace(/[^a-z]/gi, " ").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" fill="${colour}"/>` +
    `<text x="64" y="64" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="600" fill="#fff">${letters}</text></svg>`;
}

// [author, title, description, tags]
const POSTS = [
  ["jake", "How I Structure Small JavaScript Projects", "Folders, modules and the few rules I actually follow.", ["javascript", "webdev"]],
  ["jake", "Understanding the Event Loop Without the Diagrams", "Microtasks, macrotasks and why your setTimeout runs late.", ["javascript", "node"]],
  ["jake", "A Gentle Introduction to Web Components", "Custom elements, shadow DOM and when they make sense.", ["javascript", "webdev"]],
  ["jake", "Debouncing vs Throttling, Explained Once and for All", "Two small functions that keep your UI responsive.", ["javascript", "react"]],
  ["jake", "Why I Stopped Using Default Exports", "A tiny convention that made refactoring painless.", ["javascript", "typescript"]],
  ["jake", "Lessons From Shipping a Side Project in a Weekend", "Scope ruthlessly, deploy early, and write it down.", ["productivity", "webdev"]],
  ["jake", "The Fetch API Has More Options Than You Think", "AbortController, credentials, cache modes and friends.", ["javascript", "webdev"]],
  ["johndoe", "Indexing Strategies for Postgres Beginners", "B-tree, partial and expression indexes in plain words.", ["databases"]],
  ["johndoe", "Writing Your First REST API in Node", "Routing, validation and errors with no framework at all.", ["node", "javascript"]],
  ["johndoe", "Transactions and Isolation Levels Demystified", "What READ COMMITTED actually protects you from.", ["databases"]],
  ["johndoe", "Rust for JavaScript Developers", "Ownership explained through things you already know.", ["rust", "javascript"]],
  ["johndoe", "Pagination Done Right: Offset vs Cursor", "Trade-offs every API designer should know.", ["databases", "webdev"]],
  ["johndoe", "Structured Logging in Node.js", "Stop grepping strings and start querying events.", ["node", "devops"]],
  ["johndoe", "Escaping User Content: <script> Tags and You", "Why <img src=x onerror=\"alert(1)\"> must never run in your app.", ["security", "javascript", "webdev"]],
  ["mira_chen", "Building an Accessible Modal Dialog", "Focus traps, the Escape key and aria-modal done properly.", ["accessibility", "javascript", "react"]],
  ["mira_chen", "Design Tokens Are a Contract", "How naming colours and spacing keeps teams in sync.", ["design", "css"]],
  ["mira_chen", "Colour Contrast Is Not a Suggestion", "Checking WCAG ratios early saves painful redesigns.", ["accessibility", "design"]],
  ["mira_chen", "A Keyboard Navigation Checklist", "Ten things to test before every release.", ["accessibility", "testing"]],
  ["mira_chen", "Spacing Systems That Scale", "A 4px grid and the discipline to stick to it.", ["design", "css"]],
  ["mira_chen", "Icons Need Labels Too", "Screen readers can't see your clever glyphs.", ["accessibility", "design", "react"]],
  ["tomasz", "Writing Postmortems People Actually Read", "Blameless, short and focused on what changes next.", ["devops", "career"]],
  ["tomasz", "Alert Fatigue Is a Design Problem", "Every page should be actionable, or it should not exist.", ["devops"]],
  ["tomasz", "What a Dockerfile Really Does", "Layers, caches and why your image is 2 GB.", ["devops", "node"]],
  ["tomasz", "Feature Flags Without the Chaos", "Naming, ownership and cleaning up after yourself.", ["devops", "javascript"]],
  ["tomasz", "Health Checks That Tell the Truth", "Liveness, readiness and the dependencies in between.", ["devops", "node"]],
  ["amara.okafor", "Giving Feedback That Lands", "Specific, timely and about the work, not the person.", ["career"]],
  ["amara.okafor", "Your First 90 Days as an Engineering Manager", "Listen first, change things later.", ["career", "productivity"]],
  ["amara.okafor", "Keep a Brag Document", "Track your impact before review season sneaks up on you.", ["career", "productivity"]],
  ["amara.okafor", "Mentoring Junior Developers Remotely", "Pairing, office hours and psychological safety.", ["career", "webdev"]],
  ["amara.okafor", "Code Review Is a Conversation", "Ask questions, explain intent, approve generously.", ["career", "webdev"]],
  ["leo_park", "TypeScript Generics in Practice", "From identity functions to typed API clients.", ["typescript", "javascript"]],
  ["leo_park", "Discriminated Unions Will Change How You Model State", "Make impossible states impossible.", ["typescript", "react"]],
  ["leo_park", "Strict Mode Is Worth the Pain", "Turning on strictNullChecks in a 50k-line codebase.", ["typescript"]],
  ["leo_park", "Typing Fetch Responses Safely", "Runtime validation at the edges of your app.", ["typescript", "javascript"]],
  ["leo_park", "React Context Without Re-render Storms", "Split providers, memoize values, measure first.", ["react", "javascript", "typescript"]],
  ["leo_park", "Template Literal Types Are Wild", "Typed routes, event names and CSS units.", ["typescript"]],
  ["sofia_r", "CSS Grid Layouts for Real Pages", "Named areas, auto-fit and the minmax trick.", ["css", "webdev"]],
  ["sofia_r", "Container Queries Are Finally Here", "Components that respond to their own space.", ["css", "design"]],
  ["sofia_r", "The Cascade Is Your Friend", "Layers, specificity and writing less CSS.", ["css"]],
  ["sofia_r", "Animating Height Without Tears", "Grid rows, a little JavaScript and a few caveats.", ["css", "javascript"]],
  ["sofia_r", "Responsive Images Without the Headache", "srcset, sizes and the picture element.", ["webdev", "css"]],
  ["sofia_r", "Dark Mode With Custom Properties", "One set of tokens, two themes, zero flashes.", ["css", "design", "javascript"]],
  ["devon", "Flaky Tests Are Bugs", "Treat nondeterminism as a defect, not a nuisance.", ["testing", "javascript"]],
  ["devon", "Testing React Components the Way Users Use Them", "Query by role, not by class name.", ["testing", "react", "javascript"]],
  ["devon", "Mocking Less, Testing More", "Fakes, real dependencies and where to draw the line.", ["testing", "node"]],
  ["devon", "Snapshot Tests Considered Harmful?", "When snapshots help and when they quietly rot.", ["testing", "react"]],
  ["devon", "End-to-End Tests That Don't Break Every Week", "Stable selectors, seeded data and patience.", ["testing", "javascript"]],
  ["devon", "Property-Based Testing for the Curious", "Let the computer invent your edge cases.", ["testing", "typescript", "javascript"]],
  ["priya_n", "From CSV Chaos to a Clean Pipeline", "Validating, deduplicating and loading messy data.", ["databases", "node"]],
  ["priya_n", "SQL Window Functions You Will Use Every Week", "Running totals, rankings and gaps between rows.", ["databases"]],
  ["priya_n", "Streams in Node.js for Large Files", "Process gigabytes without running out of memory.", ["node", "javascript"]],
  ["priya_n", "Choosing Between JSON Columns and a Real Schema", "When jsonb helps and when it hurts.", ["databases"]],
  ["priya_n", "Idempotent Jobs Save Weekends", "Design every batch job so it can safely run twice.", ["databases", "devops"]],
  ["hugo.martin", "Error Handling in Rust Without Tears", "Result, the ? operator and custom error types.", ["rust"]],
  ["hugo.martin", "Compiling Rust to WebAssembly", "Shipping a tiny wasm module to the browser.", ["rust", "javascript", "webdev"]],
  ["hugo.martin", "Lifetimes Are Just Scopes With Names", "A practical way to read those apostrophes.", ["rust"]],
  ["eli_w", "My Terminal Setup, Explained", "Shell, prompt, fonts and the aliases I use daily.", ["productivity"]],
  ["eli_w", "Keyboard Shortcuts Every Developer Should Learn", "Small habits, big time savings.", ["productivity", "webdev"]],
  ["eli_w", "Deep Work for Developers", "Protecting focus in a world of notifications.", ["productivity", "career"]],
  ["eli_w", "Writing Better Commit Messages", "Future you will thank present you.", ["productivity", "career"]],
];

// Body fragments per tag: [why-it-matters paragraph, list items, code block (lang, text), links]
const TOPIC = {
  javascript: ["JavaScript rewards small, boring functions. Most of the bugs I have shipped came from clever code that tried to do three things at once, and most of the fixes were deleting the cleverness.",
    ["Keep modules small and named after what they do", "Prefer plain data over classes until you need behaviour", "Measure before you optimise"],
    ["js", "export function debounce(fn, wait = 200) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), wait);\n  };\n}"],
    [["MDN JavaScript Guide", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide"]]],
  node: ["Node is at its best when you lean into streams and events instead of fighting them. A server that never blocks the event loop can handle far more than you would expect from a single process.",
    ["Never block the event loop with synchronous work", "Handle errors at the edge and log them with context", "Use the built-in test runner before reaching for a framework"],
    ["js", "import { createServer } from \"node:http\";\n\ncreateServer((req, res) => {\n  res.writeHead(200, { \"content-type\": \"application/json\" });\n  res.end(JSON.stringify({ ok: true }));\n}).listen(3000);"],
    [["Node.js documentation", "https://nodejs.org/docs/latest/api/"]]],
  webdev: ["The web platform has quietly absorbed most of what we used to need libraries for. Before adding a dependency, it is worth checking what the browser already does well.",
    ["Start with semantic HTML", "Progressively enhance with JavaScript", "Test on a slow phone, not just your laptop"],
    ["html", "<form method=\"post\" action=\"/subscribe\">\n  <label for=\"email\">Email</label>\n  <input id=\"email\" name=\"email\" type=\"email\" required>\n  <button>Subscribe</button>\n</form>"],
    [["web.dev", "https://web.dev/"]]],
  react: ["React components are easiest to reason about when state lives as close as possible to where it is used. Lifting state is a tool, not a default.",
    ["Derive values instead of syncing them with effects", "Keep components pure and side effects explicit", "Profile before reaching for memo"],
    ["jsx", "function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>;\n}"],
    [["React documentation", "https://react.dev/learn"]]],
  typescript: ["Types are documentation the compiler checks for you. The goal is not to type everything as precisely as possible but to make the wrong thing hard to write.",
    ["Turn on strict mode early", "Validate data at the boundaries of your program", "Prefer unions over optional fields for state"],
    ["ts", "type Result<T> =\n  | { status: \"loading\" }\n  | { status: \"error\"; message: string }\n  | { status: \"done\"; value: T };"],
    [["TypeScript Handbook", "https://www.typescriptlang.org/docs/handbook/intro.html"]]],
  css: ["Modern CSS can express layouts that once needed a framework and a pile of media queries. Learning the cascade properly pays for itself within a week.",
    ["Use logical properties for spacing", "Let grid and flexbox do the arithmetic", "Keep specificity low and flat"],
    ["css", ".cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));\n  gap: 1.5rem;\n}"],
    [["MDN CSS reference", "https://developer.mozilla.org/en-US/docs/Web/CSS"]]],
  design: ["Good design systems are mostly about naming. When everyone calls the same thing by the same name, decisions get made once instead of in every pull request.",
    ["Define tokens before components", "Document the why, not just the what", "Review designs with real content, not lorem ipsum"],
    ["css", ":root {\n  --space-1: 4px;\n  --space-2: 8px;\n  --colour-accent: #5cb85c;\n}"],
    [["Design Tokens Community Group", "https://www.w3.org/community/design-tokens/"]]],
  accessibility: ["Accessibility is a quality attribute like performance: cheap to build in, expensive to bolt on. Most of it is using the right element in the first place.",
    ["Every interactive element must be reachable by keyboard", "Visible focus styles are not optional", "Text needs a contrast ratio of at least 4.5:1"],
    ["html", "<button type=\"button\" aria-label=\"Close dialog\">\n  <svg aria-hidden=\"true\" focusable=\"false\"><use href=\"#icon-close\"/></svg>\n</button>"],
    [["WCAG 2.2 quick reference", "https://www.w3.org/WAI/WCAG22/quickref/"]]],
  testing: ["A test suite is only useful if people trust it. One flaky test teaches the whole team to ignore red builds, and then the suite stops protecting anyone.",
    ["Test behaviour, not implementation details", "Make every test independent of the others", "Delete tests that never fail and never help"],
    ["js", "test(\"adds a todo\", async () => {\n  render(<App />);\n  await user.type(screen.getByRole(\"textbox\"), \"Buy milk{enter}\");\n  expect(screen.getByText(\"Buy milk\")).toBeVisible();\n});"],
    [["Testing Library guiding principles", "https://testing-library.com/docs/guiding-principles"]]],
  databases: ["The database is usually the part of the system that outlives every rewrite. It deserves more care than the code that talks to it.",
    ["Add indexes for the queries you actually run", "Keep transactions short", "Write migrations that can run twice"],
    ["sql", "SELECT author_id,\n       count(*) AS articles,\n       rank() OVER (ORDER BY count(*) DESC) AS position\nFROM articles\nGROUP BY author_id;"],
    [["PostgreSQL documentation", "https://www.postgresql.org/docs/current/"]]],
  devops: ["Operations work is mostly about making the boring path the easy path. If deploying is scary, people deploy less, and every deploy gets scarier.",
    ["Automate the steps you do more than twice", "Make rollbacks as easy as deploys", "Alert on symptoms users feel, not on every metric"],
    ["yaml", "livenessProbe:\n  httpGet:\n    path: /healthz\n    port: 8080\n  periodSeconds: 10"],
    [["Google SRE book", "https://sre.google/sre-book/table-of-contents/"]]],
  rust: ["Rust front-loads the hard conversations. The compiler argues with you on day one so that production does not argue with you on day ninety.",
    ["Let the borrow checker guide your design", "Use Result for anything that can fail", "Reach for clippy early and often"],
    ["rust", "fn parse_port(s: &str) -> Result<u16, std::num::ParseIntError> {\n    let port: u16 = s.trim().parse()?;\n    Ok(port)\n}"],
    [["The Rust Programming Language", "https://doc.rust-lang.org/book/"]]],
  career: ["Careers are built in small, repeated moments: a clear message, a helpful review, a problem written down so others do not have to rediscover it.",
    ["Write down what you did and why it mattered", "Ask for feedback before you need it", "Make the people around you better"],
    ["markdown", "## This week\n- Shipped the new onboarding flow\n- Paired with Sam on the flaky checkout test\n- Wrote up the cache incident"],
    [["The Manager's Path", "https://www.oreilly.com/library/view/the-managers-path/9781491973882/"]]],
  productivity: ["Productivity is less about doing more and more about wasting less. The best tool is the one you stop noticing because it never gets in the way.",
    ["Batch your interruptions", "Automate the setup you repeat", "Protect at least one long block of focus a day"],
    ["sh", "alias gs='git status -sb'\nalias gl='git log --oneline --graph -20'\nalias serve='python3 -m http.server 8000'"],
    [["Getting Things Done, summarised", "https://en.wikipedia.org/wiki/Getting_Things_Done"]]],
  security: ["Anything a user types will eventually be shown to another user. Treat it as text, always: escape it when rendering, and never hand it to innerHTML or an HTML-rendering markdown setting without sanitising.",
    ["Render user content as text, not markup", "Sanitise markdown output before inserting it", "Never build URLs or attributes by string concatenation"],
    ["js", "// Safe: the browser treats this as text\nel.textContent = comment.body;\n\n// Unsafe: this runs whatever the user wrote\nel.innerHTML = comment.body;"],
    [["OWASP XSS Prevention Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html"]]],
};
const HEADINGS = ["Why it matters", "The short version", "What I do now", "Getting started", "The core idea"];
const CLOSERS = ["That's it. Questions and disagreements welcome in the comments.",
  "If you try this, I would love to hear how it goes.",
  "None of this is new, but it is easy to forget.",
  "Start small, keep what works, drop the rest.",
  "Thanks for reading!"];

function articleBody(r, [, title, description, tags]) {
  const [main, second] = [TOPIC[tags[0]], TOPIC[tags[1] ?? tags[0]]];
  const out = [];
  out.push(`${description} This post is a collection of notes on **${title.replace(/[<>]/g, "")}**, written so I stop explaining it from memory.`);
  out.push(`## ${pick(r, HEADINGS)}`);
  out.push(main[0]);
  out.push(main[1].map((x) => `- ${x}`).join("\n"));
  out.push(`## An example`);
  out.push(`Here is the smallest version that shows the idea:`);
  out.push("```" + main[2][0] + "\n" + main[2][1] + "\n```");
  if (second !== main) {
    out.push(`## Where *${tags[1]}* comes in`);
    out.push(second[0]);
    out.push(second[1].map((x, i) => `${i + 1}. ${x}`).join("\n"));
  }
  out.push(`## Further reading`);
  out.push([...main[3], ...(second !== main ? second[3] : [])].map(([t, u]) => `- [${t}](${u})`).join("\n"));
  out.push(`> ${pick(r, CLOSERS)}`);
  return out.join("\n\n");
}
// The security article demonstrates the problem with live examples in its body.
const XSS_BODY = [
  "User content is text. When it is rendered as markup, a comment like the one below becomes a program:",
  "<script>alert('xss')</script>",
  "<img src=x onerror=\"alert('img onerror')\">",
  "<svg onload=\"alert('svg onload')\"></svg>",
  "[a link that should not run](javascript:alert('link'))",
  "If any of these produced a dialog, the page rendering this article is unsafe. They should appear as plain text, or not at all.",
  "## What to do",
  "- Render user content as text, not markup\n- Sanitise markdown output before inserting it into the page\n- Never build URLs or attributes by string concatenation",
  "```js\n// Safe\nel.textContent = comment.body;\n// Unsafe\nel.innerHTML = comment.body;\n```",
  "See the [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).",
].join("\n\n");

const REMARKS = [
  "Great write-up, thanks for sharing!",
  "This finally made it click for me.",
  "I disagree with the second point, but the rest is spot on.",
  "Bookmarked. The example alone is worth it.",
  "We tried this at work last quarter and it saved us a lot of pain.",
  "Could you expand on the trade-offs in a follow-up post?",
  "Clear and practical. More of this please.",
  "I'd add one thing: write it down before you forget why you did it.",
  "The further reading links are gold.",
  "Sharing this with my team tomorrow.",
  "Nice. Have you measured the difference in practice?",
  "This is the explanation I wish I had five years ago.",
  "Small typo in the code sample, but the idea is solid.",
  "Love the **no-nonsense** tone.",
  "Interesting take. I've always done the opposite and it worked fine, but I see your point.",
  "Thanks! Exactly what I needed for a review this week.",
  "The list in the middle should be printed and pinned to every monitor.",
  "How does this hold up in a large codebase?",
  "Short, useful, done. Perfect.",
  "Following for more posts like this.",
];
const XSS_REMARKS = [
  "Testing the comment box: <script>alert(\"comment\")</script> (this should show as plain text).",
  "<img src=x onerror=\"alert('comment img')\"> if you can read this tag, escaping works.",
];

// ── the seed ─────────────────────────────────────────────────────────────────
// Built once; every start and every reset copies it.
const SEED = (() => {
  const users = PEOPLE.map(([username, email, password, bio, colour], i) => ({
    id: i + 1, username, email, password: hashPassword(password, `${i + 1}:${email}`), bio,
    image: colour ? avatarUrl(username) : null,
  }));
  const byName = new Map(users.map((u) => [u.username, u]));

  // dates: articles spread over the last ~180 days, in a shuffled order of authors
  const r = rngFor("articles");
  const order = sample(r, POSTS.map((_, i) => i), POSTS.length);
  const articles = [];
  const span = 180 * DAY;
  order.forEach((p, k) => {
    const post = POSTS[p];
    const created = sec(NOW - span + Math.floor(((k + 0.2 + r() * 0.6) / POSTS.length) * (span - 6 * HOUR)));
    const rb = rngFor(`body:${p}`);
    const edited = rb() < 0.25 ? sec(Math.min(created + int(rb, 1, 72) * HOUR + int(rb, 0, 59) * MIN, NOW - HOUR)) : created;
    articles.push({
      id: k + 1, slug: null, title: post[1], description: post[2],
      body: post[0] === "johndoe" && post[1].startsWith("Escaping") ? XSS_BODY : articleBody(rb, post),
      tagList: post[3].slice(), createdAt: created, updatedAt: Math.max(created, edited),
      authorId: byName.get(post[0]).id,
    });
  });
  const taken = new Set();
  for (const a of articles) { a.slug = uniqueSlug(a.title, taken); taken.add(a.slug); }

  // follows
  const follows = [];
  const fixed = { jake: ["johndoe", "mira_chen", "leo_park", "sofia_r"], johndoe: ["jake", "priya_n"], nadia_k: ["jake", "devon", "eli_w"] };
  for (const u of users) {
    const rf = rngFor(`follows:${u.username}`);
    const want = fixed[u.username] ?? sample(rf, users.filter((x) => x.id !== u.id).map((x) => x.username), int(rf, 1, 4));
    for (const name of want) follows.push([u.id, byName.get(name).id]);
  }

  // favorites: skewed counts, never by the author
  const favorites = [];
  for (const a of articles) {
    const rf = rngFor(`favorites:${a.id}`);
    const n = Math.floor(Math.pow(rf(), 1.6) * 10);
    for (const u of sample(rf, users.filter((x) => x.id !== a.authorId), n)) favorites.push([a.id, u.id]);
  }
  for (const [name, title] of [["jake", "Indexing Strategies for Postgres Beginners"], ["jake", "Container Queries Are Finally Here"],
    ["jake", "Flaky Tests Are Bugs"], ["jake", "TypeScript Generics in Practice"]]) {
    const a = articles.find((x) => x.title === title), u = byName.get(name);
    if (!favorites.some(([ai, ui]) => ai === a.id && ui === u.id)) favorites.push([a.id, u.id]);
  }

  // comments: most articles have a few, oldest first by id
  const raw = [];
  for (const a of articles) {
    const rc = rngFor(`comments:${a.id}`);
    const xss = a.body === XSS_BODY;
    const n = xss ? 4 : rc() < 0.72 ? int(rc, 1, 5) : 0;
    const people = users.filter((x) => x.id !== a.authorId);
    const remarks = sample(rc, REMARKS, n);
    for (let i = 0; i < n; i++) {
      const at = sec(a.createdAt + Math.floor(rc() * Math.max(HOUR, (NOW - HOUR - a.createdAt))));
      const body = xss && i < XSS_REMARKS.length ? XSS_REMARKS[i] : remarks[i];
      raw.push({ articleId: a.id, authorId: (i === n - 1 && rc() < 0.3 ? a.authorId : pick(rc, people).id), body, createdAt: at });
    }
  }
  raw.sort((x, y) => x.createdAt - y.createdAt || x.articleId - y.articleId);
  const comments = raw.map((c, i) => ({ id: i + 1, ...c, updatedAt: c.createdAt }));
  return { users, articles, follows, favorites, comments };
})();

// ── the store ────────────────────────────────────────────────────────────────
let USERS, ARTICLES, COMMENTS, FOLLOWS, FAVS, seq;
function load() {
  const s = structuredClone(SEED);
  USERS = new Map(s.users.map((u) => [u.id, u]));
  ARTICLES = s.articles;
  COMMENTS = s.comments;
  FOLLOWS = new Map(); // follower id → Set of followee ids
  for (const [a, b] of s.follows) { if (!FOLLOWS.has(a)) FOLLOWS.set(a, new Set()); FOLLOWS.get(a).add(b); }
  FAVS = new Map();    // article id → Set of user ids
  for (const [a, u] of s.favorites) { if (!FAVS.has(a)) FAVS.set(a, new Set()); FAVS.get(a).add(u); }
  seq = { user: s.users.length, article: s.articles.length, comment: s.comments.length };
}
load();

const userByName = (name) => { for (const u of USERS.values()) if (u.username === name) return u; return null; };
const userByEmail = (email) => { const e = email.toLowerCase(); for (const u of USERS.values()) if (u.email.toLowerCase() === e) return u; return null; };
const articleBySlug = (slug) => ARTICLES.find((a) => a.slug === slug) ?? null;
const isFollowing = (viewer, target) => !!viewer && !!FOLLOWS.get(viewer.id)?.has(target.id);

function uniqueSlug(title, taken) {
  const base = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/<[^>]*>/g, " ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "article";
  let slug = base, n = 1;
  while (taken.has(slug)) slug = `${base}-${++n}`;
  return slug;
}

// ── shapes ───────────────────────────────────────────────────────────────────
const profileOf = (u, viewer) => ({ username: u.username, bio: u.bio, image: u.image, following: isFollowing(viewer, u) });
const userOut = (u, token) => ({ user: { email: u.email, token, username: u.username, bio: u.bio, image: u.image } });
function articleOut(a, viewer, withBody = true) {
  const favs = FAVS.get(a.id);
  const out = { slug: a.slug, title: a.title, description: a.description };
  if (withBody) out.body = a.body;
  out.tagList = a.tagList.slice();
  out.createdAt = iso(a.createdAt);
  out.updatedAt = iso(a.updatedAt);
  out.favorited = !!viewer && !!favs?.has(viewer.id);
  out.favoritesCount = favs ? favs.size : 0;
  out.author = profileOf(USERS.get(a.authorId), viewer);
  return out;
}
const commentOut = (c, viewer) => ({ id: c.id, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt), body: c.body, author: profileOf(USERS.get(c.authorId), viewer) });
const newestFirst = (x, y) => y.createdAt - x.createdAt || y.id - x.id;
function tagsInUse() {
  const count = new Map();
  for (const a of ARTICLES) for (const t of a.tagList) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(([t]) => t);
}

// ── plumbing ─────────────────────────────────────────────────────────────────
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-requested-with",
  "access-control-max-age": "86400",
};
const send = (res, code, body) => {
  if (body === undefined) { res.writeHead(code, CORS); return res.end(); }
  res.writeHead(code, { ...CORS, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const errors = (res, code, field, message) => send(res, code, { errors: { [field]: [message] } });
const fail = (res, code, errs) => send(res, code, { errors: errs });
const BAD_JSON = Symbol("bad json"), TOO_BIG = Symbol("too big");
const readBody = (req) => new Promise((resolve) => {
  let b = "", size = 0, over = false;
  req.on("data", (c) => { size += c.length; if (size > 2 * 1024 * 1024) over = true; else b += c; });
  req.on("end", () => {
    if (over) return resolve(TOO_BIG);
    try { resolve(b.trim() ? JSON.parse(b) : {}); } catch { resolve(BAD_JSON); }
  });
});
// The wrapped object of a request body ({ "user": {...} } → {...}), or null after answering.
async function wrapped(req, res, key) {
  const b = await readBody(req);
  if (b === TOO_BIG) { errors(res, 413, "request", "is too large"); return null; }
  if (b === BAD_JSON) { errors(res, 422, "request", "is not valid JSON"); return null; }
  const inner = b && typeof b === "object" && !Array.isArray(b) ? b[key] : undefined;
  if (inner === undefined || inner === null) return {};
  if (typeof inner !== "object" || Array.isArray(inner)) { errors(res, 422, key, "is invalid"); return null; }
  return inner;
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const add = (errs, field, message) => { (errs[field] ??= []).push(message); };

// Authentication: { user } when a valid token is given, { user: null } when none,
// or null after answering 401 for a bad one.
function auth(req, res, required) {
  const h = req.headers.authorization;
  if (!h || !h.trim()) {
    if (required) { errors(res, 401, "token", "is missing"); return null; }
    return { user: null };
  }
  const m = h.trim().match(/^(?:Token|Bearer)\s+(\S+)$/i);
  const payload = m ? verifyToken(m[1]) : null;
  const user = payload ? USERS.get(payload.id) : null;
  if (!user) { errors(res, 401, "token", "is invalid"); return null; }
  return { user };
}
function paging(res, url) {
  const out = { limit: 20, offset: 0 };
  for (const k of ["limit", "offset"]) {
    const v = url.searchParams.get(k);
    if (v === null || v === "") continue;
    if (!/^\d+$/.test(v) || (k === "limit" && Number(v) < 1)) { errors(res, 422, k, "is invalid"); return null; }
    out[k] = Number(v);
  }
  return out;
}

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, pattern, fn });

// ── users and authentication ─────────────────────────────────────────────────
function checkPasswordRule(errs, password) {
  if (blank(password)) add(errs, "password", "can't be blank");
  else if (typeof password !== "string") add(errs, "password", "is invalid");
  else if (password.length < 8) add(errs, "password", "is too short (minimum is 8 characters)");
  else if (password.length > 256) add(errs, "password", "is too long (maximum is 256 characters)");
}
function checkUsername(errs, username) {
  if (blank(username)) add(errs, "username", "can't be blank");
  else if (typeof username !== "string" || /[\s/?#%]/.test(username)) add(errs, "username", "is invalid");
  else if (username.length > 40) add(errs, "username", "is too long (maximum is 40 characters)");
}
function checkEmail(errs, email) {
  if (blank(email)) add(errs, "email", "can't be blank");
  else if (typeof email !== "string" || !EMAIL.test(email.trim())) add(errs, "email", "is invalid");
}
const optionalText = (errs, field, v) => {
  if (v === null || v === "") return null;
  if (typeof v !== "string") { add(errs, field, "is invalid"); return null; }
  return v;
};

route("POST", /^\/api\/users$/, async (req, res) => {
  const u = await wrapped(req, res, "user"); if (!u) return;
  const errs = {};
  checkUsername(errs, u.username);
  checkEmail(errs, u.email);
  checkPasswordRule(errs, u.password);
  if (Object.keys(errs).length) return fail(res, 422, errs);
  const username = u.username.trim(), email = u.email.trim();
  const taken = {};
  if ([...USERS.values()].some((x) => x.username.toLowerCase() === username.toLowerCase())) add(taken, "username", "has already been taken");
  if (userByEmail(email)) add(taken, "email", "has already been taken");
  if (Object.keys(taken).length) return fail(res, 409, taken);
  const id = ++seq.user;
  const user = { id, username, email, password: hashPassword(u.password, `${id}:${email}:${clock()}`), bio: null, image: null };
  USERS.set(id, user);
  send(res, 201, userOut(user, signToken(user)));
});

route("POST", /^\/api\/users\/login$/, async (req, res) => {
  const u = await wrapped(req, res, "user"); if (!u) return;
  const errs = {};
  checkEmail(errs, u.email);
  if (blank(u.password)) add(errs, "password", "can't be blank");
  else if (typeof u.password !== "string") add(errs, "password", "is invalid");
  if (Object.keys(errs).length) return fail(res, 422, errs);
  const user = userByEmail(u.email.trim());
  if (!user || !checkPassword(u.password, user.password)) return errors(res, 401, "credentials", "invalid");
  send(res, 200, userOut(user, signToken(user)));
});

route("GET", /^\/api\/user$/, (req, res) => {
  const a = auth(req, res, true); if (!a) return;
  send(res, 200, userOut(a.user, signToken(a.user)));
});

route("PUT", /^\/api\/user$/, async (req, res) => {
  const a = auth(req, res, true); if (!a) return;
  const u = await wrapped(req, res, "user"); if (!u) return;
  const errs = {}, next = {};
  if (has(u, "username")) { checkUsername(errs, u.username); if (!errs.username) next.username = u.username.trim(); }
  if (has(u, "email")) { checkEmail(errs, u.email); if (!errs.email) next.email = u.email.trim(); }
  if (has(u, "password")) checkPasswordRule(errs, u.password);
  if (has(u, "bio")) next.bio = optionalText(errs, "bio", u.bio);
  if (has(u, "image")) next.image = optionalText(errs, "image", u.image);
  if (next.username && [...USERS.values()].some((x) => x.id !== a.user.id && x.username.toLowerCase() === next.username.toLowerCase()))
    add(errs, "username", "has already been taken");
  if (next.email) { const o = userByEmail(next.email); if (o && o.id !== a.user.id) add(errs, "email", "has already been taken"); }
  if (Object.keys(errs).length) return fail(res, 422, errs);
  Object.assign(a.user, next);
  if (has(u, "password")) a.user.password = hashPassword(u.password, `${a.user.id}:${a.user.email}:${clock()}`);
  send(res, 200, userOut(a.user, signToken(a.user)));
});

// ── profiles ─────────────────────────────────────────────────────────────────
route("GET", /^\/api\/profiles\/([^/]+)$/, (req, res, url, m) => {
  const a = auth(req, res, false); if (!a) return;
  const target = userByName(m[1]);
  if (!target) return errors(res, 404, "profile", "not found");
  send(res, 200, { profile: profileOf(target, a.user) });
});
function follow(on) {
  return (req, res, url, m) => {
    const a = auth(req, res, true); if (!a) return;
    const target = userByName(m[1]);
    if (!target) return errors(res, 404, "profile", "not found");
    if (on) {
      if (target.id === a.user.id) return errors(res, 422, "profile", "can't follow yourself");
      if (!FOLLOWS.has(a.user.id)) FOLLOWS.set(a.user.id, new Set());
      FOLLOWS.get(a.user.id).add(target.id);
    } else FOLLOWS.get(a.user.id)?.delete(target.id);
    send(res, 200, { profile: profileOf(target, a.user) });
  };
}
route("POST", /^\/api\/profiles\/([^/]+)\/follow$/, follow(true));
route("DELETE", /^\/api\/profiles\/([^/]+)\/follow$/, follow(false));

// ── articles ─────────────────────────────────────────────────────────────────
function list(res, viewer, rows, page) {
  rows.sort(newestFirst);
  send(res, 200, { articles: rows.slice(page.offset, page.offset + page.limit).map((x) => articleOut(x, viewer, false)), articlesCount: rows.length });
}
route("GET", /^\/api\/articles$/, (req, res, url) => {
  const a = auth(req, res, false); if (!a) return;
  const page = paging(res, url); if (!page) return;
  const tag = url.searchParams.get("tag"), author = url.searchParams.get("author"), favorited = url.searchParams.get("favorited");
  let rows = ARTICLES;
  if (tag) rows = rows.filter((x) => x.tagList.includes(tag));
  if (author) { const u = userByName(author); rows = u ? rows.filter((x) => x.authorId === u.id) : []; }
  if (favorited) { const u = userByName(favorited); rows = u ? rows.filter((x) => FAVS.get(x.id)?.has(u.id)) : []; }
  list(res, a.user, rows.slice(), page);
});
route("GET", /^\/api\/articles\/feed$/, (req, res, url) => {
  const a = auth(req, res, true); if (!a) return;
  const page = paging(res, url); if (!page) return;
  const followed = FOLLOWS.get(a.user.id) ?? new Set();
  list(res, a.user, ARTICLES.filter((x) => followed.has(x.authorId)), page);
});
route("GET", /^\/api\/articles\/([^/]+)$/, (req, res, url, m) => {
  const a = auth(req, res, false); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  send(res, 200, { article: articleOut(art, a.user) });
});

function readTags(errs, v) {
  if (!Array.isArray(v) || v.some((t) => typeof t !== "string")) { add(errs, "tagList", "is invalid"); return []; }
  const out = [];
  for (const t of v.map((x) => x.trim()).filter(Boolean)) if (!out.includes(t)) out.push(t);
  return out;
}
function readText(errs, field, v) {
  if (blank(v)) { add(errs, field, "can't be blank"); return null; }
  if (typeof v !== "string") { add(errs, field, "is invalid"); return null; }
  return v;
}
route("POST", /^\/api\/articles$/, async (req, res) => {
  const a = auth(req, res, true); if (!a) return;
  const b = await wrapped(req, res, "article"); if (!b) return;
  const errs = {};
  const title = readText(errs, "title", b.title), description = readText(errs, "description", b.description), body = readText(errs, "body", b.body);
  const tagList = has(b, "tagList") ? readTags(errs, b.tagList) : [];
  if (Object.keys(errs).length) return fail(res, 422, errs);
  const now = clock();
  const art = { id: ++seq.article, slug: uniqueSlug(title.trim(), new Set(ARTICLES.map((x) => x.slug))),
    title: title.trim(), description, body, tagList, createdAt: now, updatedAt: now, authorId: a.user.id };
  ARTICLES.push(art);
  send(res, 201, { article: articleOut(art, a.user) });
});
route("PUT", /^\/api\/articles\/([^/]+)$/, async (req, res, url, m) => {
  const a = auth(req, res, true); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  if (art.authorId !== a.user.id) return errors(res, 403, "article", "forbidden");
  const b = await wrapped(req, res, "article"); if (!b) return;
  const errs = {}, next = {};
  for (const k of ["title", "description", "body"]) if (has(b, k)) next[k] = readText(errs, k, b[k]);
  if (has(b, "tagList")) next.tagList = readTags(errs, b.tagList);
  if (Object.keys(errs).length) return fail(res, 422, errs);
  if (next.title !== undefined) {
    next.title = next.title.trim();
    if (next.title !== art.title) next.slug = uniqueSlug(next.title, new Set(ARTICLES.filter((x) => x !== art).map((x) => x.slug)));
  }
  Object.assign(art, next, { updatedAt: clock() });
  send(res, 200, { article: articleOut(art, a.user) });
});
route("DELETE", /^\/api\/articles\/([^/]+)$/, (req, res, url, m) => {
  const a = auth(req, res, true); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  if (art.authorId !== a.user.id) return errors(res, 403, "article", "forbidden");
  ARTICLES.splice(ARTICLES.indexOf(art), 1);
  COMMENTS = COMMENTS.filter((c) => c.articleId !== art.id);
  FAVS.delete(art.id);
  send(res, 204);
});

// ── favorites ────────────────────────────────────────────────────────────────
function favorite(on) {
  return (req, res, url, m) => {
    const a = auth(req, res, true); if (!a) return;
    const art = articleBySlug(m[1]);
    if (!art) return errors(res, 404, "article", "not found");
    if (on) { if (!FAVS.has(art.id)) FAVS.set(art.id, new Set()); FAVS.get(art.id).add(a.user.id); }
    else FAVS.get(art.id)?.delete(a.user.id);
    send(res, 200, { article: articleOut(art, a.user) });
  };
}
route("POST", /^\/api\/articles\/([^/]+)\/favorite$/, favorite(true));
route("DELETE", /^\/api\/articles\/([^/]+)\/favorite$/, favorite(false));

// ── comments ─────────────────────────────────────────────────────────────────
route("GET", /^\/api\/articles\/([^/]+)\/comments$/, (req, res, url, m) => {
  const a = auth(req, res, false); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  const rows = COMMENTS.filter((c) => c.articleId === art.id).sort(newestFirst);
  send(res, 200, { comments: rows.map((c) => commentOut(c, a.user)) });
});
route("POST", /^\/api\/articles\/([^/]+)\/comments$/, async (req, res, url, m) => {
  const a = auth(req, res, true); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  const b = await wrapped(req, res, "comment"); if (!b) return;
  const errs = {};
  const body = readText(errs, "body", b.body);
  if (Object.keys(errs).length) return fail(res, 422, errs);
  const now = clock();
  const c = { id: ++seq.comment, articleId: art.id, authorId: a.user.id, body, createdAt: now, updatedAt: now };
  COMMENTS.push(c);
  send(res, 201, { comment: commentOut(c, a.user) });
});
route("DELETE", /^\/api\/articles\/([^/]+)\/comments\/([^/]+)$/, (req, res, url, m) => {
  const a = auth(req, res, true); if (!a) return;
  const art = articleBySlug(m[1]);
  if (!art) return errors(res, 404, "article", "not found");
  const c = /^\d+$/.test(m[2]) ? COMMENTS.find((x) => x.id === Number(m[2]) && x.articleId === art.id) : null;
  if (!c) return errors(res, 404, "comment", "not found");
  if (c.authorId !== a.user.id) return errors(res, 403, "comment", "forbidden");
  COMMENTS.splice(COMMENTS.indexOf(c), 1);
  send(res, 204);
});

// ── tags ─────────────────────────────────────────────────────────────────────
route("GET", /^\/api\/tags$/, (req, res) => send(res, 200, { tags: tagsInUse() }));

// ── avatars for the seeded people ────────────────────────────────────────────
route("GET", /^\/images\/avatars\/([^/]+)\.svg$/, (req, res, url, m) => {
  if (!AVATAR_COLOUR.has(m[1])) return errors(res, 404, "image", "not found");
  res.writeHead(200, { ...CORS, "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
  res.end(avatarSvg(m[1]));
});

// ── state hooks (only with --test-hooks) ─────────────────────────────────────
if (TEST_HOOKS) {
  route("POST", /^\/__test\/reset$/, (req, res) => { load(); send(res, 200, { reset: true }); });
  route("GET", /^\/__test\/state$/, (req, res) => {
    const name = (id) => USERS.get(id)?.username ?? null;
    const slug = (id) => ARTICLES.find((x) => x.id === id)?.slug ?? null;
    send(res, 200, {
      now: iso(NOW),
      users: [...USERS.values()].map(({ password, ...u }) => u),
      articles: ARTICLES.slice().sort(newestFirst).map((x) => ({ id: x.id, slug: x.slug, title: x.title, description: x.description,
        body: x.body, tagList: x.tagList, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt), authorId: x.authorId,
        author: name(x.authorId), favoritesCount: FAVS.get(x.id)?.size ?? 0 })),
      comments: COMMENTS.slice().sort((x, y) => x.id - y.id).map((c) => ({ id: c.id, articleId: c.articleId, article: slug(c.articleId),
        authorId: c.authorId, author: name(c.authorId), body: c.body, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) })),
      follows: [...FOLLOWS].flatMap(([f, set]) => [...set].map((t) => ({ follower: name(f), following: name(t), followerId: f, followingId: t }))),
      favorites: [...FAVS].flatMap(([aid, set]) => [...set].map((u) => ({ article: slug(aid), user: name(u), articleId: aid, userId: u }))),
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, ORIGIN);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  let pathMatched = false;
  for (const r of routes) {
    const m = p.match(r.pattern);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    let args;
    try { args = m.map((x, i) => (i ? decodeURIComponent(x) : x)); } catch { return errors(res, 404, "resource", "not found"); }
    try { return await r.fn(req, res, url, args); } catch (e) {
      console.error(e);
      return errors(res, 500, "server", String(e?.message ?? e));
    }
  }
  if (pathMatched) return errors(res, 405, "method", `${req.method} is not allowed on ${p}`);
  errors(res, 404, "resource", "not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`conduit api — ${ORIGIN}/api`);
  console.log(`${USERS.size} users · ${ARTICLES.length} articles · ${COMMENTS.length} comments · ${tagsInUse().length} tags · now ${iso(NOW)}${TEST_HOOKS ? " · test hooks on" : ""}`);
});
