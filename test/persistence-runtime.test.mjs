import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build, settle, afterSettle } from "../runtime/dist/index.js";
import { edited } from "../runtime/dist/editor.js";
import { ControlledClock, ControlledProvider, microtasks } from "./helpers/persistence-provider.mjs";

const source = (attrs = '', init = '', extra = '') => `
schema Doc [ n: number, rows[]: number ]
App [ storageKey: string = "note", receipts: object = {([])},
  db: Dataset [ schema = Doc, disk: Persistence [ key = {app.storageKey}, save="manual" ${attrs},
    onResult(r: PersistenceResult) { app.receipts.push(r) }
  ] ] { {"n":0,"rows":[1,2]} },
  ${extra}
  onInit() { app.receipts = []; ${init} }
]`;
async function drain() { for (let i = 0; i < 3; i++) { settle(); await microtasks(); } }
async function fixture(text = source(), options = {}) {
  const compiled = await compile(text); assert.deepEqual(compiled.errors, []);
  const clock = options.clock ?? new ControlledClock();
  const provider = options.provider ?? new ControlledProvider({ now: clock.now });
  const app = build(compiled.source, { persistence: { provider, clock, appId: "runtime-test", ...options } });
  await drain();
  return { app, disk: app.db.disk, provider, clock,
    async finish(failure) { provider.complete(undefined, failure); await drain(); },
    async boot() { provider.complete(); await drain(); },
  };
}
const doc = n => ({ n, rows: [1, 2] });
function seed(provider, n = 7) {
  provider.inject({ appId: "runtime-test", namespace: "default", key: "note" }, {
    control: 1, revision: "1".repeat(32), document: { format: 1, json: JSON.stringify(doc(n)), savedAt: new Date(0).toISOString() },
  });
}

