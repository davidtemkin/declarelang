// Complete Causal Desk milestone gate. Never blesses or modifies baselines.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = 'apps/causal-desk/';
const commands = [
  ...['lifecycle', 'save', 'recovery', 'clear', 'errors', 'accessibility', 'durable']
    .map(name => [app + `tests/persistence-${name}.mjs`]),
  [app + 'tests/regression.mjs'],
  ['tools/verify.mjs', app + 'tests/path-harness.declare', '--assert', app + 'tests/path-assert.mjs'],
  ['tools/verify.mjs', app + 'tests/persistence-record-harness.declare', '--assert', app + 'tests/persistence-record-assert.mjs'],
  ['tools/verify.mjs', app + 'causal-desk.declare', '--states', app + 'tests/states.mjs'],
  [app + 'tests/persistence-visual.mjs'],
];
for (const args of commands) {
  console.log(`\nRunning node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nCausal Desk: all milestone gates passed.');
