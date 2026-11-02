// why-alive — helpers to tag a subtree's nodes before they are discarded and,
// after GC, print what still retains any of them.
import { gc } from "./lib.mjs";
import { retainingPaths } from "./retainers.mjs";

export function tagTree(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return 0;
  seen.add(node);
  let n = 0;
  try { Object.defineProperty(node, "__soakDead", { value: {}, enumerable: false, configurable: true, writable: true }); n++; } catch {}
  const kids = node.$children ?? node.children ?? node.subnodes ?? [];
  for (const c of kids) n += tagTree(c, seen);
  return n;
}
export async function whyAlive(label, max = 2) {
  await gc();
  const { targets, paths } = retainingPaths({ mark: "__soakDead", max });
  console.log(`  [${label}] tagged objects still alive: ${targets}`);
  for (const p of paths) console.log("   " + p + "\n");
  return targets;
}
