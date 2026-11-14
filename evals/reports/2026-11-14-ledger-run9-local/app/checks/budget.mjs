// Brief §12.7: set a $30 monthly budget for Software; Budgets says in words where it stands.
export default async ({ drive, expect, page }) => {
  await drive.click('app.side.Budgets');
  await drive.settleData();
  const field = page.getByRole('textbox', { name: 'Monthly budget for Software' });
  await field.fill('30');
  await field.press('Enter');
  await drive.settleData();
  // Return saved it and moved down the list, to the row after it
  const list = (await drive.read('app.main.body.budgets.rows.value')).rows;
  const next = list[list.findIndex((r) => r.id == 'software') + 1];
  await expect(page.getByRole('textbox', { name: 'Monthly budget for ' + next.label })).toBeFocused();
  const row = (await drive.read('app.main.body.budgets.rows.value')).rows.find((r) => r.id == 'software');
  if (row.budget != 3000) throw new Error('budget not saved: ' + JSON.stringify(row));
  const words = row.spent > 3000 ? 'Over by $' + ((row.spent - 3000) / 100).toFixed(2) : null;
  await expect(page.getByRole('meter', { name: 'Software spending' })).toBeVisible();
  const state = await page.getByRole('meter', { name: 'Software spending' }).getAttribute('aria-valuetext');
  if (!/On track|over pace|Over by/.test(state)) throw new Error('no state in words: ' + state);
  if (words && !state.includes(words)) throw new Error(`expected ${words}, got ${state}`);
  await expect.text('app.main.body.budgets.page.card', words ?? 'On track');
  // it holds for the next month too
  await drive.click('app.main.bar.top.range.next');
  await drive.settleData();
  await expect(page.getByRole('textbox', { name: 'Monthly budget for Software' })).toHaveValue('30.00');
};
