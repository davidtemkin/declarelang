export default async ({ drive, expect, page }) => {
  const st = () => page.evaluate(() => { const a = window.__declare.find("app"); return { src: a.src, loaded: a.img.loaded, failed: a.img.failed, nw: a.img.naturalWidth, heard: a.heard }; });
  await drive.waitReal(1000); console.log("1", JSON.stringify(await st()));
  await page.evaluate(() => { window.__declare.find("app").src = "photos/pano.jpg"; });
  await drive.waitReal(1000); console.log("pano", JSON.stringify(await st()));
  await page.evaluate(() => { window.__declare.find("app").src = "photos/6.jpg"; });
  await drive.waitReal(1000); console.log("404", JSON.stringify(await st()));
};
