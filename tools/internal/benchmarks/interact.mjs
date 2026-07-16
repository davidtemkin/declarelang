// interact.mjs — INTERACTIVE PARITY probe.
//
//   node interact.mjs <url> <W> <H> <out-before.png> <out-after.png>
//
// Loads an OpenLaszlo app, waits until it is built + settled (capture.mjs's readiness
// model: canvas.isinited then frame-stability), locates the calendar's NEXT-month nav
// arrow in the live view tree (walks .parent summing .x/.y for an absolute canvas-local
// rect), screenshots BEFORE, dispatches a real mouse click at the arrow centre, waits
// for the re-render to settle, screenshots AFTER, and prints the month-title text +
// click target rect so the SAME synthetic input can be replayed on the other runtime.
//
// Used to AE-diff DHTML-after vs canvas-after => first interactive-parity number.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, outBefore, outAfter] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6]];
// HiDPI: CAP_DPR=2 drives clicks/captures at Retina deviceScaleFactor 2 (input coords stay
// CSS/logical px, so hit-testing is exercised at dpr=2). DEFAULT 1 = deterministic path.
const DPR = +(process.env.CAP_DPR || 1) || 1;

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

// In-page: find the nav arrow whose onclick runs nextMonth, return its absolute
// canvas-local rect (sum .x/.y up the parent chain) + the current month title.
const PROBE = `(function(){
  function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+= (p.x||0); y+=(p.y||0); } return {x:x,y:y}; }
  var mc=null;
  try{ mc = toppanel.mbar.monthController; }catch(e){}
  if(!mc){ return {err:'no monthController'}; }
  var subs = mc.subviews;
  // 3 calButtons: [leftArrow, spacer(clickable=false), rightArrow]; pick the rightmost clickable
  var arrow=null;
  for(var i=subs.length-1;i>=0;i--){ if(subs[i] && subs[i].clickable!==false){ arrow=subs[i]; break; } }
  if(!arrow) arrow=subs[subs.length-1];
  var a=abs(arrow);
  var title=''; try{ title = toppanel.mbar.monthtitle.text; }catch(e){}
  return { x:a.x, y:a.y, w:(arrow.width||0), h:(arrow.height||0), title:title };
})()`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/int-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

async function settle(p){
  let prev=null;
  for (let i=0;i<60;i++){ const buf = await p.screenshot({ type:"png" });
    if (prev && Buffer.compare(prev, buf)===0){ return buf; }
    prev=buf; await sleep(120); }
  return prev;
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});

// wait for logical view tree
for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null);
  if (m!=null) break; await sleep(50); }
const beforeBuf = await settle(p);
fs.writeFileSync(outBefore, beforeBuf);

const probe = await p.evaluate(PROBE).catch((e)=>({err:String(e)}));
if (probe.err){ console.log("PROBE ERROR: "+probe.err); await b.close(); process.exit(2); }
const cx = Math.round(probe.x + probe.w/2);
const cy = Math.round(probe.y + probe.h/2);

// dispatch the SAME real mouse click at the arrow centre (page coords == canvas-local here,
// appcontainer is at 0,0). puppeteer synthesises move->down->up->click.
await p.mouse.move(cx, cy);
await sleep(30);
await p.mouse.click(cx, cy);

const afterBuf = await settle(p);
fs.writeFileSync(outAfter, afterBuf);
const titleAfter = await p.evaluate(()=>{ try{ return toppanel.mbar.monthtitle.text; }catch(e){ return '?'; } }).catch(()=>'?');

await b.close();
console.log(JSON.stringify({ target:{x:cx,y:cy,w:probe.w,h:probe.h}, titleBefore:probe.title, titleAfter:titleAfter, outBefore, outAfter }));
