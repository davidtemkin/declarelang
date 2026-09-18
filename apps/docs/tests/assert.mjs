// The docs app's behavioral contract — the TYPE PAGES, driven for real.
//
//   node tools/verify.mjs apps/docs/docs.declare --assert apps/docs/tests/assert.mjs
//
// The question this proves is the one the pages were built to answer: a reader
// meets `motion: Motion` in a signature, and can get from that name to what the
// vocabulary IS. So it drives the two halves of that path — the location renders
// a page with its tokens on it, and the printed type in a signature is a real
// link that lands there — plus the invariant that keeps the change safe: a type
// with no page is still painted, still tinted, and still not a link.
//
// Indices come from the model rather than being typed in, so a reordered
// attribute list moves the assertions with it instead of breaking them.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const model = JSON.parse(readFileSync(resolve(ROOT, "docs/declare-model.json"), "utf8"));
const attrIndex = (cls, name) =>
  model.tree.find((c) => c.name === cls).attributes.findIndex((a) => a.name === name);

export default async ({ drive, expect }) => {
  // the whole app is one DataSource away; nothing below exists until it lands
  await drive.settleData();
  await expect.attr("app", "mode", "guide");

  // ── a type page is a LOCATION ─────────────────────────────────────────────
  await drive.set("app", "location", "type/Motion");
  await expect.attr("app", "mode", "type");
  await expect.attr("app", "tname", "Motion");

  const page = "app.detail.col.typeCol.0";
  await expect.visible(page);
  await expect.text(`${page}.header.1`, "Motion");         // header: eyebrow, NAME, syntax, prose

  // …and it renders its TOKENS, grouped by family (the first group is the
  // loose one — `linear` belongs to no family; the second is `ease`)
  await expect.visible(`${page}.tokens`);
  const [loose, family] = model.types.pages.Motion.tokenGroups;
  await expect.text(`${page}.tokens.fams.0.row.0.lbl`, loose.tokens[0].name);
  await expect.text(`${page}.tokens.fams.1.row.0.lbl`, family.tokens[0].name);

  // every token on the page, counted off the model — a page that rendered half
  // its vocabulary would pass a single-token check
  const total = model.types.pages.Motion.nTokens;
  const painted = await drive.page.evaluate((p) => {
    let n = 0;
    const walk = (x) => { if (x.kind === "Chip") n++; (x.children ?? []).forEach(walk); };
    walk(window.__declare.inspect(p));
    return n;
  }, `${page}.tokens`);
  expect.equal(painted, total, "token chips on the Motion page");

  // ── a printed type in a SIGNATURE is a link to that page ──────────────────
  await drive.set("app", "location", "reference/Animator");
  await expect.attr("app", "mode", "reference");
  const row = `app.detail.col.refCol.0.attrs.${attrIndex("Animator", "motion") + 1}`;
  await expect.text(`${row}.sig.ty`, ": Motion");
  await expect.attr(`${row}.sig.ty`, "link", "#type/Motion");

  // a type with NO page keeps rendering exactly as it did: painted, tinted, and
  // not a link — never a dead one
  const plain = `app.detail.col.refCol.0.attrs.${attrIndex("Animator", "duration") + 1}`;
  await expect.text(`${plain}.sig.ty`, ": number");
  await expect.attr(`${plain}.sig.ty`, "link", "");

  // and the link NAVIGATES — scrolled to, then clicked like a reader would.
  // The reveal is the host's own smooth scroll, which is real time rather than
  // clock time: wait it out, or the click lands on whatever is at those
  // coordinates before the pane has moved.
  await drive.page.evaluate((p) => window.__declare.find(p).scrollIntoView(), row);
  await drive.wait(600);
  await drive.settleMotion();
  await drive.click(`${row}.sig.ty`);
  await expect.attr("app", "location", "type/Motion");
  await expect.attr("app", "tname", "Motion");
  await expect.visible("app.detail.col.typeCol.0");
};
