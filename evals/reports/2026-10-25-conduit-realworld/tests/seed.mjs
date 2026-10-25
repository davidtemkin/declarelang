// Seeds a RealWorld backend through its public API, the way a client would:
//   node seed.mjs [http://localhost:3000/api]
// Everyone's password is "password123"; sign in as demo@conduit.dev to see a populated feed.

const API = process.argv[2] ?? "http://localhost:3000/api";

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Token " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json;
}

const people = [
  { username: "demo", email: "demo@conduit.dev", bio: "Kicking the tires on Conduit." },
  { username: "ada", email: "ada@conduit.dev", bio: "Writes about engines, analytical and otherwise." },
  { username: "grace", email: "grace@conduit.dev", bio: "Compilers, Navy stories, and the occasional nanosecond." },
  { username: "linus", email: "linus@conduit.dev", bio: "Kernel hacker. Strong opinions, weakly held." },
  { username: "margaret", email: "margaret@conduit.dev", bio: "Software engineering before it had a name." },
];

const articles = [
  ["ada", "Notes on the Analytical Engine", "What a machine can and cannot originate", ["history", "computing"],
   "The engine *weaves algebraic patterns* just as the Jacquard loom weaves flowers and leaves.\n\n## What it can do\n\nIt can do whatever we **know how to order it** to perform.\n\n## What it cannot\n\n- originate anything\n- anticipate analytical relations\n\nThat second point is worth sitting with."],
  ["grace", "A nanosecond is 11.8 inches", "Why I hand out pieces of wire", ["history", "performance"],
   "When admirals asked why satellite messages took so long, I handed them a **foot of wire**.\n\n> That's how far light travels in a nanosecond.\n\nLatency is physical. Every abstraction sits on top of distance."],
  ["grace", "It's easier to ask forgiveness", "On shipping without a permission slip", ["culture"],
   "Most organizations have more rules than reasons.\n\n1. Do the useful thing.\n2. Explain it afterwards.\n3. Make the explanation good.\n\nThe third step is the one people skip."],
  ["linus", "Talk is cheap. Show me the code.", "Patches over proposals", ["culture", "opensource"],
   "Design documents are fine. *Running code* is better.\n\n```\ngit format-patch -1\n```\n\nSend that, and the conversation gets a lot more concrete."],
  ["linus", "Good taste in code", "Removing the special case", ["programming", "c"],
   "The classic example is deleting from a linked list.\n\nThe beginner version special-cases the head. The tasteful version uses a pointer to a pointer, and the special case **disappears**.\n\nGood taste is mostly about making edge cases go away."],
  ["margaret", "Software engineering, a name", "How a discipline got its title", ["history", "engineering"],
   "We started calling it *software engineering* so it would get the same respect as the other kinds.\n\nOn Apollo, the software had to be right the first time. There was no second launch to patch it."],
  ["margaret", "Priority displays and the 1202 alarm", "Designing for overload", ["engineering", "reliability"],
   "During the landing the computer was asked to do too much.\n\nBecause the scheduler **dropped low-priority work** instead of falling over, the landing continued.\n\nDesign for the day the inputs are wrong."],
  ["ada", "Poetical science", "Imagination as a working tool", ["computing", "culture"],
   "Imagination is the *discovering faculty*.\n\nScience without it is bookkeeping; imagination without science is daydreaming. Together they build engines."],
  ["demo", "Hello, Conduit", "My first post here", ["meta"],
   "Testing the editor.\n\n- **Bold** works\n- *Italic* works\n- `code` works\n\nOn to the next one."],
  ["linus", "Version control is about people", "Why git looks the way it does", ["opensource", "programming"],
   "Distributed version control is a **trust network** that happens to store files.\n\nEvery clone is a full repository, so nobody has to ask permission to experiment."],
  ["grace", "The first actual bug", "Logbook, September 9th", ["history"],
   "Relay #70, Panel F. *First actual case of bug being found.*\n\nWe taped it into the logbook. It's still there."],
  ["margaret", "Testing what can't be tested", "Simulation as a habit", ["engineering", "testing"],
   "You can't fly to the Moon to run your test suite.\n\nSo you build the best simulator you can, and you **trust it exactly as far as you've checked it**."],
];

const tokens = {};
for (const p of people) {
  let r;
  try { r = await call("POST", "/users", { user: { ...p, password: "password123" } }); }
  catch { r = await call("POST", "/users/login", { user: { email: p.email, password: "password123" } }); }
  tokens[p.username] = r.user.token;
  await call("PUT", "/user", { user: { bio: p.bio } }, r.user.token);
}

const slugs = [];
for (const [who, title, description, tagList, body] of articles) {
  const r = await call("POST", "/articles", { article: { title, description, body, tagList } }, tokens[who]);
  slugs.push([who, r.article.slug]);
}

const comments = [
  ["grace", 0, "Still the clearest statement of what software is."],
  ["linus", 0, "Reading this in 2026 and it holds up."],
  ["ada", 1, "A wonderful demonstration. May I borrow a wire?"],
  ["demo", 4, "The pointer-to-pointer trick finally clicked for me."],
  ["margaret", 4, "Edge cases are where the bodies are buried."],
  ["grace", 6, "Graceful degradation, literally."],
  ["ada", 8, "Welcome!"],
];
for (const [who, i, body] of comments)
  await call("POST", `/articles/${slugs[i][1]}/comments`, { comment: { body } }, tokens[who]);

for (const [who, i] of [["demo", 0], ["demo", 4], ["ada", 1], ["linus", 6], ["margaret", 1], ["grace", 4], ["ada", 4]])
  await call("POST", `/articles/${slugs[i][1]}/favorite`, null, tokens[who]);

for (const [who, whom] of [["demo", "grace"], ["demo", "linus"], ["ada", "grace"]])
  await call("POST", `/profiles/${whom}/follow`, null, tokens[who]);

console.log(`seeded ${people.length} users, ${slugs.length} articles, ${comments.length} comments against ${API}`);
