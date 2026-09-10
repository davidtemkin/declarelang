import { DocumentPersistence } from "../../runtime/dist/persistence/lifecycle.js";
import { ControlledProvider, ControlledClock, microtasks } from "./persistence-provider.mjs";

export function persistenceEngine({ provider, clock = new ControlledClock(), policy = {},
  scope = { appId: "engine", namespace: "isolated", key: "note" }, value = { n: 0 }, validate = () => {} } = {}) {
  provider ??= new ControlledProvider({ now: clock.now });
  const h = { provider, clock, scope, value, state: null, states: [], results: [], requested: false, deferred: [] };
  const binding = {
    capture: () => h.value,
    validate,
    adopt: value => { h.value = value; h.engine.acceptedMutation(); },
    publish: state => { h.state = state; h.states.push(state); },
    deliver: result => h.results.push(result),
    requestSettle: () => { h.requested = true; },
    defer: fn => h.deferred.push(fn),
  };
  h.engine = new DocumentPersistence(provider, scope, { key: scope.key, ...policy }, binding, clock);
  h.edit = value => { h.value = value; h.engine.acceptedMutation(); };
  h.flush = async () => {
    for (let i = 0; i < 30; i++) {
      await microtasks();
      if (!h.requested && !h.deferred.length) return;
      if (h.requested) { h.requested = false; h.engine.settled(true); }
      for (const fn of h.deferred.splice(0)) fn();
    }
    throw new Error("Persistence did not quiesce");
  };
  h.finish = async failure => { provider.complete(undefined, failure); await h.flush(); };
  h.boot = async () => { h.engine.start(); await h.flush(); await h.finish(); };
  h.advance = async ms => { clock.advance(ms); await h.flush(); };
  h.stored = () => provider.inspect(scope);
  h.seed = (json = '{"n":7}', extra = {}) => provider.inject(scope, {
    control: 1, revision: "a".repeat(32), document: { format: 1, json, savedAt: new Date(0).toISOString(), ...extra },
  });
  return h;
}
