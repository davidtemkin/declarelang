// Failure 3: on Transactions, every node a person (or the drive's loose finder) could take
// for "Uncategorised", by role and name; and the node the drive's `option(/^uncategori[sz]ed\b/i)`
// would pick (OPTION_ROLES includes gridcell and cell).
const OPTION_ROLES = new Set(["option", "menuitem", "menuitemradio", "menuitemcheckbox", "checkbox", "radio", "listitem", "button", "treeitem", "gridcell", "cell"]);
export default async function (page, h) {
  const tx = (await h.nodes()).find((x) => ["link", "button", "tab"].includes(x.role) && /^Transactions\b/.test(x.name));
  const el = (await (await tx.elementHandle()).evaluateHandle((e) => (e.nodeType === 1 ? e : e.parentElement))).asElement();
  await el.click(); await h.sleep(1500);
  const all = await h.nodes();
  return {
    uncategorised: all.filter((n) => /uncategori/i.test(n.name ?? "") && !["StaticText", "InlineTextBox"].includes(n.role)).slice(0, 6).map((n) => `${n.role}: ${n.name}`),
    drivePicks: all.filter((n) => OPTION_ROLES.has(n.role) && /^uncategori[sz]ed\b/i.test(n.name ?? "")).slice(0, 3).map((n) => `${n.role}: ${n.name}`),
    categoryControls: all.filter((n) => /^categor/i.test(n.name ?? "") && !["StaticText", "InlineTextBox"].includes(n.role)).slice(0, 6).map((n) => `${n.role}: ${n.name}`),
  };
}