await test("P02 accepted region writes revise once per settle; no-ops and seed do not", async () => {
  const h = await fixture();
  try {
    await h.boot(); assert.equal(h.disk.revision, 0); assert.equal(h.disk.dirty, false);
    h.app.db.set(["n"], 0); h.app.db.move(["rows"], 0, 0); h.app.db.removeAt(["rows"], 9);
    await drain(); assert.equal(h.disk.revision, 0);
    for (const mutate of [() => h.app.db.set(["n"], 1), () => h.app.db.insert(["rows"], 1, 3),
      () => h.app.db.removeAt(["rows"], 0), () => h.app.db.move(["rows"], 0, 1),
      () => h.app.db.set([], doc(9))]) {
      const before = h.disk.revision; mutate(); await drain(); assert.equal(h.disk.revision, before + 1);
    }
    assert.equal(h.provider.log.length, 1, "manual edits never write without a command");
  } finally { h.app.discard(); }
});
await test("P03/P04/P05 cold adoption, manual candidate, and init edits preserve local intent", async () => {
  for (const [attrs, init, expected, recovery] of [
    ['', '', 7, 'none'], [',restoreOn="manual"', '', 0, 'available'], ['', 'app.db.set(["n"],2)', 2, 'available'],
  ]) {
    const provider = new ControlledProvider(); seed(provider);
    const h = await fixture(source(attrs, init), { provider });
    try {
      await h.boot(); assert.equal(h.app.db.value.n, expected); assert.equal(h.disk.recovery, recovery);
      if (recovery === 'available') {
        assert.equal(Object.isFrozen(h.disk.candidate), true);
        assert.throws(() => { h.disk.candidate.n = 99; }, TypeError);
        assert.equal(h.disk.restore(), true); assert.equal(h.disk.restore(), false);
        await drain(); assert.equal(h.app.db.value.n, 7); assert.equal(h.disk.saved, true);
        h.app.db.set(["n"], 8); await drain(); assert.equal(h.app.db.value.n, 8);
      } else assert.equal(h.disk.saved, true);
    } finally { h.app.discard(); }
  }
});
await test("P06 boot commit cannot overwrite a discovered saved document", async () => {
  const provider = new ControlledProvider(); seed(provider);
  const h = await fixture(source('', 'app.db.disk.commit()'), { provider });
  try {
    await h.boot(); assert.equal(h.disk.recovery, 'available'); assert.equal(h.app.db.value.n, 0);
    assert.equal(h.provider.log.length, 1);
    assert.ok(h.app.receipts.some(r => r.requestId === 1 && r.error?.code === 'recovery_pending'), JSON.stringify(h.app.receipts));
  } finally { h.app.discard(); }
});
await test("P07/P07b commands capture after nested afterSettle waves and return correlated receipts", async () => {
  const h = await fixture();
  try {
    await h.boot(); const first = h.disk.commit(), second = h.disk.commit();
    h.app.db.set(["n"], 1);
    afterSettle(() => { h.app.db.set(["n"], 2); afterSettle(() => h.app.db.set(["n"], 3)); });
    await drain(); assert.equal(h.disk.revision, 1);
    assert.equal(JSON.parse(h.provider.pending[0].document.json).n, 3);
    assert.equal(h.app.receipts.some(r => r.requestId === first), false);
    await h.finish(); await h.finish();
    assert.deepEqual(h.app.receipts.filter(r => r.requestId > 0).map(r => [r.requestId,r.ok,r.revision]),
      [[first,true,1],[second,true,1]]);
    assert.equal(h.disk.saved, true);
  } finally { h.app.discard(); }
});
await test("P07 rejected numeric editor draft never reaches persistence", async () => {
  const h = await fixture(source('', '', 'form: View [ datapath={app.db.value}, field: TextInput [text <-> :n, commitOn="manual"] ],'));
  try {
    await h.boot(); const field = h.app.form.field;
    field.text = 'not a number'; edited(field, 'text', 'manual'); field.commit(); await drain();
    assert.equal(field.valid, false); assert.equal(h.disk.revision, 0); assert.equal(h.app.db.value.n, 0);
    field.text = '12'; edited(field, 'text', 'manual'); field.commit(); await drain();
    assert.equal(field.valid, true); assert.equal(h.app.db.value.n, 12); assert.equal(h.disk.revision, 1);
  } finally { h.app.discard(); }
});
await test("P08 failed settle rejects unpinned writes; explicit clean commit recovers", async () => {
  const h = await fixture();
  try {
    await h.boot(); h.app.db.set(["n"], 3); const id = h.disk.commit();
    afterSettle(() => { throw new Error('authored failure'); });
    assert.throws(() => settle(), /authored failure/); await drain();
    assert.equal(h.disk.error.code, 'settle_failed'); assert.equal(h.provider.pending.length, 0);
    assert.ok(h.app.receipts.some(r => r.requestId === id && r.error?.code === 'settle_failed'));
    h.disk.commit(); await drain(); await h.finish(); assert.equal(h.disk.saved, true);
  } finally { h.app.discard(); }
});
await test("P14/P15/P16 erase keeps working data and pauses autosave until an explicit save", async () => {
  const h = await fixture(source().replace('save="manual"', 'save="auto"'));
  try {
    await h.boot(); h.app.db.set(["n"], 9); h.disk.commit(); await drain(); await h.finish();
    h.disk.erase(); await drain(); await h.finish();
    assert.equal(h.app.db.value.n, 9); assert.equal(h.disk.exists, false); assert.equal(h.disk.autosavePaused, true);
    h.app.db.set(["n"], 10); await drain(); h.clock.advance(2000); await drain();
    assert.equal(h.provider.pending.length, 0);
    h.disk.commit(); await drain(); await h.finish(); assert.equal(h.disk.saved, true);
  } finally { h.app.discard(); }
});
await test("P08 a delayed empty boot cannot clear a failed settle or restart autosave", async () => {
  const h = await fixture(source().replace('save="manual"', 'save="auto"'));
  try {
    h.app.db.set(['n'], 9); afterSettle(() => { throw new Error('failed before load'); });
    assert.throws(() => settle(), /failed before load/); await h.boot();
    assert.equal(h.disk.error.code, 'settle_failed'); h.clock.advance(2000); await drain();
    assert.equal(h.provider.pending.length, 0);
    h.disk.commit(); await drain(); await h.finish(); assert.equal(h.disk.saved, true);
  } finally { h.app.discard(); }
});
await test("P01 dynamic policy changes fail closed after old I/O succeeds; duplicate owners are refused", async () => {
  const h = await fixture();
  try {
    await h.boot(); h.disk.commit(); await drain(); h.app.storageKey = 'changed'; await drain();
    assert.equal(h.disk.error.code, 'configuration'); await h.finish(); assert.equal(h.disk.error.code, 'configuration');
    assert.equal(h.provider.log.every(r => r.scope.key === 'note'), true);
  } finally { h.app.discard(); }
  const duplicate = await fixture(source('', '', 'other: Dataset [ disk: Persistence [key="note"] ] {null},'));
  try {
    assert.equal(duplicate.app.other.disk.error.code, 'configuration'); assert.equal(duplicate.provider.log.length, 1);
  } finally { duplicate.app.discard(); }
});
await test("P18 retirement suppresses old events and serializes replacement owner behind issued write", async () => {
  const provider = new ControlledProvider(); const a = await fixture(source(), { provider });
  await a.boot(); a.app.db.set(["n"], 42); a.disk.commit(); await drain(); a.app.discard();
  const b = await fixture(source(), { provider });
  try {
    assert.equal(provider.pending.length, 1); assert.equal(provider.pending[0].operation, 'commit');
    await b.finish(); assert.equal(provider.pending[0].operation, 'load'); await b.finish();
    assert.equal(b.app.db.value.n, 42); assert.equal(a.app.receipts.filter(r => r.operation === 'commit').length, 0);
  } finally { b.app.discard(); }
});
await test("P21 authored Save and leave cancellation ignores an eventual successful receipt", async () => {
  const text = source('', '', `leaving: boolean = false, leaveRequest: number = 0, navigated: number = 0,
    leave() { app.leaving = true; app.leaveRequest = app.db.disk.commit() },
    cancel() { app.leaving = false },`).replace('app.receipts.push(r)',
    'app.receipts.push(r); if (app.leaving && r.requestId === app.leaveRequest && r.ok) { app.navigated++; app.leaving = false }');
  const h = await fixture(text);
  try {
    await h.boot(); h.app.leave(); await drain(); h.app.cancel(); await h.finish(); assert.equal(h.app.navigated, 0);
    h.app.leave(); await drain(); await h.finish(); assert.equal(h.app.navigated, 1);
  } finally { h.app.discard(); }
});
await test("same-root replacement releases key ownership and initializes an imperative policy before onInit", async () => {
  const h = await fixture(`class Holder extends View [
    db: Dataset [disk: Persistence [key="note", save="manual"]] {{"n":0,"rows":[1,2]}},
    onInit() { classroot.db.disk.commit() }
  ]\n` + source());
  try {
    await h.boot(); h.app.db.set(['n'], 32); h.disk.commit(); await drain();
    h.app.db.discard(); const child = h.app.createView('Holder'); await drain();
    assert.equal(h.provider.pending.length, 1); assert.equal(h.provider.pending[0].operation, 'commit');
    await h.finish(); await h.finish();
    assert.equal(child.db.disk.recovery, 'available', 'onInit save intent was captured before boot read');
    assert.equal(child.db.disk.candidate.n, 32); assert.equal(child.db.disk.error, null);
  } finally { h.app.discard(); }
});
await test("unsupported host reports failure, and plain Dataset never invokes storage", async () => {
  const c = await compile(source()); const app = build(c.source);
  try { await drain(); assert.equal(app.db.disk.error.code, 'unsupported'); assert.equal(app.db.disk.saved, false); }
  finally { app.discard(); }
  const provider = new ControlledProvider(); const plain = await compile('App [db: Dataset {{"n":0}}]');
  const p = build(plain.source, { persistence: { provider } }); p.db.set(['n'], 2); await drain();
  assert.equal(provider.log.length, 0); p.discard();
});
summarize('persistence-runtime');
