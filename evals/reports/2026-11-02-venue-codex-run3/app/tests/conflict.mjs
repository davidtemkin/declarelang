// A disconnected live stream creates a real stale-seat race, resolved by POST /orders.
export default async ({ drive, expect, page }) => {
  await page.setRequestInterception(true);
  page.on('request', r => r.url().includes('/api/events?') ? r.abort() : r.continue());
  await drive.settleData();
  await page.getByRole('button',{name:/Fri 13 Nov, 7:30pm/}).click();
  await drive.settleData();
  const seats = await page.evaluate(() => window.__declare.find('app').hall.seats().filter(s=>s.seat.status==='available' && s.sectionKey==='ORCH' && s.row==='C').slice(0,2).map(s=>({id:s.id,name:`${s.section}, row ${s.row}, seat ${s.seat.number}`})));
  for (const s of seats) await page.getByRole('button',{name:s.name,exact:true}).click();
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  for (const [name,value] of Object.entries({'Email address':'race@example.com','Name on card':'Seat Race','Card number':'4242424242424242','Expiry date':'04/28','Street address':'22 Grove Street','City':'San Francisco','Postal code':'94103'})) {
    await page.getByRole('textbox',{name,exact:true}).fill(value);
  }
  await page.getByLabel('Security code',{exact:true}).fill('123');
  const status = await page.evaluate(async seatId => {
    const response=await fetch('http://127.0.0.1:8350/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({performanceId:'p01',seatIds:[seatId],email:'second-buyer@example.com',payment:{card:{number:'4242424242424242',expMonth:4,expYear:2028,cvc:'123',name:'Second Buyer'},billing:{line1:'22 Grove Street',city:'San Francisco',postalCode:'94103',country:'US'}}})});
    return response.status;
  },seats[0].id);
  await expect(status).toBe(201);
  await page.getByRole('button',{name:'Pay $174.00',exact:true}).click();
  await drive.settleData();
  await expect.attr('app','step','hall');
  await expect.attr('app','selection',[seats[1].id]);
  await expect.attr('app.order','statusCode',409);
  const message=await page.evaluate(()=>window.__declare.find('app').order.errorBody.message);
  await expect.text('app.body.page.notice',message);
  await expect(page.getByRole('button',{name:seats[0].name,exact:true})).toBeDisabled();
  await expect.text('app.dock','1 seats · $80.00');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Email address',exact:true})).toHaveValue('race@example.com');
  await expect(page.getByRole('textbox',{name:'Card number',exact:true})).toHaveValue('4242 4242 4242 4242');
};
