export default async ({ drive, expect, page }) => {
  const y = () => page.evaluate(() => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 10 && getComputedStyle(e).overflowY !== "visible");
    return { fact: window.__declare.find("app.feed").scrollY, first: window.__declare.find("app.feed.list").firstVisibleRow,
             dom: els.map((e) => e.tagName + ":" + Math.round(e.scrollTop) + "/" + e.scrollHeight + "/" + e.clientHeight) };
  });
  console.log("start", JSON.stringify(await y()));
  await drive.wheel("app.feed", -600); console.log("after -600", JSON.stringify(await y()));
  await drive.wheel("app.feed", 600); console.log("after +600", JSON.stringify(await y()));
};
