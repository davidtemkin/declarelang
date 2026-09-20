// jskernelpage — can a real page run on the JavaScript kernel, and is it there
// to be debugged? Sets the switch before boot, loads an app, reports which
// kernel answered, what the page fetched, and whether the module arrived
// readable (named functions, not minified).
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const APP = process.argv[2] ?? "apps/calendar/";
const MIME = { ".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".mjs":"text/javascript;charset=utf-8",".json":"application/json",".css":"text/css;charset=utf-8",".declare":"text/plain;charset=utf-8",".txt":"text/plain;charset=utf-8",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".ico":"image/x-icon",".mp4":"video/mp4" };
const sent = [];
const s = http.createServer((req,res)=>{ let rel; try{rel=decodeURIComponent(new URL(req.url,"http://x").pathname)}catch{res.writeHead(400);return res.end()}
  let fp=path.join(ROOT,rel); sent.push(rel);
  try { const st=fs.statSync(fp); if(st.isDirectory()) fp=path.join(fp,"index.html");
    res.writeHead(200,{ "content-type":MIME[path.extname(fp).toLowerCase()]??"application/octet-stream","cache-control":"no-store"}); res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("404"); } });
await new Promise(r=>s.listen(0,"127.0.0.1",r)); const B=`http://127.0.0.1:${s.address().port}`;
const b = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:true, args:["--no-sandbox"] });
for (const useJs of [false, true]) {
  sent.length = 0;
  const p = await b.newPage(); await p.setViewport({width:1200,height:800});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
  if (useJs) await p.evaluateOnNewDocument(() => { globalThis.__declareKernelJS = true; });
  await p.goto(`${B}/${APP}`, { waitUntil:"networkidle2", timeout:90000 });
  await p.waitForFunction("window.__app != null", { timeout:60000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,3000));
  const out = await p.evaluate(() => ({
    kernel: globalThis.__declareKernelKind ?? "(none)",
    nodes: document.querySelectorAll("#host *").length,
    // is the module readable? a minified build would have no such name
    stepThrough: typeof globalThis.__declareKernelJS === "boolean",
  }));
  const fetched = sent.filter(r => /kernel-js|declare-kernel/.test(r));
  console.log(`${useJs ? "__declareKernelJS = true " : "default            "} → kernel=${out.kernel.padEnd(6)} nodes=${String(out.nodes).padStart(4)} fetched=[${fetched.join(", ")}]${errs.length ? " errors: " + errs[0] : ""}`);
  await p.close();
}
const src = fs.readFileSync(path.join(ROOT, "bundles/kernel-js.js"), "utf8");
console.log(`the served module: ${(src.length/1024).toFixed(1)} KB, ${src.split("\n").length} lines, names kept: ${/function instantiateKernelJS|instantiateKernelJS =/.test(src) && /const runQueued|runQueued =/.test(src)}`);
await b.close(); s.close();
