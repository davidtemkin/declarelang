// Renaming and deleting from the list, on a presentation made for the check.
const API = "http://127.0.0.1:8360/api";
export default async ({ drive, expect }) => {
  const made = await (await fetch(`${API}/decks`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "List check" }) })).json();
  const id = made.deck.id;
  await drive.page.reload();
  await drive.waitReal(1200);
  await drive.settleMotion();
  // rename through the ⋯ menu
  await drive.page.getByRole("button", { name: "Open List check" }).hover();
  await drive.settleMotion();
  await drive.page.getByRole("button", { name: "More actions" }).first().click();
  await drive.page.getByRole("menuitem", { name: "Rename…" }).click();
  await drive.settleMotion();
  await drive.key("Mod+A");
  await drive.type("List check, renamed");
  await drive.key("Enter");
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.equal((await (await fetch(`${API}/decks/${id}`)).json()).title, "List check, renamed");
  await expect.text("app.lists.page.grid", "List check, renamed");
  // delete asks first; Cancel keeps it
  await drive.page.getByRole("button", { name: "Open List check, renamed" }).click({ button: "right" });
  await drive.page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal((await fetch(`${API}/decks/${id}`)).status, 200);
  // Delete deletes
  await drive.page.getByRole("button", { name: "Open List check, renamed" }).click({ button: "right" });
  await drive.page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await drive.page.getByRole("button", { name: "Delete", exact: true }).click();
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.equal((await fetch(`${API}/decks/${id}`)).status, 404);
  await expect.equal((await drive.read("app.library.value")).decks.some((d) => d.id == id), false);
};
