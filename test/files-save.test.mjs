// FilePicker.save with a native host (runtime files.ts): the host is handed the
// file's bytes — text as UTF-8, a Blob's own — its name and its type, and what
// it answers (saved, or cancelled) is what save resolves to. The browser's
// download is tested through declare-verify (verify-requests.test).
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { FilePicker, provideFilesHost } from "../runtime/dist/index.js";

const seen = [];
let answer = true;
provideFilesHost({
  pick: () => Promise.resolve([]),
  save: (bytes, options) => { seen.push({ text: new TextDecoder().decode(bytes), ...options }); return Promise.resolve(answer); },
});

await test("text goes to the host as UTF-8, with its name and the type its extension names", async () => {
  const ok = await FilePicker.save("café,1\n", { name: "rows.csv" });
  assert.equal(ok, true);
  assert.deepEqual(seen.at(-1), { text: "café,1\n", name: "rows.csv", type: "text/csv;charset=utf-8" });
});

await test("a Blob's bytes and type go as they are; a type given wins", async () => {
  await FilePicker.save(new Blob(["{\"a\":1}"], { type: "application/json" }), { name: "backup" });
  assert.deepEqual(seen.at(-1), { text: "{\"a\":1}", name: "backup", type: "application/json" });
  await FilePicker.save("BEGIN:VCALENDAR", { name: "event.ics", type: "text/calendar" });
  assert.equal(seen.at(-1).type, "text/calendar");
});

await test("a cancelled save resolves false; a save with no name is refused, saying so", async () => {
  answer = false;
  assert.equal(await FilePicker.save("x", { name: "a.txt" }), false);
  await assert.rejects(FilePicker.save("x", { name: " " }), /needs a file name/);
});

summarize("files-save");
