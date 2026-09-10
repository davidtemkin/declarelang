// Loaded only by the verifier host when explicitly requested, never by an app.
import { IndexedDBProvider } from '../../runtime/dist/persistence/indexeddb.js';
import { persistenceError } from '../../runtime/dist/persistence/errors.js';
import { ControlledClock } from './persistence-provider.mjs';

export function createPersistence() {
  const storage = new IndexedDBProvider({ factory: indexedDB });
  const clock = new ControlledClock();
  const controls = { hold: false, failure: null, pending: [], clock,
    release() { controls.pending.shift()?.(); },
  };
  const run = (operation, fn) => new Promise((resolve, reject) => {
    const finish = () => {
      if (controls.failure) {
        const failure = controls.failure; controls.failure = null;
        reject(persistenceError(failure, operation));
      } else Promise.resolve().then(fn).then(resolve, reject);
    };
    if (controls.hold) controls.pending.push(finish); else finish();
  });
  globalThis.__persistenceTest = controls;
  return { clock, provider: {
    read: scope => run('load', () => storage.read(scope)),
    write: (scope, expected, document) => run('commit', () => storage.write(scope, expected, document)),
    erase: (scope, expected) => run('erase', () => storage.erase(scope, expected)),
  } };
}
