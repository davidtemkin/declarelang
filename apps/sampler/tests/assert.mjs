// The sampler's Forms page, driven as a person would: the form judged on submit and
// field by field, a service's refusal under the field it names, then a clean submit;
// and the editing specimens — refused, clamped, tidied, saved when left, committed
// at the release.
export default async ({ drive, expect, page }) => {
  await page.getByRole("tab", { name: "Forms" }).click();
  await drive.settleMotion();

  // nothing filled: submit says every problem at once, under each field
  const create = page.getByRole("button", { name: "Create account" });
  await create.click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Choose a country.")).toBeVisible();
  await expect(page.getByText("Agree to the terms to continue.")).toBeVisible();

  // filled in; the confirmation is judged against the password
  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
  await page.getByLabel("Email").fill("taken@example.com");
  await page.getByLabel("Password", { exact: true }).fill("analytical");
  const confirm = page.getByLabel("Confirm password");
  await confirm.fill("analytica");
  await confirm.press("Tab");
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await confirm.fill("analytical");
  const country = page.getByRole("combobox", { name: "Country" });
  await country.click();
  await country.pressSequentially("Nor");
  await country.press("Enter");
  await page.getByRole("checkbox", { name: "I agree to the terms" }).click();

  // the pretend service refuses the address, under the email field
  await create.click();
  await drive.wait(900);
  await expect(page.getByText("That address already has an account.")).toBeVisible();

  // a new address clears the refusal, and the account is made
  await page.getByLabel("Email").fill("ada@example.com");
  await create.click();
  await drive.wait(900);
  await expect(page.getByText("Welcome, Ada Lovelace — personal plan.")).toBeVisible();

  // refused, and clamped: the typed text stays until the field is left
  const size = page.getByLabel("Font size");
  await size.click(); await size.press("Meta+a"); await size.pressSequentially("4");
  await expect.attr("app", "size", 8);
  await expect(size).toHaveValue("4");
  await size.pressSequentially("x8");
  await expect.attr("app", "size", 48);
  await expect(size).toHaveValue("48");

  // tidied as it arrives
  const code = page.getByLabel("Code");
  await code.fill("Your code is 12 34 56");
  await expect.attr("app", "code", "123456");

  // saved when left; Escape takes it back
  const note = page.getByLabel("Note");
  await note.click(); await note.press("End"); await note.pressSequentially(", revised");
  await expect.attr("app", "note", "First draft");
  await note.press("Tab");
  await expect.attr("app", "note", "First draft, revised");
  await note.click(); await note.press("End"); await note.pressSequentially(" again");
  await note.press("Escape");
  await expect.attr("app", "note", "First draft, revised");
  await expect(note).toHaveValue("First draft, revised");
};
