// The Venue's named visual states.
//
//   bless:   node tools/verify.mjs my-apps/venue.declare --states my-apps/venue.states.mjs --baselines my-apps/venue-baselines --bless
//   compare: node tools/verify.mjs my-apps/venue.declare --states my-apps/venue.states.mjs --baselines my-apps/venue-baselines
//
// The fixture service must be running on 127.0.0.1:8310. Everything it serves
// is deterministic, and the two performances named here are fixed, so the only
// non-determinism to pin is the arrival of the data itself — every route waits
// for it and then settles the springs.

// Each state opens its own page, so each one starts the service from scratch:
// holds, takeovers and booking numbers accumulate in that process, and a
// baseline that photographs the previous state's wreckage is not a baseline.
const reset = () => fetch("http://127.0.0.1:8310/api/_reset", { method: "POST" }).then((r) => r.json());

const settle = async (drive) => {
  await drive.settleData();
  await drive.wait(500);
  await drive.settleMotion();
};

const room = async (drive, id) => {
  await reset();
  await settle(drive);
  await drive.page.evaluate((p) => { window.__declare.find("app").openPerf(p); return null; }, id);
  await settle(drive);
};

export default [
  // The season: search, the hall switch, the exact count, and the list.
  { name: "season", route: async ({ drive }) => { await reset(); await settle(drive); } },

  // Narrowed — the count follows.
  {
    name: "season-carmen",
    route: async ({ drive }) => {
      await reset();
      await settle(drive);
      await drive.click("app.board.find");
      await drive.type("Carmen");
      await drive.wait(250);
      await drive.settleMotion();
    },
  },

  // The Grand Hall, laid out the way the house is: 702 seats, three sections.
  { name: "room", route: async ({ drive }) => { await room(drive, "p2071"); } },

  // Three seats across two sections — the summary bar risen, the form waiting.
  {
    name: "room-chosen",
    route: async ({ drive }) => {
      await room(drive, "p2071");
      await drive.page.evaluate(() => {
        const app = window.__declare.find("app");
        const map = app.seatSrc.value;
        const free = (key, n) => map.sections.find((s) => s.key === key).rows
          .flatMap((r) => r.seats).filter((s) => s.status === "available" && s.number !== 13).slice(0, n);
        for (const s of [...free("ORCH", 2), ...free("BALC", 1)]) app.pickSeat(s.id, false);
        return null;
      });
      await drive.wait(250);
      await drive.settleMotion();
    },
  },

  // The code, and what was booked.
  {
    name: "ticket",
    route: async ({ drive }) => {
      await room(drive, "p2071");
      await drive.page.evaluate(() => {
        const app = window.__declare.find("app");
        const map = app.seatSrc.value;
        const free = (key, n) => map.sections.find((s) => s.key === key).rows
          .flatMap((r) => r.seats).filter((s) => s.status === "available" && s.number !== 13).slice(0, n);
        for (const s of [...free("ORCH", 2), ...free("BALC", 1)]) app.pickSeat(s.id, false);
        app.who = "Ada Lovelace";
        app.mail = "ada@example.com";
        return null;
      });
      await drive.wait(250);
      await drive.settleMotion();
      await drive.click("app.room.bar.go");
      await settle(drive);
    },
  },

  // The season in the dark, following the OS.
  { name: "season-dark", scheme: "dark", route: async ({ drive }) => { await reset(); await settle(drive); } },

  // A hall in the dark, one seat taken.
  {
    name: "room-dark",
    scheme: "dark",
    route: async ({ drive }) => {
      await room(drive, "p2628");
      await drive.page.evaluate(() => {
        const app = window.__declare.find("app");
        const map = app.seatSrc.value;
        for (const s of map.sections[0].rows.flatMap((r) => r.seats)
          .filter((s) => s.status === "available" && s.number !== 13).slice(0, 2)) app.pickSeat(s.id, false);
        return null;
      });
      await drive.wait(250);
      await drive.settleMotion();
    },
  },

  // The same room at the size floor, where the bar is at its tightest.
  {
    name: "room-narrow",
    viewport: { width: 760, height: 620 },
    route: async ({ drive }) => {
      await room(drive, "p2628");
      await drive.page.evaluate(() => {
        const app = window.__declare.find("app");
        const map = app.seatSrc.value;
        for (const s of map.sections[0].rows.flatMap((r) => r.seats)
          .filter((s) => s.status === "available" && s.number !== 13).slice(0, 1)) app.pickSeat(s.id, false);
        return null;
      });
      await drive.wait(250);
      await drive.settleMotion();
    },
  },
];
