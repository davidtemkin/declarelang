// scrolldrag.mjs — SCROLLBAR DRAG interactive-parity probe.
//
//   node scrolldrag.mjs <url> <W> <H> <out.png> [dy=180]
//
// Loads the eager calendar, switches to DAY view (click the day tab), settles, then finds
// the vscrollbar thumb in the live view tree (its absolute canvas-local rect), presses the
// mouse on the thumb centre, drags DOWN by `dy` px in small steps (so the drag-state
// getMouse('y') constraint re-evaluates and the target content scrolls), releases, settles,
// and screenshots. Prints the thumb rect + the scrolled target y BEFORE/AFTER so the SAME
// drag can be replayed on the other runtime and the scrolled frames AE-diffed.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const DY = +(process.argv[6] || 180);
const DPR = +(process.env.CAP_DPR || 1) || 1;

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

// click the day tab
const DAYTAB = `(function(){
  function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+=(p.x||0); y+=(p.y||0); } return {x:x,y:y}; }
  var btn = toppanel.mbar.viewbuttons.subviews[0];
  var a=abs(btn); return { x:Math.round(a.x+btn.width/2), y:Math.round(a.y+btn.height/2) };
})()`;

// walk the whole tree for a view that has the thumbdrag scroll state (updateY method +
// classroot with targetview) — the vscrollbar thumb. Return its absolute rect + target y.
const FINDTHUMB = `(function(){
  function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+=(p.x||0); y+=(p.y||0); } return {x:x,y:y}; }
  var found=null;
  function walk(v){
    if(found) return;
    if(v && typeof v.thumbControl==='function' && v.visible!==false){ found=v; return; }
    var subs = v && v.subviews; if(subs) for(var i=0;i<subs.length;i++) walk(subs[i]);
  }
  try{ walk(canvas); }catch(e){ return {err:String(e)}; }
  if(!found) return {err:'no thumb'};
  var a=abs(found);
  var sb=found.parent&&found.parent.parent; // thumb -> scrolltrack -> scrollbar
  var tv=null; try{ tv = sb&&sb.scrolltarget; }catch(e){}
  return { x:a.x, y:a.y, w:(found.width||12), h:(found.height||0), thy:found.y,
           targety:(tv&&(tv.y!=null?tv.y:tv.yscroll))||0, sbh:(sb&&sb.height)||0 };
})()`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/sd-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

async function settle(p){ let prev=null;
  for (let i=0;i<80;i++){ const buf = await p.screenshot({ type:"png" });
    if (prev && Buffer.compare(prev, buf)===0){ return buf; } prev=buf; await sleep(100); }
  return prev; }

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});
for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null);
  if (m!=null) break; await sleep(50); }
await settle(p);

// switch to day view
const dt = await p.evaluate(DAYTAB).catch((e)=>({err:String(e)}));
await p.mouse.click(dt.x, dt.y);
await sleep(300);
await settle(p);

const th = await p.evaluate(FINDTHUMB).catch((e)=>({err:String(e)}));
if (th.err){ console.log("THUMB ERROR: "+th.err); await b.close(); process.exit(2); }
const gx = Math.round(th.x + th.w/2);
const gy = Math.round(th.y + Math.min(th.h/2, 20));   // grab near thumb top

// real drag: press, then move DOWN in steps, then release
await p.mouse.move(gx, gy); await sleep(40);
await p.mouse.down();
const steps=12;
for (let s=1;s<=steps;s++){ await p.mouse.move(gx, gy + Math.round(DY*s/steps)); await sleep(25); }
await p.mouse.up();
await sleep(200);
// park mouse away so no hover lingers
await p.mouse.move(2, 2); await sleep(60);
const finalBuf = await settle(p);
fs.writeFileSync(out, finalBuf);

const after = await p.evaluate(FINDTHUMB).catch(()=>({}));
await b.close();
console.log(JSON.stringify({ out, thumb:{x:gx,y:gy,w:th.w,h:th.h}, dy:DY,
  targetyBefore:th.targety, targetyAfter:(after&&after.targety), thumbyAfter:(after&&(after.y)) }));
