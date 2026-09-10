// Verifier-only wrapper: hold the first real IndexedDB read to exercise boot races.
import { createPersistence as createControlledPersistence } from '../../../test/helpers/persistence-browser-controls.mjs';
export function createPersistence() {
  const persistence = createControlledPersistence();
  globalThis.__persistenceTest.hold = true;
  let currentScope;
  const read = persistence.provider.read;
  persistence.provider.read = scope => { currentScope = scope; return read(scope); };
  // Alter only this verifier's exact key, never the user's application namespace.
  globalThis.__causalStorageCorrupt = change => new Promise((resolve, reject) => {
    const request = indexedDB.open('declare-persistence', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const key = [currentScope.appId, currentScope.namespace, currentScope.key];
      const get = store.get(key);
      get.onsuccess = () => {
        const row = get.result;
        if (change === 'metadata') row.control = 999;
        else if (change === 'format') row.document.format = 999;
        else row.document.json = change;
        store.put(row, key);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  return persistence;
}
