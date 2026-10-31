export default async ({drive,expect,page}) => {
 await page.getByRole('button',{name:'Fri 13 Nov 7:30pm',exact:true}).click();
 await drive.waitReal(300);
 const seats=await page.getByRole('button',{name:/^Orchestra, row A, seat/}).all();
 for(const seat of seats)if(await seat.isEnabled()){await seat.click();break}
 const id=await page.evaluate(()=>window.__declare.find('app').selected[0]);
 const result=await page.evaluate(async seatId=>{
   const response=await fetch('http://127.0.0.1:8350/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({performanceId:'p01',seatIds:[seatId],email:'other@example.com',payment:{card:{number:'4242424242424242',expMonth:4,expYear:2028,cvc:'123',name:'Other Buyer'},billing:{line1:'12 Main St',city:'New York',postalCode:'10002',country:'US'}}})});
   return response.status;
 },id);
 await expect(result).toBe(201);
 await drive.waitReal(400);
 await expect(await page.evaluate(()=>window.__declare.find('app').selected.length)).toBe(0);
 await expect(page.getByText(id+' was just taken. Please choose another seat.',{exact:true})).toBeVisible();
};
