// exec-chrome — run one case against one tree in headless Chrome, on either
// renderer. The page does the work: the executor (driver-exec.js) is inside the
// metered bundle, so what runs here is the same code iOS Safari runs and the
// same code the Mac host runs for everything but real input.
//
// One browser and one server PER RUN, deliberately: a case leaves state behind
// (windows opened, a city page up, a query typed), and a second case in the
// same page would measure the first one's leftovers. The cost is a launch per
// run; the alternative is a corpus whose rows depend on their order.

import http from "node:http";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .concat([process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH].filter(Boolean))
  .find((p) => p && existsSync(p));

/** The metered bundle built from THAT tree (build-runtime.mjs --web --root …).
 *  Named after the tree so a run cannot silently measure the other one's
 *  bundle — the failure mode that makes a before/after meaningless. */
function bundleFor(treeDir) {
  const tag = path.basename(treeDir).toLowerCase();
  const own = path.join(path.dirname(new URL(import.meta.url).pathname), `../bundles/declare-boot.${tag}.profile.js`);
  const plain = path.join(path.dirname(new URL(import.meta.url).pathname), "../bundles/declare-boot.profile.js");
  if (existsSync(own)) return own;
  if (existsSync(plain) && tag === "declare") return plain;
  throw new Error(`no metered bundle for ${treeDir} — run:\n  node mac-host/profile/build-runtime.mjs --web --root ${treeDir}`);
}

export async function runCaseInChrome(desc, treeDir, { render = "dom", viewport = { width: 1280, height: 828, deviceScaleFactor: 2 } } = {}) {
  if (!CHROME) throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
  const profileSrc = readFileSync(bundleFor(treeDir), "utf8");

  const { createDeclareServer } = await import(path.join(treeDir, "server/create.mjs"));
  const server = createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: treeDir }, { prefix: "/declare/", dir: treeDir, platform: true }],
    mode: "distro",
  });
  const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${httpServer.address().port}`;

  // The in-page pass measures frame PACING, so vsync stays on: an unthrottled
  // frame loop answers a question nobody asked.
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: null, args: ["--no-sandbox"] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    let swapped = 0;
    page.on("request", (req) => {
      if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url())) { swapped++; req.respond({ status: 200, contentType: "application/javascript", body: profileSrc }); }
      else req.continue();
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

    await page.goto(`${base}/${desc.app}?render=${render}`, { waitUntil: "networkidle2", timeout: 90000 });
    if (swapped === 0) throw new Error("the metered bundle was never requested — the page did not boot through declare-boot.js");

    const run = await page.evaluate(async (d) => await globalThis.__profExec(d), desc);
    run.tree = path.basename(treeDir);
    run.render = render;
    run.errors = errors.slice(0, 5);
    return run;
  } finally {
    await browser.close().catch(() => {});
    httpServer.close();
  }
}
