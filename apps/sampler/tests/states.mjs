// The sampler's named visual states — the widest coverage in the corpus, so
// this is the primary instrument for the chrome-standardization work.
//
//   bless:   node tools/verify.mjs apps/sampler/sampler.declare --states apps/sampler/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/sampler/sampler.declare --states apps/sampler/tests/states.mjs
//
// States are chosen to cover the surfaces the work moves, not to photograph the
// app: theme tokens (every specimen, light and dark), the drawn marks that
// become library icons (menu check, combobox disclosure, datagrid sort, the
// Styling button's chevron), the segmented pill, and the accordion.
//
// Determinism: every route ends in settleMotion(), and any route that leaves
// focus somewhere waits past the focus ring's 1s idle fade first.

// move the pointer to the middle of a view, by its path
const pointAt = async (drive, path) => {
  const n = await drive.page.evaluate((p) => window.__declare.inspect(p), path);
  await drive.page.mouse.move(n.rootX + n.width / 2, n.rootY + n.height / 2);
};

const settle = async (drive, { focused = false } = {}) => {
  await drive.settleMotion();
  if (focused) { await drive.wait(1400); await drive.settleMotion(); }
};

export default [
  // Buttons, checkbox, switches, radios, slider, closed combobox, closed
  // accordion, the segmented pill at rest, the Styling button and the
  // light/dark switch.
  { name: "controls" },

  // The same specimens under the dark palette — the theme split's proving case.
  {
    name: "controls-dark",
    route: async ({ drive }) => {
      await drive.click("app.bar.appear");                    // light → dark
      await settle(drive);
    },
  },

  // THE DARK MENU. A menu's check column, a custom row (the tint dots) and its
  // dividers on a dark surface — the marks most likely to render black on
  // black, so this one state guards the whole class.
  {
    name: "styling-menu-dark",
    scheme: "dark",
    route: async ({ drive }) => {
      await drive.click("app.bar.styling");
      await settle(drive);
    },
  },

  // The Styling menu open, light: its drawn check, the tint row, the dividers.
  {
    name: "styling-menu",
    route: async ({ drive }) => {
      await drive.click("app.bar.styling");
      await settle(drive);
    },
  },

  // The combobox disclosure chevron and its popped list.
  {
    name: "combobox-open",
    route: async ({ drive }) => {
      await drive.click("app.content.col.grid.left.3.demo.cb");
      await settle(drive, { focused: true });
    },
  },

  // An open pane — where the accordion's new disclosure chevron lands.
  {
    name: "accordion-open",
    route: async ({ drive }) => {
      await drive.click("app.content.col.grid.right.3.acc.1");
      await settle(drive, { focused: true });
    },
  },

  // A HOVERED button. The interaction ladder is invisible at rest — every other
  // state here photographs controls nobody is touching — so without this the
  // suite cannot tell `controlHover` from `control`, which is most of what the
  // component work changes. This one hovers the secondary button.
  {
    name: "button-hover",
    route: async ({ drive }) => {
      await pointAt(drive, "app.content.col.grid.left.0.row.1");
      await settle(drive);
      await drive.wait(300);
      await settle(drive);
    },
  },

  // The primary button climbs the same ladder in the accent: `accentHover`
  // under the pointer, `accentPressed` held — light and dark, since the two
  // modes step in opposite directions.
  {
    name: "primary-hover",
    route: async ({ drive }) => {
      await pointAt(drive, "app.content.col.grid.left.0.row.0");
      await settle(drive);
      await drive.wait(300);
      await settle(drive);
    },
  },
  {
    name: "primary-pressed",
    route: async ({ drive }) => {
      await pointAt(drive, "app.content.col.grid.left.0.row.0");
      await drive.page.mouse.down();
      await settle(drive);
    },
  },
  {
    name: "primary-pressed-dark",
    scheme: "dark",
    route: async ({ drive }) => {
      await pointAt(drive, "app.content.col.grid.left.0.row.0");
      await drive.page.mouse.down();
      await settle(drive);
    },
  },

  // Cupertino has no hover: a Mac control does not answer a passing pointer,
  // so under the pointer its primary button stays at rest.
  {
    name: "cupertino-primary-hover",
    route: async ({ drive }) => {
      await drive.set("app", "style", "cupertino");
      await settle(drive);
      await pointAt(drive, "app.content.col.grid.left.0.row.0");
      await settle(drive);
      await drive.wait(300);
      await settle(drive);
    },
  },

  // The pill in its second position — the Segmented enhancement's proving case.
  {
    name: "table",
    route: async ({ drive }) => {
      await drive.click("app.bar.pageSwitch.2");
      await settle(drive, { focused: true });
    },
  },

  // The DataGrid, whose header still sorts with ▼/▲ glyphs today.
  {
    name: "grid",
    route: async ({ drive }) => {
      await drive.click("app.bar.pageSwitch.3");
      await settle(drive, { focused: true });
    },
  },

  // THE FIRST KEYBOARD FLIGHT, over a scrolling page. The ring rides inside the
  // scroller (travelWith) and positions in its CONTENT coordinates — so anything
  // that drags the surface home while those coordinates stand leaves the ring
  // painting the scroller's own origin above its target. `raise()` did exactly
  // that, on the first Tab of a session and no other, which is why 27 states and
  // six gates all stayed green. Click, then Tab: the ring must hug the second
  // button, not float 52px over it.
  {
    name: "focus-first-tab",
    route: async ({ drive }) => {
      await drive.click("app.content.col.grid.left.0.row.0");   // Primary
      await settle(drive, { focused: true });
      await drive.key("Tab");                                    // → Secondary
      // `focused` like every other focus state here: the travelling indicator
      // starts after a beat, so `settleMotion` alone can return BEFORE the ring
      // has begun to move and catch it mid-flight. That is what made this one
      // state differ by a few dozen pixels about one run in three.
      await settle(drive, { focused: true });
    },
  },

  // The stacking path: card columns collapse, the bar compacts.
  { name: "controls-narrow", viewport: { width: 480, height: 900 } },
];
