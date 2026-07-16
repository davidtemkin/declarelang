// capture.mjs — screenshot an OpenLaszlo app ONLY when it is fully built, data-loaded,
// painted and SETTLED ("ready for input") — never after a blind timer.
//
//   node capture.mjs <url> <width> <height> <out.png> [terminalMark]
//
// Readiness (shares timeline.mjs's hook): record the app's window.__olmark() lifecycle marks,
// and poll canvas.isinited → mark 'canvas-init' (logical view tree finalized). Then a STABILITY
// LOOP captures until two consecutive frames are byte-identical — which absorbs intro animation
// and late paints, so the written frame is the first fully-settled one. (A running framerate
// timer never lets the thread go quiet, so we key off frame-stability, not silence — same
// reasoning as timeline.mjs's ready-for-input.)
//
// Uses the pinned Chrome-for-Testing + puppeteer-core (read from the openlaszlo-5.0 apparatus,
// never written) so captures are reproducible and consistent with the benchmark timeline.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, out, terminalMark] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6]];
// HiDPI capture: CAP_DPR=2 forces deviceScaleFactor 2 (Retina). DEFAULT 1 keeps the
// deterministic dpr=1 path used by all existing parity captures. The resulting PNG is
// W*DPR x H*DPR; compare two same-DPR captures with `compare -metric AE` as usual.
const DPR = +(process.env.CAP_DPR || 1) || 1;

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now();
    try{performance.mark('OL:'+n);}catch(e){} } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/cap-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});

// 1) logical view tree finalized
let ciMs = null;
for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null);
  if (m!=null){ ciMs=m; break; } await sleep(50); }
// 2) optional app terminal lifecycle mark (e.g. dashboard-shown / events-hydrated)
let tmMs = null;
if (terminalMark){ for (let i=0;i<200;i++){ const m=await p.evaluate(n=>window.__olmarks&&window.__olmarks[n], terminalMark).catch(()=>null);
  if (m!=null){ tmMs=m; break; } await sleep(50); } }

// 3) settle: capture until two consecutive frames are byte-identical PNGs (intro animation /
//    late paints absorbed). The first stable frame is written.
let prev=null, stableAt=-1, shots=0;
for (let i=0;i<60;i++){ const buf = await p.screenshot({ type:"png" }); shots++;
  if (prev && Buffer.compare(prev, buf)===0){ stableAt=i; fs.writeFileSync(out, buf); break; }
  prev=buf; await sleep(120); }
if (stableAt<0) fs.writeFileSync(out, prev);   // never settled (looping animation/timer) → last frame

const inited = await p.evaluate(()=> (typeof canvas!=='undefined'&&canvas&&!!canvas.isinited)).catch(()=>false);
await b.close();
console.log(`${out} ${W}x${H}@${DPR}x | canvas-init ${ciMs!=null?ciMs.toFixed(0)+'ms':'NEVER'}${terminalMark?` | ${terminalMark} ${tmMs!=null?tmMs.toFixed(0)+'ms':'NEVER'}`:''} | ${stableAt>=0?`SETTLED after ${shots} frames`:`UNSETTLED after ${shots} frames`} | inited=${inited}`);
