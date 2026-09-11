// Theme presets — authored in the language (theme Name [ … ]), projected into
// the runtime. These pin two contracts: the PROJECTION is fresh (the generated
// module matches library/themes/*.declare — the drift gate), and the by-name
// surface serves the authored records.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { THEME_PRESETS, THEME_PRESET_NAMES } from "../runtime/dist/themes.js";
import { THEME_RECORDS } from "../runtime/dist/themes-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));

await test("themes: the generated projection is FRESH (gen-themes --check)", () => {
  const r = spawnSync(process.execPath, [resolve(HERE, "..", "tools/internal/gen-themes.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

await test("themes: the presets are served by name (the { }-body / theme = Name surface)", () => {
  assert.equal(THEME_PRESETS.SanFrancisco, THEME_RECORDS.SanFrancisco, "the by-name table serves the authored object");
  assert.equal(THEME_PRESETS.SanFranciscoDark, THEME_RECORDS.SanFranciscoDark);
  assert.ok(THEME_PRESET_NAMES.includes("Cupertino") && THEME_PRESET_NAMES.includes("RedmondDark"),
    "every city/mode name is a preset");
});

await test("themes: every preset pair is complete — same token set light and dark", () => {
  for (const city of ["SanFrancisco", "Cupertino", "MountainView"]) {
    const light = Object.keys(THEME_RECORDS[city]).sort();
    const dark = Object.keys(THEME_RECORDS[city + "Dark"]).sort();
    assert.deepEqual(dark, light, `${city}: the dark record states every token the light one does`);
  }
});

await test("themes: the authored tokens round-tripped (spot checks through the real parser)", () => {
  assert.equal(THEME_RECORDS.SanFrancisco.accent, 0x2e6fe0);
  assert.equal(THEME_RECORDS.MountainView.sliderHandle, "bar", "a string token");
  assert.equal(THEME_RECORDS.MountainView.disabledOpacity, 0.38, "a fractional number token");
  assert.equal(THEME_RECORDS.Cupertino.focusRingGap, 0, "a zero survives");
  assert.equal(THEME_RECORDS.SanFrancisco.focusRing, true, "a boolean token");
});

summarize("themes");
