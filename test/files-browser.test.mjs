// The person's files in a real browser (runtime files.ts): FilePicker.pick answered
// with real files; files and a folder dragged and dropped onto a view, by the
// browser's own drag events; and an upload of a picked file, as a form. Pins:
//   - pick: each file's name, size, type, and a url; no path for a file alone;
//   - a drag over a view that takes files lights it; a drop gives the view the
//     files, a dropped folder every file in it with its path;
//   - a drop where no view takes files reaches nothing;
//   - a DataSource body holding a file is sent as a multipart form.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { launchChrome, findChrome } from "../tools/internal/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = tempDir("files-");
writeFileSync(path.join(dir, "a.txt"), "hello");
mkdirSync(path.join(dir, "pics", "sub"), { recursive: true });
writeFileSync(path.join(dir, "pics", "c.txt"), "top");
writeFileSync(path.join(dir, "pics", "sub", "b.txt"), "deep");

const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const echo = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify({ type: req.headers["content-type"] ?? "", body: Buffer.concat(chunks).toString("utf8") }));
});
const httpServer = http.createServer((req, res) => (req.url === "/echo" ? echo.emit("request", req, res) : server.handler(req, res)));
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await launchChrome({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 400 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${B}/test/probe/files-probe.declare`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(`window.__declare && __declare.find("app").zone`, { timeout: 30000 });
await page.evaluate((u) => { __declare.find("app").up.url = u; }, `${B}/echo`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const centre = (name) => page.evaluate((n) => { const v = __declare.find("app")[n]; const o = v.rootOrigin(); return { x: o.x + v.width / 2, y: o.y + v.height / 2 }; }, name);
const picked = () => page.evaluate(() => __declare.find("app").picked.map((f) => ({ name: f.name, size: f.size, type: f.type, path: f.path, url: f.url.slice(0, 5) })));
const cdp = await page.createCDPSession();
const drag = async (type, at, files) => cdp.send("Input.dispatchDragEvent", { type, x: at.x, y: at.y, data: { items: [], files, dragOperationsMask: 1 } });

await test("pick: the files chosen, each with its name, size, type and a url", async () => {
  const c = await centre("choose");
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.mouse.click(c.x, c.y)]);
  await chooser.accept([path.join(dir, "a.txt"), path.join(dir, "pics", "c.txt")]);
  await wait(300);
  assert.deepEqual(await picked(), [
    { name: "a.txt", size: 5, type: "text/plain", path: "", url: "blob:" },
    { name: "c.txt", size: 3, type: "text/plain", path: "", url: "blob:" },
  ]);
});

await test("a drag over a view that takes files lights it; the drop brings a folder's every file, with its path", async () => {
  const z = await centre("zone");
  const files = [path.join(dir, "a.txt"), path.join(dir, "pics")];
  await drag("dragEnter", z, files);
  await drag("dragOver", z, files);
  await wait(150);
  assert.equal(await page.evaluate(() => __declare.find("app").hot), true, "onFilesOver lit the zone");
  await drag("drop", z, files);
  await wait(500);
  assert.equal(await page.evaluate(() => __declare.find("app").hot), false, "onFilesOut put it out");
  const got = (await picked()).map((f) => f.path || f.name).sort();
  assert.deepEqual(got, ["a.txt", "pics/c.txt", "pics/sub/b.txt"]);
});

await test("a drop where no view takes files reaches nothing", async () => {
  await page.evaluate(() => { __declare.find("app").picked = []; });
  const at = { x: 590, y: 390 };
  await drag("dragEnter", at, [path.join(dir, "a.txt")]);
  await drag("dragOver", at, [path.join(dir, "a.txt")]);
  await drag("drop", at, [path.join(dir, "a.txt")]);
  await wait(300);
  assert.deepEqual(await picked(), []);
});

await test("an upload: a DataSource body holding a file goes as a form", async () => {
  const z = await centre("zone");
  await drag("dragEnter", z, [path.join(dir, "a.txt")]);
  await drag("drop", z, [path.join(dir, "a.txt")]);
  await wait(300);
  const s = await centre("send");
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction(`__declare.find("app").up.loaded`, { timeout: 5000 });
  const v = await page.evaluate(() => __declare.find("app").up.value);
  assert.match(v.type, /^multipart\/form-data; boundary=/);
  assert.match(v.body, /name="note"\r\n\r\nhi\r\n/);
  assert.match(v.body, /name="file"; filename="a.txt"\r\nContent-Type: text\/plain\r\n\r\nhello\r\n/);
});

await test("no page errors", async () => { assert.deepEqual(errors, []); });

await browser.close();
httpServer.close();
summarize("files-browser");
