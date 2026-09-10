import assert from "node:assert/strict";

/** Driver invokes a provider and awaits its terminal result (explicitly completed for the fake).
 *  An IndexedDB driver can bridge a real page; this suite never reads provider internals. */
export async function providerConformance({ call, inject, inspect, cleanup }) {
  const scope = { appId: "persistence-conformance", namespace: "case", key: "note" };
  const other = { ...scope, namespace: "sentinel" };
  const missing = await call("read", scope);
  assert.deepEqual(missing, { revision: "absent", kind: "absent" });
  const doc = { format: 1, json: '{"private":"sentinel"}' };
  const first = await call("write", scope, { revision: missing.revision }, doc);
  assert.match(first.revision, /^[0-9a-f]{32}$/);
  assert.equal((await call("read", scope)).json, doc.json);
  await assert.rejects(call("write", scope, { revision: "absent" }, doc), e => e.code === "conflict");
  await call("write", other, { revision: "absent" }, doc);
  const tombstone = await call("erase", scope, { revision: first.revision });
  assert.notEqual(tombstone.revision, first.revision);
  assert.deepEqual(await call("read", scope), { revision: tombstone.revision, kind: "absent" });
  await assert.rejects(call("write", scope, { revision: "absent" }, doc), e => e.code === "conflict");
  const next = await call("write", scope, { overwrite: true }, { format: 1, json: "null" });
  assert.equal((await call("read", scope)).kind, "document", "JSON null is a document");
  const corrupt = { control: 1, revision: next.revision, document: { format: 1, savedAt: first.savedAt, json: "{" } };
  await inject(scope, corrupt);
  assert.equal((await call("read", scope)).kind, "invalid");
  assert.deepEqual(await inspect(scope), corrupt, "read never repairs invalid bytes");
  await call("erase", scope, { revision: next.revision });
  await inject(scope, { control: 99, revision: next.revision, document: null });
  await assert.rejects(call("read", scope), e => e.code === "store_corrupt");
  await assert.rejects(call("erase", scope, { overwrite: true }), e => e.code === "store_corrupt");
  await cleanup(scope.appId, scope.namespace);
  assert.equal((await call("read", other)).json, doc.json, "cleanup preserves neighboring scope");
  await cleanup(other.appId, other.namespace);
}
