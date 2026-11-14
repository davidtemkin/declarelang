// Shared helpers for Ledger's checks: read the running program, and say money as the app does.
export const app = (page, expr) => page.evaluate(new Function("return (" + expr + ")").toString().replace(/^function anonymous\(\n\) \{\nreturn \(/, "() => (").replace(/\)\n\}$/, ")"));
export async function read(page, path, attr) {
  return page.evaluate(([p, a]) => { const v = window.__declare.find(p)[a]; return JSON.parse(JSON.stringify(v ?? null)); }, [path, attr]);
}
export function money(c) {
  const a = Math.abs(Math.round(c));
  const s = "$" + String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(a % 100).padStart(2, "0");
  return c < 0 ? "−" + s : s;
}
export async function settle(drive) { await drive.settleData(); await drive.settleMotion(); }
