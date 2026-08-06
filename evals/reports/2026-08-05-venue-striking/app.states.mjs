// Named visual states for The Venue — `node tools/verify.mjs my-apps/venue.declare
// --states my-apps/venue.states.mjs --baselines my-apps/venue-baselines --bless`
//
// The service must be up on 127.0.0.1:8310, and reset (`POST /api/_reset`)
// before a run — bookings and holds accumulate in it. The two viewports are the
// brief's two rooms: a phone at 390×844 and a desk at 1440×900.
//
// The seat field itself is MASKED out of the pixel diff: the service publishes
// other people's purchases on a live event stream, so which seats are dark at
// the instant of capture depends on wall-clock timing and nothing else. The
// diff still gates every other pixel — chrome, type, the rail, the ticket —
// and the masked renders remain the thing to look at.

const PHONE = { width: 390, height: 844 };
const ROOM_PHONE = [{ x: 0, y: 96, w: 390, h: 560 }];
const ROOM_DESK = [{ x: 0, y: 108, w: 1040, h: 792 }];
const DESK = { width: 1440, height: 900 };

// A focused native field blinks its caret, which is the one thing on these
// pages that is not a function of the program's state.
const blur = (page) => page.evaluate(() => document.activeElement?.blur());

const settle = async (drive) => {
  await drive.settleData();
  await drive.wait(400);
  await drive.settleMotion();
};

// Search for a title and walk into its first performance.
const into = (title) => async ({ drive }) => {
  await settle(drive);
  await drive.click("app.season_.head.find.q");
  await drive.type(title);
  await drive.wait(300);
  await drive.settleMotion();
  await drive.click("app.season_.list.inner.0");
  await settle(drive);
};

// Carmen, found by search, then walked into.
const intoCarmen = async ({ drive }) => {
  await settle(drive);
  await drive.click("app.season_.head.find.q");
  await drive.type("Carmen");
  await drive.wait(300);
  await drive.settleMotion();
  await drive.click("app.season_.list.inner.0");
  await settle(drive);
};

// The paths of `n` seats that are actually free, asked of the running program
// rather than guessed from an index.
const freeSeats = (page, n, from = 0) =>
  page.evaluate((n, from) => {
    const plan = window.__declare.inspect("app.hall.plan");
    const out = [];
    const kids = plan.children.filter((c) => c.kind === "Seat");
    for (let i = from; i < kids.length && out.length < n; i++) {
      const p = kids[i].path;
      if (window.__declare.explain(p, "gone").value === false
          && !window.__declare.explain(p, "tip").value.endsWith(" 13 · $145")) out.push(p);
    }
    return out;
  }, n, from);

const freeRail = (page, n) =>
  page.evaluate((n) => {
    const s = window.__declare.inspect("app.hall.dock.rail.strip");
    const out = [];
    for (const c of s.children) {
      if (c.kind !== "RailSeat" || out.length >= n) continue;
      if (window.__declare.explain(c.path, "gone").value === false) out.push(c.path);
    }
    return out;
  }, n);

