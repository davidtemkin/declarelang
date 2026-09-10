import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { persistenceBrowser, browserDriver } from "./helpers/persistence-browser.mjs";
import { providerConformance } from "./helpers/persistence-conformance.mjs";

const host = await persistenceBrowser();
console.log("persistence browser:", await host.browser.version());
const page = await host.page();
const driver = browserDriver(page);
const scope = { appId: "adapter-tests", namespace: "isolated", key: "note" };
const doc = { format: 1, json: '{"value":42}' };
try {
  await test("real IndexedDB passes shared provider conformance", () => providerConformance(driver));
  await test("P17 two independently opened tabs enforce atomic CAS", async () => {
    const second = await host.page(), other = browserDriver(second);
    try {
      const read = await driver.call("read", scope);
      const expectation = { revision: read.revision };
      const results = await Promise.allSettled([
        driver.call("write", scope, expectation, doc), other.call("write", scope, expectation, doc),
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(results.find(r => r.status === "rejected").reason.code, "conflict");
    } finally { await second.close(); }
  });
  await test("P19 put succeeds then transaction aborts: no receipt and no replaced bytes", async () => {
    const before = await driver.inspect(scope);
    await page.evaluate(() => {
      globalThis.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const r = originalPut.apply(this, args);
        r.addEventListener("success", () => this.transaction.abort());
        return r;
      };
    });
    try { await assert.rejects(driver.call("write", scope, { overwrite: true }, { format: 1, json: '"new"' }), e => e.code === "io"); }
    finally { await page.evaluate(() => { IDBObjectStore.prototype.put = originalPut; }); }
    assert.deepEqual(await driver.inspect(scope), before);
  });
  await test("strict hint is observed; unsupported options fall back to default", async () => {
    await driver.call("write", scope, { overwrite: true }, doc);
    assert.equal(await page.evaluate(() => diagnostics.at(-1).durability), "strict");
    await page.evaluate(() => {
      globalThis.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args.length === 3) throw new TypeError("unsupported options");
        return originalTransaction.apply(this, args);
      };
    });
    try {
      await driver.call("write", scope, { overwrite: true }, doc);
      assert.equal(await page.evaluate(() => diagnostics.at(-1).durability), "default");
    } finally { await page.evaluate(() => { IDBDatabase.prototype.transaction = originalTransaction; }); }
  });
  await test("P22 acknowledged document survives destroying and rebuilding a page", async () => {
    const first = await host.page();
    await browserDriver(first).call("write", scope, { overwrite: true }, doc);
    await first.close();
    const cold = await host.page();
    try { assert.equal((await browserDriver(cold).call("read", scope)).json, doc.json); }
    finally { await cold.close(); }
  });
  await test("captured target and payload cannot be retargeted while open is pending", async () => {
    const result = await page.evaluate(async scope => {
      const p = new Provider({ factory: indexedDB });
      const document = { format: 1, json: "42" };
      const promise = p.write(scope, { overwrite: true }, document);
      scope.key = "wrong"; document.json = "99";
      await promise; p.close();
      return (await provider.read({ ...scope, key: "captured" })).json;
    }, { ...scope, key: "captured" });
    assert.equal(result, "42");
  });
  await test("P20 denied access and quota are normalized without sensitive messages", async () => {
    const errors = await page.evaluate(async scope => {
      const denied = new Provider({ factory: { open() { throw new DOMException("secret", "SecurityError"); } } });
      const out = [];
      try { await denied.read(scope); } catch (e) { out.push(e); }
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => { throw new DOMException("secret", "QuotaExceededError"); };
      try { await provider.write(scope, { overwrite: true }, { format: 1, json: "null" }); }
      catch (e) { out.push(e); }
      finally { IDBObjectStore.prototype.put = original; }
      return out;
    }, scope);
    assert.deepEqual(errors.map(e => e.code), ["unavailable", "quota"]);
    assert.ok(!JSON.stringify(errors).includes("secret"));
  });
  await test("open deadline keeps one attempt and closes its late connection", async () => {
    const result = await page.evaluate(async scope => {
      let deadline, opens = 0, closed = 0;
      const request = {};
      const p = new Provider({ factory: { open() { opens++; return request; } },
        clock: { now: () => 0, schedule(_delay, fn) { deadline = fn; return () => {}; } } });
      const first = p.read(scope).catch(e => e.code);
      request.onblocked(); deadline();
      const code = await first;
      const again = await p.read(scope).catch(e => e.code);
      request.result = { close() { closed++; } }; request.onsuccess();
      return { code, again, opens, closed };
    }, scope);
    assert.deepEqual(result, { code: "blocked", again: "blocked", opens: 1, closed: 1 });
  });
  await test("unblocked open timeout is unavailable, not a falsely completed transaction", async () => {
    const code = await page.evaluate(async scope => {
      let deadline;
      const p = new Provider({ factory: { open() { return {}; } },
        clock: { now: () => 0, schedule(_delay, fn) { deadline = fn; return () => {}; } } });
      const pending = p.read(scope).catch(e => e.code); deadline(); return pending;
    }, scope);
    assert.equal(code, "unavailable");
  });
  await test("versionchange closes/drains the old connection and next read reopens", async () => {
    const result = await page.evaluate(async scope => {
      const original = IDBDatabase.prototype.transaction;
      let connection;
      IDBDatabase.prototype.transaction = function (...args) { connection = this; return original.apply(this, args); };
      try {
        await provider.read(scope);
        const old = connection;
        old.dispatchEvent(new IDBVersionChangeEvent("versionchange", { oldVersion: 1, newVersion: 2 }));
        const receipt = await provider.read(scope);
        return { reopened: old !== connection, json: receipt.json };
      } finally { IDBDatabase.prototype.transaction = original; }
    }, scope);
    assert.ok(result.reopened); assert.equal(result.json, doc.json);
  });
  await test("versionchange during an active put drains its transaction before reopening", async () => {
    const result = await page.evaluate(async scope => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const r = original.apply(this, args);
        r.addEventListener("success", () => this.transaction.db.dispatchEvent(
          new IDBVersionChangeEvent("versionchange", { oldVersion: 1, newVersion: 2 })));
        return r;
      };
      try {
        const receipt = await provider.write(scope, { overwrite: true }, { format: 1, json: "123" });
        return { receipt, read: await provider.read(scope) };
      } finally { IDBObjectStore.prototype.put = original; }
    }, scope);
    assert.equal(result.read.revision, result.receipt.revision);
    assert.equal(result.read.json, "123");
  });
} finally {
  await driver.cleanup(scope.appId, scope.namespace);
  await host.close();
}
summarize("persistence-indexeddb");
