import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import puppeteer from "puppeteer-core";
const ROOT = "/Users/temkin/Code/Declare";
const MIME = { ".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".mjs":"text/javascript;charset=utf-8",".json":"application/json",".css":"text/css;charset=utf-8",".declare":"text/plain;charset=utf-8",".txt":"text/plain;charset=utf-8",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".ico":"image/x-icon",".mp4":"video/mp4" };
const s = http.createServer((req,res)=>{ let rel; try{rel=decodeURIComponent(new URL(req.url,"http://x").pathname)}catch{res.writeHead(400);return res.end()} let fp=path.join(ROOT,rel);
  try { const st=fs.statSync(fp); if(st.isDirectory()) fp=path.join(fp,"index.html"); res.writeHead(200,{ "content-type":MIME[path.extname(fp).toLowerCase()]??"application/octet-stream","cache-control":"no-store"}); res.end(fs.readFileSync(fp)); } catch { res.writeHead(404); res.end("404 "+rel); } });
await new Promise(r=>s.listen(0,"127.0.0.1",r)); const B=`http://127.0.0.1:${s.address().port}`;
const b = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:true, args:["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({width:1400,height:950});
const errs=[], missing=[];
p.on("pageerror",e=>errs.push(String(e).slice(0,150)));
p.on("console",m=>{ if(m.type()==="error") errs.push("console: "+m.text().slice(0,150)); });
p.on("response",r=>{ if(r.status()===404) missing.push(new URL(r.url()).pathname); });
await p.goto(`${B}/apps/desktop/`, { waitUntil:"networkidle2", timeout:90000 });
await new Promise(r=>setTimeout(r,12000));
console.log("app mounted:", await p.evaluate("window.__app != null"));
console.log("windows:", await p.evaluate("(globalThis.__app?.wm?.windows?.() ?? []).length"));
console.log("nodes:", await p.evaluate("document.querySelectorAll('*').length"));
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r=>setTimeout(r,4000));
console.log("labels after newFiles:", (await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("p, span, div")) { if (el.children.length) continue; const t=(el.textContent??"").trim(); const r=el.getBoundingClientRect(); if (t && r.width && r.left < 700 && r.top > 120 && r.top < 500) out.push(t); }
  return [...new Set(out)].slice(0, 14);
})).join(", "));
console.log("404s:", [...new Set(missing)].slice(0,6).join(", "));
console.log("errors:", errs.slice(0,3).join(" | "));
await b.close(); s.close();
