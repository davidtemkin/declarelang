export const device={width:1280,height:800,touch:false};
export default async ({drive,expect,page})=>{
  await drive.settleData();
  await page.screenshot({path:'my-apps/venue/tests/final-desktop.png'});
  // Scroll the entire season and drag its real scrollbar back to the beginning.
  await drive.wheel('app.body',2400);
  const last=await page.evaluate(()=>window.__declare.find('app').production.value.performances.at(-1).id);
  await expect(last).toBe('p20');
  const b=await page.evaluate(()=>{const b=window.__declare.find('app.body');const p=b.rootOrigin();return{x:p.x,y:p.y,w:b.width,h:b.height};});
  await page.mouse.move(b.x+b.w-7,b.y+b.h-28);await page.mouse.down();
  await page.mouse.move(b.x+b.w-7,b.y+35,{steps:12});await page.mouse.up();
  await drive.settleMotion();
  await page.getByRole('button',{name:/Fri 13 Nov, 7:30pm/}).click();await drive.settleData();
  await page.screenshot({path:'my-apps/venue/tests/final-hall-desktop.png'});
  // Resize the existing app. Selection and service records remain the same.
  await page.setViewport({width:900,height:720});await drive.settleMotion();
  await expect.attr('app','step','hall');
  await drive.device({width:390,height:844,touch:true});await drive.settleData();
  await page.getByRole('button',{name:/Fri 13 Nov, 7:30pm/}).click();await drive.settleData();
  await page.screenshot({path:'my-apps/venue/tests/final-hall-phone.png'});
  await page.getByRole('button',{name:/^Balcony, \$/}).click();
  await page.getByRole('button',{name:'Row B',exact:true}).click();
  const name=await page.evaluate(()=>{const a=window.__declare.find('app'),s=a.currentRow.seats.find(s=>s.status==='available');return `Balcony, row B, seat ${s.number}`;});
  await page.getByRole('button',{name,exact:true}).click();
  await expect.text('app.dock','1 seats · $35.00');
  await page.screenshot({path:'my-apps/venue/tests/final-selection-phone.png'});
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.screenshot({path:'my-apps/venue/tests/final-checkout-phone.png'});
  // The dark preference leaves the deliberately paper-coloured programme legible.
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await drive.settleMotion();
  await expect(page.getByRole('textbox',{name:'Email address',exact:true})).toBeVisible();
};
