// hybrid — the SAME app source against two platforms. /apps/** comes from one
// tree, everything else (runtime bundles, library, browser, compiler) from the
// other, so a difference can only be the platform.
//   node mac-host/profile/hybrid.mjs <appTree> <platformTree>
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import puppeteer from "puppeteer-core";
const APPS = process.argv[2], PLAT = process.argv[3];
const MIME = { ".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".mjs":"text/javascript;charset=utf-8",".json":"application/json",".css":"text/css;charset=utf-8",".declare":"text/plain;charset=utf-8",".txt":"text/plain;charset=utf-8",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".ico":"image/x-icon",".mp4":"video/mp4",".md":"text/markdown;charset=utf-8" };
const s = http.createServer((req,res)=>{
  let rel; try { rel = decodeURIComponent(new URL(req.url,"http://x").pathname); } catch { res.writeHead(400); return res.end(); }
  const root = rel.startsWith("/apps/") ? APPS : PLAT;
  let fp = path.join(root, rel);
  try {
    const st = fs.statSync(fp); if (st.isDirectory()) fp = path.join(fp, "index.html");
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise(r=>s.listen(0,"127.0.0.1",r)); const B=`http://127.0.0.1:${s.address().port}`;
const b = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:true, args:["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({width:1400,height:950});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
await p.goto(`${B}/apps/desktop/`, { waitUntil:"networkidle2", timeout:90000 });
await p.waitForFunction("window.__app != null", { timeout:60000 });
await p.waitForFunction("(globalThis.__app.wm?.windows?.() ?? []).length > 0", { timeout:60000 }).catch(()=>{});
await p.evaluate("__app.launcher.newFiles()");
await new Promise(r=>setTimeout(r,2500));
const point = (want) => p.evaluate((w) => {
  const hits=[]; for (const el of document.querySelectorAll("p, span, div")) { if (el.children.length) continue; if ((el.textContent??"").trim()!==w) continue; const r=el.getBoundingClientRect(); if(!r.width) continue; hits.push({x:r.left+r.width/2,y:r.top+r.height/2}); }
  const at = hits.sort((a,b)=>b.y-a.y)[0]; return at ? {x:at.x,y:at.y} : null; }, want);
let at=null; for (let i=0;i<40 && at===null;i++) { at = await point("Background"); if (!at) await new Promise(r=>setTimeout(r,300)); }
if (!at) { console.log(`apps=${path.basename(APPS)} platform=${path.basename(PLAT)}  → no Background row`); await b.close(); s.close(); process.exit(0); }
await p.mouse.click(at.x, at.y); await new Promise(r=>setTimeout(r,90)); await p.mouse.click(at.x, at.y);
await new Promise(r=>setTimeout(r,2500));
const out = await p.evaluate(() => { const wm=globalThis.__app.wm, w=wm.windows(); return { windows:w.length, active:w.filter(x=>x.active===true).length, front:String(wm.frontId??""), frontResolves: wm.frontWin!=null }; });
console.log(`apps=${path.basename(APPS)} platform=${path.basename(PLAT)}  → ${JSON.stringify(out)}${errs.length?"  errors: "+errs[0]:""}`);
await b.close(); s.close();
