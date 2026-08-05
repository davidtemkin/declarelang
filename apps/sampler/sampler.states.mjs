// The sampler's named visual states — the widest coverage in the corpus, so
// this is the primary instrument for the chrome-standardization work.
//
//   bless:   node tools/verify.mjs apps/sampler/sampler.declare --states apps/sampler/sampler.states.mjs --bless
//   compare: node tools/verify.mjs apps/sampler/sampler.declare --states apps/sampler/sampler.states.mjs
//
// States are chosen to cover the surfaces the work moves, not to photograph the
// app: theme tokens (every specimen, light and dark), the drawn marks that
// become library icons (menu check, combobox disclosure, datagrid sort, the
// appearance door's private chevron), the segmented pill, and the accordion.
//
// Determinism: every route ends in settleMotion(), and any route that leaves
// focus somewhere waits past the focus ring's 1s idle fade first.

const settle = async (drive, { focused = false } = {}) => {
  await drive.settleMotion();
  if (focused) { await drive.wait(1400); await drive.settleMotion(); }
};

export default [
  // Buttons, checkbox, switches, radios, slider, closed combobox, closed
  // accordion, the segmented pill at rest, and the appearance door's glyph.
  { name: "controls" },

  // The same specimens under the dark palette — the theme split's proving case.
  {
    name: "controls-dark",
    route: async ({ drive }) => {
      await drive.click("app.bar.appear");
      await settle(drive);
      await drive.click("app.appearanceMenu.panel.body.2");   // Dark
      await settle(drive);
    },
  },

  // THE DARK MENU. Every icon in this corpus rendered black on a dark surface
  // and no baseline caught it, because every state photographed light mode.
  // A menu is the densest icon site there is — an icon column beside a check
  // column — so this one state guards the whole class.
  {
    name: "appearance-menu-dark",
    scheme: "dark",
    route: async ({ drive }) => {
      await drive.click("app.bar.appear");
      await settle(drive);
    },
  },

  // The appearance menu open: its icon column (☀︎ ◐ ☾) and its drawn check —
  // three of the eight shapes, in the component that already has an icon slot.
  {
    name: "appearance-menu",
    route: async ({ drive }) => {
      await drive.click("app.bar.appear");
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
  // component work changes. Hovering the secondary button (the primary one is
  // accent-filled and ignores the ladder).
  {
    name: "button-hover",
    route: async ({ drive }) => {
      const n = await drive.page.evaluate(() =>
        window.__declare.inspect("app.content.col.grid.left.0.row.1"));
      await drive.page.mouse.move(n.rootX + n.width / 2, n.rootY + n.height / 2);
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
      await settle(drive);
      await drive.key("Tab");                                    // → Secondary
      await settle(drive);
    },
  },

  // The stacking path: card columns collapse, the bar compacts.
  { name: "controls-narrow", viewport: { width: 480, height: 900 } },
];