export default [
  { name: "season-desk", viewport: DESK, route: async ({ drive }) => { await settle(drive); } },
  { name: "season-phone", viewport: PHONE, route: async ({ drive }) => { await settle(drive); } },
  {
    name: "season-search-desk", viewport: DESK,
    route: async ({ drive, page }) => {
      await settle(drive);
      await drive.click("app.season_.head.find.q");
      await drive.type("Carmen");
      await drive.wait(300);
      await blur(page);
      await drive.settleMotion();
    },
  },
  { name: "hall-desk", mask: ROOM_DESK, viewport: DESK, route: intoCarmen },
  { name: "hall-phone", mask: ROOM_PHONE, viewport: PHONE, route: intoCarmen },
  {
    name: "hall-desk-picked", mask: ROOM_DESK, viewport: DESK,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await freeSeats(ctx.page, 2, 120);
      const b = await freeSeats(ctx.page, 1, 460);
      for (const p of [...a, ...b]) await ctx.drive.click(p);
      await ctx.drive.click("app.hall.rail.col.form.nf");
      await ctx.drive.type("Ada Lovelace");
      await ctx.drive.click("app.hall.rail.col.form.mf");
      await ctx.drive.type("ada@example.com");
      await settle(ctx.drive);
    },
  },
  {
    name: "hall-phone-rail", mask: ROOM_PHONE, viewport: PHONE,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await freeSeats(ctx.page, 1, 180);
      await ctx.drive.click(a[0]);
      await settle(ctx.drive);
      const r = await freeRail(ctx.page, 2);
      for (const p of r) await ctx.drive.click(p);
      await settle(ctx.drive);
    },
  },
  {
    // The Studio: 112 seats, so the same plan opens up to thumb size on a desk.
    name: "hall-studio-desk", mask: ROOM_DESK, viewport: DESK,
    route: async (ctx) => {
      await settle(ctx.drive);
      await ctx.drive.click("app.season_.head.find.q");
      await ctx.drive.type("Raymonda");
      await ctx.drive.wait(300);
      await ctx.drive.settleMotion();
      await ctx.drive.click("app.season_.list.inner.0");
      await settle(ctx.drive);
    },
  },
  {
    // A balcony row on a phone: the room slides so the row stays above the rail.
    name: "hall-phone-deep", mask: ROOM_PHONE, viewport: PHONE,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await ctx.page.evaluate(() => {
        const plan = window.__declare.inspect("app.hall.plan");
        const kids = plan.children.filter((c) => c.kind === "Seat");
        return [kids[kids.length - 30].path];
      });
      await ctx.drive.click(a[0]);
      await settle(ctx.drive);
    },
  },
  {
    // Mid-flight: the row that is becoming the hall's header.
    name: "travel-desk", mask: ROOM_DESK, viewport: DESK,
    route: async (ctx) => {
      await settle(ctx.drive);
      await ctx.drive.click("app.season_.head.find.q");
      await ctx.drive.type("Carmen");
      await ctx.drive.wait(300);
      await ctx.drive.settleMotion();
      await blur(ctx.page);
      await ctx.page.evaluate(() => window.__declare.clock.manual());
      await ctx.drive.click("app.season_.list.inner.0");
      await ctx.page.evaluate(() => { window.__declare.clock.step(16); window.__declare.clock.step(230); });
    },
  },
  {
    // The booking sheet on a phone, over the room it belongs to.
    name: "sheet-phone", mask: ROOM_PHONE, viewport: PHONE,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await freeSeats(ctx.page, 1, 180);
      await ctx.drive.click(a[0]);
      await settle(ctx.drive);
      const r = await freeRail(ctx.page, 2);
      for (const p of r) await ctx.drive.click(p);
      await settle(ctx.drive);
      await ctx.drive.click("app.hall.dock.bar.go");
      await ctx.drive.click("app.hall.sheet.col.nf");
      await ctx.drive.type("Ada Lovelace");
      await settle(ctx.drive);
    },
  },
  {
    name: "ticket-phone", viewport: PHONE,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await freeSeats(ctx.page, 1, 180);
      await ctx.drive.click(a[0]);
      await settle(ctx.drive);
      const r = await freeRail(ctx.page, 2);
      for (const p of r) await ctx.drive.click(p);
      await settle(ctx.drive);
      await ctx.drive.click("app.hall.dock.bar.go");
      await settle(ctx.drive);
      await ctx.drive.click("app.hall.sheet.col.nf");
      await ctx.drive.type("Ada Lovelace");
      await ctx.drive.click("app.hall.sheet.col.mf");
      await ctx.drive.type("ada@example.com");
      await ctx.drive.click("app.hall.sheet.col.go");
      await settle(ctx.drive);
    },
  },
  {
    name: "ticket-desk", viewport: DESK,
    route: async (ctx) => {
      await intoCarmen(ctx);
      const a = await freeSeats(ctx.page, 3, 220);
      for (const p of a) await ctx.drive.click(p);
      await ctx.drive.click("app.hall.rail.col.form.nf");
      await ctx.drive.type("Ada Lovelace");
      await ctx.drive.click("app.hall.rail.col.form.mf");
      await ctx.drive.type("ada@example.com");
      await settle(ctx.drive);
      await ctx.drive.click("app.hall.rail.col.form.go");
      await settle(ctx.drive);
    },
  },
];
