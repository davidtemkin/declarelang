import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { encodeSnapshot, decodeSnapshot, freezeCandidate, MAX_PAYLOAD_BYTES } from "../runtime/dist/persistence/codec.js";
import { classifyRow, validatePolicy, resolveScope } from "../runtime/dist/persistence/records.js";
import { normalizeError } from "../runtime/dist/persistence/errors.js";
import { ControlledProvider, ControlledClock } from "./helpers/persistence-provider.mjs";
import { providerConformance } from "./helpers/persistence-conformance.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
const rejectsValue = value => assert.throws(() => encodeSnapshot(value), e => e.code === "invalid_record");

await test("portable snapshots are detached, finite, and normalized", () => {
  const value = { n: null, a: [true, "✓", -0, 1.5], nested: { value: 2 } };
  const encoded = encodeSnapshot(value);
  value.nested.value = 4;
  assert.equal(decodeSnapshot(encoded.json).nested.value, 2);
  assert.deepEqual(plain(decodeSnapshot(encoded.json)), { n: null, a: [true, "✓", 0, 1.5], nested: { value: 2 } });
  assert.ok(Object.isFrozen(encoded));
  const candidate = freezeCandidate(decodeSnapshot(encoded.json));
  assert.ok(Object.isFrozen(candidate.nested));
  assert.throws(() => { candidate.nested.value = 9; });
});
await test("all lossy values are refused before serialization", () => {
  for (const v of [NaN, Infinity, -Infinity, undefined, () => {}, Symbol(), 1n, new Date(), new Map(),
    new Set(), /x/, new Uint8Array(2), new (class Value {})(), [, 1]]) rejectsValue(v);
  const cycle = {}; cycle.self = cycle; rejectsValue(cycle);
  for (const v of [undefined, NaN, () => {}, 1n]) rejectsValue({ nested: [v] });
  rejectsValue({ [Symbol()]: 1 });
  rejectsValue(Object.defineProperty({}, "hidden", { value: 1 }));
  let calls = 0;
  rejectsValue({ get secret() { calls++; return 1; } });
  assert.equal(calls, 0);
  const extra = [1]; extra.extra = 2; rejectsValue(extra);
  const shared = { x: 1 };
  assert.deepEqual(plain(decodeSnapshot(encodeSnapshot([shared, shared]).json)), [{ x: 1 }, { x: 1 }]);
});
await test("prototype-shaped keys remain inert own data", () => {
  const value = decodeSnapshot('{"__proto__":{"polluted":true},"constructor":{"x":1}}');
  assert.equal({}.polluted, undefined);
  assert.ok(Object.hasOwn(value, "__proto__"));
  assert.equal(decodeSnapshot(encodeSnapshot(value).json).__proto__.polluted, true);
});
await test("payload limits measure actual UTF-8 bytes including JSON quoting", () => {
  assert.equal(encodeSnapshot("x".repeat(MAX_PAYLOAD_BYTES - 2)).bytes, MAX_PAYLOAD_BYTES);
  assert.throws(() => encodeSnapshot("x".repeat(MAX_PAYLOAD_BYTES - 1)), e => e.code === "too_large");
  assert.equal(encodeSnapshot("é".repeat((MAX_PAYLOAD_BYTES - 2) / 2)).bytes, MAX_PAYLOAD_BYTES);
  assert.throws(() => decodeSnapshot('"' + "é".repeat(MAX_PAYLOAD_BYTES / 2) + '"'), e => e.code === "too_large");
  assert.throws(() => decodeSnapshot("{"), e => e.code === "invalid_record");
  assert.throws(() => decodeSnapshot("1e999"), e => e.code === "invalid_record");
});
await test("metadata classification preserves invalid payload authority", () => {
  const revision = "a".repeat(32);
  const row = document => ({ control: 1, revision, document });
  assert.equal(classifyRow(row({ format: 2 })).error.code, "unsupported_format");
  assert.equal(classifyRow(row({ format: 1, savedAt: "bad", json: "{}" })).error.code, "invalid_record");
  assert.equal(classifyRow(row(null)).kind, "absent");
  assert.throws(() => classifyRow({ control: 1, revision: "absent", document: null }), e => e.code === "store_corrupt");
});
await test("policy and host scope validate and canonicalize only entry identity", () => {
  assert.equal(validatePolicy({ key: "note" }).delay, 250);
  for (const p of [{ key: "" }, { key: "a", delay: -1 }, { key: "a", maxDelay: NaN },
    { key: "a", delay: 1001 }, { key: "a", conflict: "merge" }, { key: "é".repeat(513) }])
    assert.throws(() => validatePolicy(p), e => e.code === "configuration");
  assert.deepEqual(resolveScope("https://example.test/app.declare?debug=1#edit", "a/../b"),
    { appId: "https://example.test/app.declare", namespace: "default", key: "a/../b" });
  assert.equal(resolveScope("https://example.test/app.declare", "a", "stable").appId, "stable");
});
await test("errors expose safe stable codes without payload exception messages", () => {
  assert.equal(normalizeError(new DOMException("private", "QuotaExceededError"), "commit").code, "quota");
  assert.equal(normalizeError(new DOMException("private", "SecurityError"), "load").code, "unavailable");
  assert.ok(!normalizeError(new Error("private"), "erase").message.includes("private"));
});
await test("deterministic provider satisfies reusable conformance", async () => {
  const provider = new ControlledProvider();
  await providerConformance({
    call: (method, ...args) => { const p = provider[method](...args); provider.complete(); return p; },
    inject: (s, r) => provider.inject(s, r), inspect: s => provider.inspect(s),
    cleanup: (a, n) => provider.cleanup(a, n),
  });
  assert.ok(!JSON.stringify(provider.log).includes('"private"'));
});
await test("controlled completion can fail writes without mutation and logs safely", async () => {
  const provider = new ControlledProvider();
  const scope = { appId: "app", namespace: "case", key: "a" };
  const p = provider.write(scope, { revision: "absent" }, { format: 1, json: '"private payload"' });
  assert.equal(provider.inspect(scope), undefined);
  provider.complete(undefined, "quota");
  await assert.rejects(p, e => e.code === "quota");
  assert.equal(provider.inspect(scope), undefined);
  const a = provider.read(scope), b = provider.read({ ...scope, key: "b" });
  provider.complete(provider.pending[1].id); await b;
  assert.equal(provider.pending.length, 1);
  provider.complete(); await a;
  assert.ok(!JSON.stringify(provider.log).includes("private payload"));
});
await test("controlled clock orders deadlines and honors cancellation", () => {
  const clock = new ControlledClock(), seen = [];
  clock.schedule(10, () => seen.push(clock.now()));
  const cancel = clock.schedule(5, () => seen.push("canceled")); cancel();
  clock.advance(9); assert.deepEqual(seen, []);
  clock.advance(1); assert.deepEqual(seen, [10]);
});
summarize("persistence-contract");
