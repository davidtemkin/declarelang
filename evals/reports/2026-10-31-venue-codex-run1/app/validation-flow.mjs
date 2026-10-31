export default async ({drive,expect,page}) => {
 await page.getByRole('button',{name:'Fri 13 Nov 7:30pm',exact:true}).click();
 await drive.waitReal(300);
 const seats=await page.getByRole('button',{name:/^Orchestra, row A, seat/}).all();
 for(const seat of seats)if(await seat.isEnabled()){await seat.click();break}
 await page.getByRole('button',{name:'Checkout',exact:true}).click();
 await page.getByRole('button',{name:'Pay $87.00',exact:true}).click();
 await expect.request('POST','/api/orders',{count:0});
 await expect(page.getByLabel('Email',{exact:true})).toBeFocused();
 await page.getByLabel('Card number',{exact:true}).fill('1234');
 await page.getByLabel('Expiry',{exact:true}).fill('13/28');
 await page.getByLabel('Postal code',{exact:true}).fill('bad');
 await page.getByLabel('City',{exact:true}).focus();
 await expect(page.getByText('Enter a valid postal code for your country.',{exact:true})).toBeVisible();
 await expect(page.getByText('Enter a valid card number.',{exact:true})).toBeVisible();
 await expect(page.getByText('Enter a future expiry month.',{exact:true})).toBeVisible();
 await expect.request('POST','/api/orders',{count:0});
 await page.screenshot({path:'/tmp/venue-validation.png'});
};
