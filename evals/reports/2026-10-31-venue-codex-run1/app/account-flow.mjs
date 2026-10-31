export const device = {width:390,height:844,touch:true};
export default async ({drive,expect,page}) => {
 await page.getByRole('button',{name:'Fri 13 Nov 7:30pm',exact:true}).click();
 await drive.waitReal(300);
 const seats=await page.getByRole('button',{name:/^Orchestra, row A, seat/}).all();
 for(const seat of seats) if(await seat.isEnabled()){await seat.click();break}
 await page.getByRole('button',{name:'Checkout',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('kept@example.com');
 await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 const dialog=page.getByRole('dialog');

 await dialog.getByLabel('Email',{exact:true}).fill('ada@example.com');
 await expect(await page.evaluate(()=>document.querySelector('input[autocomplete="current-password"]')?.form?.id)).toBe('venue-credentials');
 await dialog.getByLabel('Password',{exact:true}).fill('wrong');
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await drive.waitReal(300);
 await expect(dialog.getByText("That email and password don't match.",{exact:true})).toBeVisible();
 await dialog.getByLabel('Password',{exact:true}).fill('correct horse battery');
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await drive.waitReal(400);
 await expect(page.getByText('Tickets to kept@example.com',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/mastercard ending 4444/})).toBeDisabled();
 await page.getByLabel('Security code',{exact:true}).fill('000');
 await page.getByRole('button',{name:'Pay $87.00',exact:true}).click();
 await drive.waitReal(1800);
 await expect(page.getByLabel('Security code',{exact:true})).toHaveValue('');
 await page.screenshot({path:'/tmp/venue-checkout-phone.png'});
 await expect.request('POST','/api/orders',{count:1,body:{payment:{savedCardId:'card_1',cvc:'000'}}});
 await page.reload();
 await drive.waitReal(400);
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await drive.waitReal(300);
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
};
