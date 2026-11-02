export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const focusedName=()=>page.evaluate(()=>document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '');
  for(let i=0;i<8;i++) {await drive.key('Tab');if((await focusedName()).includes('Fri 13 Nov'))break;}
  await expect(await focusedName()).toContain('Fri 13 Nov');
  await drive.key('Enter');await drive.settleData();
  await drive.key('Tab');
  await expect(await focusedName()).toContain('Orchestra, row');
  await drive.key('Space');await drive.key('Tab');await drive.key('Space');
  await expect.text('app.dock','2 seats · $160.00');
  // Reverse through the header to the pinned action, avoiding every unchosen seat.
  for(let i=0;i<12;i++){await drive.key('Shift+Tab');if((await focusedName()).includes('Continue'))break;}
  await expect(await focusedName()).toContain('Continue');
  await drive.key('Enter');
  // From the checkout heading: Sign in, then the first field.
  await drive.key('Tab');await drive.key('Tab');
  await expect(page.getByRole('textbox',{name:'Email address',exact:true})).toBeFocused();
  for(const value of ['keyboard@example.com','Keyboard Guest','5555555555554444','04/28','123','42 Grove Street','','San Francisco','United States','94103']){
    if(value){await drive.key('Meta+A');await drive.type(value);}
    await drive.key('Enter');
  }
  await drive.settleData();
  await expect.request('POST','/api/orders',{count:1,body:{email:'keyboard@example.com'}});
  await expect.text('app.body.page.tickets','Sent to keyboard@example.com');
};
