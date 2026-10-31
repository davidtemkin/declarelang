export default async ({drive,expect,page}) => {
 await page.getByRole('button',{name:'Fri 13 Nov 7:30pm',exact:true}).click();
 await drive.waitReal(500);
 const seats=page.getByRole('button',{name:/^Orchestra, row/});
 const all=await seats.all(); let chosen=[];
 for(const s of all){if(await s.isEnabled()){chosen.push(await s.getAttribute('aria-label'));await s.click();if(chosen.length===2)break}}
 await page.getByRole('button',{name:'Checkout',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pay $174.00',exact:true})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('guest@example.com');
 await page.getByLabel('Name on card',{exact:true}).fill('Guest Person');
 await page.getByLabel('Card number',{exact:true}).fill('4000000000000002');
 await page.getByLabel('Expiry',{exact:true}).fill('04/28');
 await page.getByLabel('Security code',{exact:true}).fill('123');
 await page.getByLabel('Street address',{exact:true}).fill('12 Main Street');
 await page.getByLabel('City',{exact:true}).fill('New York');
 await page.getByLabel('Postal code',{exact:true}).fill('10002');
 await page.getByRole('button',{name:'Pay $174.00',exact:true}).dblclick();
 await drive.waitReal(2000);
 await expect(page.getByLabel('Security code',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Card number',{exact:true})).toHaveValue('4000 0000 0000 0002');
 await page.getByLabel('Card number',{exact:true}).fill('4242424242424242');
 await page.getByLabel('Security code',{exact:true}).fill('123');
 await page.getByRole('button',{name:'Pay $174.00',exact:true}).click();
 await drive.waitReal(2000);
 await expect(page.getByText('Sent to guest@example.com',{exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/venue-tickets.png'});
 await expect.request('POST','/api/orders',{count:2});
};
