// The presentations the service starts with: one rich deck worth opening, and two smaller
// ones so the list has something to show. Only round 1's kinds (rect, ellipse, line,
// text, group). Ids are stable across resets: element ids are e<n> in the order built.

const C = {
  deep: "#0E3B43", sea: "#2F6F8F", surf: "#8CC2C9", foam: "#F6F4EF", sand: "#E9DFC9",
  coral: "#E07A5F", gold: "#D9A441", ink: "#1F2328", muted: "#59636E", white: "#FFFFFF",
};

let n = 0;
const id = () => `e${++n}`;
const text = (x, y, width, height, content, size, o = {}) => ({
  id: id(), kind: "text", x, y, width, height, keepProportions: false,
  text: { content, font: o.font ?? "Helvetica Neue", size, weight: o.weight ?? 400, italic: o.italic ?? false,
    color: o.color ?? C.ink, align: o.align ?? "left" },
});
const rect = (x, y, width, height, fill, o = {}) => ({
  id: id(), kind: "rect", x, y, width, height, fill, stroke: o.stroke ?? null, cornerRadius: o.r ?? 0, keepProportions: o.keep ?? false,
});
const ellipse = (x, y, width, height, fill, o = {}) => ({
  id: id(), kind: "ellipse", x, y, width, height, fill, stroke: o.stroke ?? null, keepProportions: o.keep ?? false,
});
const line = (x1, y1, x2, y2, color, width = 2) => ({ id: id(), kind: "line", x1, y1, x2, y2, stroke: { color, width } });
const group = (...children) => ({ id: id(), kind: "group", children });
const serif = "Georgia";

function fieldNotes() {
  const s = [];
  // 1 — title: night sea, a low sun, three bands of water
  s.push({ background: C.deep, elements: [
    ellipse(860, 120, 300, 300, C.coral, { keep: true }),
    group(
      ellipse(-200, 470, 1000, 260, C.sea),
      ellipse(420, 500, 1100, 280, "#24596F"),
      ellipse(-100, 560, 1500, 300, "#163F4D"),
    ),
    text(110, 170, 760, 200, "Field notes from the coast", 76, { font: serif, color: C.white }),
    text(112, 390, 700, 50, "What three tide-pool sites taught us this summer", 28, { color: C.sand }),
    text(112, 640, 400, 30, "Coastal Survey · November 2026", 18, { color: C.surf }),
  ] });
  // 2 — agenda: four numbered rows
  const rows = ["Where we went", "What we counted", "What surprised us", "What we'd do next"];
  s.push({ background: C.foam, elements: [
    text(110, 90, 600, 80, "Today", 54, { font: serif, color: C.deep }),
    line(110, 190, 1170, 190, C.sand, 2),
    ...rows.map((label, i) => group(
      ellipse(110, 240 + i * 105, 64, 64, i === 2 ? C.coral : C.sea, { keep: true }),
      text(110, 255 + i * 105, 64, 40, String(i + 1), 26, { color: C.white, align: "center", weight: 700 }),
      text(210, 252 + i * 105, 800, 44, label, 32, { color: C.ink }),
    )),
  ] });
  // 3 — one big number
  s.push({ background: C.white, elements: [
    rect(0, 0, 28, 720, C.coral),
    text(120, 150, 1000, 240, "3,412", 220, { font: serif, color: C.deep, weight: 700 }),
    line(126, 420, 520, 420, C.coral, 4),
    text(126, 450, 900, 100, "living things counted across three sites, in twelve low tides", 34, { color: C.muted }),
  ] });
  // 4 — three cards
  const sites = [
    ["North Cove", "Sheltered, warm, crowded. The most anemones, the fewest crabs.", C.sea, "1,402"],
    ["Long Reef", "Exposed at the lowest tides only. Kelp forest at the edge.", C.coral, "1,130"],
    ["Gull Point", "Rocky and wave-washed. Barnacles everywhere, little else.", C.gold, "880"],
  ];
  s.push({ background: C.foam, elements: [
    text(110, 70, 1000, 80, "Three sites", 54, { font: serif, color: C.deep }),
    ...sites.map(([name, body, tint, count], i) => group(
      rect(110 + i * 360, 200, 330, 400, C.white, { r: 18, stroke: { color: C.sand, width: 2 } }),
      rect(110 + i * 360, 200, 330, 14, tint),
      text(140 + i * 360, 250, 270, 50, name, 32, { font: serif, color: C.ink }),
      text(140 + i * 360, 320, 270, 120, body, 22, { color: C.muted }),
      line(140 + i * 360, 480, 440 + i * 360, 480, C.sand, 2),
      text(140 + i * 360, 500, 270, 56, count, 46, { font: serif, color: tint, weight: 700 }),
      text(140 + i * 360, 556, 270, 28, "counted", 18, { color: C.muted }),
    )),
  ] });
  // 5 — a bar chart, by month
  const months = [["Jun", 310], ["Jul", 540], ["Aug", 690], ["Sep", 820], ["Oct", 610], ["Nov", 442]];
  const base = 600, scale = 0.45;
  s.push({ background: C.white, elements: [
    text(110, 70, 900, 70, "Counts rose until September", 46, { font: serif, color: C.deep }),
    text(110, 140, 900, 40, "Living things counted, by month", 22, { color: C.muted }),
    ...months.flatMap(([m, v], i) => {
      const x = 180 + i * 160, h = v * scale;
      return [group(
        rect(x, base - h, 96, h, i === 3 ? C.coral : C.sea, { r: 6 }),
        text(x - 20, base - h - 44, 136, 36, String(v), 24, { align: "center", color: C.ink, weight: 700 }),
        text(x - 20, base + 16, 136, 36, m, 22, { align: "center", color: C.muted }),
      )];
    }),
    line(150, base, 1150, base, C.ink, 2),
  ] });
  // 6 — a process, as circles joined by lines
  const steps = [["Survey", "Walk the transect"], ["Sample", "Count each square"], ["Check", "Two people agree"], ["Share", "Post the tallies"]];
  s.push({ background: C.deep, elements: [
    text(110, 80, 1000, 70, "How a count works", 50, { font: serif, color: C.white }),
    line(230, 360, 1050, 360, C.surf, 3),
    ...steps.map(([title, sub], i) => group(
      ellipse(150 + i * 273, 280, 160, 160, i === 3 ? C.coral : C.white, { keep: true }),
      text(150 + i * 273, 340, 160, 40, String(i + 1), 34, { align: "center", color: i === 3 ? C.white : C.deep, weight: 700 }),
      text(120 + i * 273, 470, 220, 40, title, 30, { align: "center", color: C.white, font: serif }),
      text(120 + i * 273, 520, 220, 60, sub, 20, { align: "center", color: C.surf }),
    )),
  ] });
  // 7 — a quote
  s.push({ background: C.sand, elements: [
    text(110, 40, 200, 220, "“", 260, { font: serif, color: C.coral }),
    text(180, 220, 920, 240, "The pools are never the same twice. That is the whole point of going back.", 48, { font: serif, italic: true, color: C.deep }),
    line(184, 500, 264, 500, C.coral, 4),
    text(184, 520, 800, 40, "Maya Ortiz, volunteer, twelve tides", 24, { color: C.muted }),
  ] });
  // 8 — close
  s.push({ background: C.deep, elements: [
    ellipse(-160, 380, 560, 560, C.sea, { keep: true }),
    ellipse(80, 520, 300, 300, C.coral, { keep: true }),
    text(520, 230, 680, 120, "Next tide: 14 November", 60, { font: serif, color: C.white }),
    text(522, 370, 640, 100, "Meet at the North Cove steps at 6:40am. Boots, gloves, a pencil.", 28, { color: C.sand }),
    rect(522, 510, 300, 64, C.coral, { r: 32 }),
    text(522, 527, 300, 36, "Sign up at the desk", 24, { align: "center", color: C.white, weight: 700 }),
  ] });
  return { title: "Field notes from the coast", slides: s };
}

