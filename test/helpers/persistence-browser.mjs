import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

/** Test-owned origin; serves only built persistence modules and an empty fixture page. */
export async function persistenceBrowser({ artifacts = [] } = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome",
    "/usr/bin/chromium"].find(p => p && existsSync(p));
  if (!executablePath) throw new Error("No browser found; persistence conformance is UNVERIFIED");
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, "http://fixture").pathname;
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const artifact = artifacts.find(a => '/production/' + a.name === name || (name === '/production/' && a.name === 'index.html'));
    if (artifact) {
      res.setHeader('Content-Type', artifact.name.endsWith('.html') ? 'text/html' : 'text/javascript');
      res.end(artifact.contents); return;
    }
    if (name === "/") { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>Persistence fixture</title>"); return; }
    if (!/^\/runtime\/dist\/persistence\/[a-z-]+\.js$/.test(name)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(path.join(root, name)));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  let browser;
  try { browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] }); }
  catch (error) { await new Promise(r => server.close(r)); throw error; }
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function page() {
    const p = await browser.newPage(); await p.goto(origin);
    await p.evaluate(async () => {
      const { IndexedDBProvider } = await import("/runtime/dist/persistence/indexeddb.js");
      globalThis.Provider = IndexedDBProvider;
      globalThis.diagnostics = [];
      globalThis.provider = new IndexedDBProvider({ factory: indexedDB, diagnostic: e => diagnostics.push(e) });
      globalThis.storageFixture = async (operation, scope, value) => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open("declare-persistence", 1);
          r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction("documents", operation === "inspect" ? "readonly" : "readwrite");
            const store = tx.objectStore("documents"); let result;
            tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
            if (operation === "cleanup") {
              const r = store.openCursor();
              r.onsuccess = () => {
                const c = r.result;
                if (!c) return;
                if (c.key[0] === scope.appId && c.key[1] === scope.namespace) c.delete();
                c.continue();
              };
            } else {
              const key = [scope.appId, scope.namespace, scope.key];
              const r = operation === "inject" ? store.put(value, key) : store.get(key);
              r.onsuccess = () => { result = r.result; };
            }
          });
        } finally { db.close(); }
      };
    });
    return p;
  }
  return { browser, page, origin, close: async () => {
    await browser.close(); await new Promise(r => server.close(r));
  } };
}

export function browserDriver(page) {
  return {
    call: async (method, ...args) => {
      const result = await page.evaluate(async (m, a) => {
        try { return { value: await provider[m](...a) }; } catch (error) { return { error }; }
      }, method, args);
      if (result.error) throw result.error;
      return result.value;
    },
    inject: (s, r) => page.evaluate((s, r) => storageFixture("inject", s, r), s, r),
    inspect: s => page.evaluate(s => storageFixture("inspect", s), s),
    cleanup: (appId, namespace) => page.evaluate(s => storageFixture("cleanup", s), { appId, namespace }),
  };
}
