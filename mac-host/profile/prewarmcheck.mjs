import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import puppeteer from "puppeteer-core";
const ROOT="/Users/temkin/Code/Declare-Optimize";
const MIME={".html":"text/html",".js":"text/javascript",".json":"application/json",".declare":"text/plain",".txt":"text/plain",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".mp4":"video/mp4",".ico":"image/x-icon"};
const seen=[];
const s=http.createServer((q,r)=>{let rel;try{rel=decodeURIComponent(new URL(q.url,"http://x").pathname)}catch{r.writeHead(400);return r.end()}
 seen.push(rel);
 let fp=path.join(ROOT,rel); try{const st=fs.statSync(fp); if(st.isDirectory())fp=path.join(fp,"index.html");
 r.writeHead(200,{"content-type":MIME[path.extname(fp).toLowerCase()]??"application/octet-stream","cache-control":"no-store"}); r.end(fs.readFileSync(fp));}catch{r.writeHead(404);r.end("404")}});
await new Promise(r=>s.listen(0,"127.0.0.1",r)); const B=`http://127.0.0.1:${s.address().port}`;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1200,height:800});
await p.goto(`${B}/apps/calendar/`,{waitUntil:"networkidle2",timeout:90000});
await p.waitForFunction("window.__app != null",{timeout:60000}); await new Promise(r=>setTimeout(r,3000));
console.log("SERVER SENT:", seen.filter(u=>/cache|compiler|\.declare|kernel/.test(u)).join(", "));
console.log(await p.evaluate(() => {
  const res = performance.getEntriesByType("resource").map(e => e.name.split("/").pop());
  const perf = globalThis.__declarePerf ?? {};
  return JSON.stringify({ path: perf.path, stages: (perf.stages ?? []).map(s => `${s.name ?? s[0]}:${Math.round(s.duration ?? s[1] ?? 0)}`),
    compilerFetched: res.some(n => /declare-compiler/.test(n)), nodes: document.querySelectorAll("#host *").length,
    fetched: res.filter(n => /compiler|cache|kernel|boot/.test(n)).slice(0,6) }, null, 0);
}));
await b.close(); s.close();
