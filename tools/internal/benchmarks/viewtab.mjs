// viewtab.mjs — VIEW-SWITCH parity probe.
//
//   node viewtab.mjs <url> <W> <H> <tab: day|week|month> <out.png>
//
// Loads the eager calendar, settles, clicks the named view tab (toppanel.mbar.viewbuttons
// calButtons: day/week/month), waits for the view transition to settle, screenshots.
// Prints the click target rect + resulting cal_interior.viewstyle so the SAME synthetic
// input can be replayed on the other runtime and the settled frames AE-diffed.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, tab, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6]];
const DPR = +(process.env.CAP_DPR || 1) || 1;
const TABIDX = { day: 0, week: 1, month: 2 };

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

const PROBE = `(function(idx){
  function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+=(p.x||0); y+=(p.y||0); } return {x:x,y:y}; }
  var vb=null; try{ vb = toppanel.mbar.viewbuttons; }catch(e){}
  if(!vb){ return {err:'no viewbuttons'}; }
  var subs = vb.subviews;
  var btn = subs[idx];
  if(!btn){ return {err:'no tab '+idx}; }
  var a=abs(btn);
  return { x:a.x, y:a.y, w:(btn.width||0), h:(btn.height||0) };
})(${TABIDX[tab]})`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/vt-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

async function settle(p){ let prev=null;
  for (let i=0;i<80;i++){ const buf = await p.screenshot({ type:"png" });
    if (prev && Buffer.compare(prev, buf)===0){ return buf; } prev=buf; await sleep(120); }
  return prev; }

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});
for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null);
  if (m!=null) break; await sleep(50); }
await settle(p);

const probe = await p.evaluate(PROBE).catch((e)=>({err:String(e)}));
if (probe.err){ console.log("PROBE ERROR: "+probe.err); await b.close(); process.exit(2); }
const cx = Math.round(probe.x + probe.w/2);
const cy = Math.round(probe.y + probe.h/2);
await p.mouse.move(cx, cy);
await sleep(30);
await p.mouse.click(cx, cy);
await sleep(200);
const afterBuf = await settle(p);
// park mouse at neutral corner so no hover-state lingers, re-settle
await p.mouse.move(2, 2); await sleep(60);
const finalBuf = await settle(p);
fs.writeFileSync(out, finalBuf);
const style = await p.evaluate(()=>{ try{ return cal_interior.viewstyle; }catch(e){ return '?'; } }).catch(()=>'?');
await b.close();
console.log(JSON.stringify({ tab, target:{x:cx,y:cy,w:probe.w,h:probe.h}, viewstyle:style, out }));
