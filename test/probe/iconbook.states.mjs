export default [
  { name: "light", viewport: { width: 760, height: 640 },
    route: async ({ drive }) => { await drive.settleMotion(); } },
  { name: "dark", viewport: { width: 760, height: 640 },
    route: async ({ drive }) => {
      await drive.page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
      await drive.wait(150);
      await drive.settleMotion();
    } },
];