function studio() {
  const s = [];
  s.push({ background: "#1C1B22", elements: [
    rect(110, 300, 120, 8, C.gold),
    text(110, 330, 1000, 120, "Studio launch plan", 84, { color: C.white, weight: 700 }),
    text(112, 460, 900, 40, "Spring 2027 · draft for the team", 26, { color: "#B9B6C3" }),
  ] });
  const weeks = [["Weeks 1–2", "Space and kit", C.sea], ["Weeks 3–5", "First classes", C.coral], ["Weeks 6–8", "Open studio", C.gold]];
  s.push({ background: C.white, elements: [
    text(110, 80, 1000, 70, "Eight weeks, three stages", 48, { weight: 700 }),
    ...weeks.map(([when, what, tint], i) => group(
      rect(110 + i * 360, 260, 340, 120, tint, { r: 60 }),
      text(140 + i * 360, 290, 280, 30, when, 20, { color: C.white }),
      text(140 + i * 360, 320, 280, 40, what, 30, { color: C.white, weight: 700 }),
    )),
    line(110, 460, 1150, 460, C.sand, 2),
    text(110, 490, 1000, 80, "Each stage ends with a short review before the next one starts.", 26, { color: C.muted }),
  ] });
  s.push({ background: "#F3F1F7", elements: [
    text(110, 80, 600, 70, "Budget", 48, { weight: 700 }),
    group(
      ellipse(760, 160, 400, 400, C.sea, { keep: true }),
      ellipse(860, 260, 200, 200, "#F3F1F7", { keep: true }),
    ),
    text(110, 200, 560, 360, "Rent  £4,800\nKit  £2,350\nTeachers  £3,600\nOpening night  £600", 34, { color: C.ink }),
  ] });
  return { title: "Studio launch plan", slides: s };
}

function readingGroup() {
  const s = [];
  s.push({ background: "#FBF7EE", elements: [
    rect(110, 110, 16, 500, C.coral),
    text(170, 200, 900, 140, "Reading group: The Overstory", 64, { font: serif, color: C.ink }),
    text(172, 400, 800, 40, "Thursdays at 7, the back room", 28, { color: C.muted }),
  ] });
  s.push({ background: "#FBF7EE", elements: [
    text(110, 90, 1000, 70, "This week", 48, { font: serif }),
    text(110, 200, 1000, 300, "Chapters 4 to 6.\nBring one passage you'd argue about.", 36, { color: C.ink }),
  ] });
  return { title: "Reading group", slides: s };
}

/** The decks and slides at boot, in the order the list shows them (most recent first). */
export function seed() {
  n = 0;
  const made = [fieldNotes(), studio(), readingGroup()];
  const decks = [], slides = [];
  let si = 0;
  made.forEach((m, di) => {
    const deck = { id: `d${di + 1}`, title: m.title, slideOrder: [] };
    for (const sl of m.slides) {
      const sid = `s${++si}`;
      deck.slideOrder.push(sid);
      slides.push({ id: sid, deckId: deck.id, background: sl.background, elements: sl.elements });
    }
    decks.push(deck);
  });
  return { decks, slides };
}
