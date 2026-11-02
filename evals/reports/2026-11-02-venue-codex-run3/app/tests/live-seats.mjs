// A second buyer purchases one chosen seat; the real SSE stream must remove it.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole('button',{name:/Fri 13 Nov, 7:30pm/}).click();
  await drive.settleData();
  const seats = await page.evaluate(() => window.__declare.find('app').hall.seats().filter(s=>s.sectionKey==='ORCH' && s.row==='A' && s.seat.status==='available').slice(0,2).map(s=>({id:s.id,name:`${s.section}, row ${s.row}, seat ${s.seat.number}`})));
  for (const s of seats) await page.getByRole('button',{name:s.name,exact:true}).click();
  const before = await page.evaluate(()=>window.__declare.find('app').selection.slice());
  const status = await page.evaluate(async (seatId) => {
    const r = await fetch('http://127.0.0.1:8350/api/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({performanceId:'p01',seatIds:[seatId],email:'other-buyer@example.com',payment:{card:{number:'4242424242424242',expMonth:4,expYear:2028,cvc:'123',name:'Other Buyer'},billing:{line1:'88 Grove Street',line2:null,city:'San Francisco',postalCode:'94103',country:'US'}}})});
    return r.status;
  }, seats[0].id);
  await expect(status).toBe(201);
  await drive.waitReal(500);
  const after = await page.evaluate(()=>{const a=window.__declare.find('app'); return {selection:a.selection,notice:a.notice,stream:a.events.open};});
  await expect(after.stream).toBe(true);
  await expect(after.selection.length).toBe(before.length-1);
  await expect(after.notice).toContain('was just taken.');
  await expect.visible('app.body.page.notice');
};
