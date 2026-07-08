// dialog.mjs — ADD-EVENT DIALOG parity probe.
//
//   node dialog.mjs <url> <W> <H> <out-before.png> <out-after.png> [type-string]
//
// Loads the calendar, waits until built+settled, clicks the "Add Event" button (found
// in the live view tree), waits for the slide-in animation to settle, screenshots the
// open dialog. If a [type-string] is given, it then focuses the title inputtext via a
// real click and types the string (real keyboard events), settles, and re-screenshots
// to out-after (the BEFORE shot is the just-opened dialog).
//
// Prints JSON: the Add-Event button rect, the title field rect, and the field value.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, outBefore, outAfter, typeStr] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6], process.argv[7]];

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

// absolute canvas-local rect of a view (sum x/y up to canvas)
const ABSFN = `function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+=(p.x||0); y+=(p.y||0); } return {x:x,y:y}; }`;

// find the Add Event button rect
const PROBE_BTN = `(function(){
  ${ABSFN}
  var mbar=null; try{ mbar = toppanel.mbar; }catch(e){}
  if(!mbar){ return {err:'no mbar'}; }
  // the Add Event calButton is the mbar child whose label=='Add Event'
  var btn=null;
  function walk(v){ if(!v) return; if(v.label==='Add Event'){ btn=v; return; } var s=v.subviews; if(s) for(var i=0;i<s.length;i++) walk(s[i]); }
  walk(mbar);
  if(!btn){ return {err:'no Add Event button'}; }
  var a=abs(btn);
  return { x:a.x, y:a.y, w:(btn.width||0), h:(btn.height||0) };
})()`;

// find the infopanel title inputtext field rect + value
const PROBE_FIELD = `(function(){
  ${ABSFN}
  var f=null; try{ f = infopanel.summary.content.title; }catch(e){}
  if(!f){ return {err:'no title field'}; }
  var a=abs(f);
  var val=''; try{ val=f.getText(); }catch(e){}
  var px=602; try{ px=infopanel.x; }catch(e){}
  return { x:a.x, y:a.y, w:(f.width||0), h:(f.height||0), value:val, panelx:px, opened:(infopanel.opened===true) };
})()`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/dlg-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor=1","--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

async function settle(p, maxIters){
  let prev=null;
  for (let i=0;i<(maxIters||60);i++){ const buf = await p.screenshot({ type:"png" });
    if (prev && Buffer.compare(prev, buf)===0){ return buf; }
    prev=buf; await sleep(120); }
  return prev;
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:1 });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});

for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null);
  if (m!=null) break; await sleep(50); }
await settle(p);

const btn = await p.evaluate(PROBE_BTN).catch((e)=>({err:String(e)}));
if (btn.err){ console.log("BTN PROBE ERROR: "+btn.err); await b.close(); process.exit(2); }
const bx = Math.round(btn.x + btn.w/2), by = Math.round(btn.y + btn.h/2);

// click Add Event
await p.mouse.move(bx, by); await sleep(30);
await p.mouse.click(bx, by);

// wait for the slide-in animation to COMPLETE (infopanel.x settles to 602, opacity 1).
// Pixel-settle alone is defeated by the blinking DOM caret in the focused field.
for (let i=0;i<80;i++){
  const st = await p.evaluate(()=>{ try{ return {x:infopanel.x, op:infopanel.opacity, opened:infopanel.opened}; }catch(e){ return null; } });
  if (st && st.opened && Math.abs(st.x-602)<0.5 && st.op>=0.999) break;
  await sleep(80);
}
// neutralize hover state: park the mouse at the same neutral point on both runtimes
// (else the Add-Event button is left in its over-state on one side only).
await p.mouse.move(10, 300);
await sleep(250);
const openBuf = await p.screenshot({ type:"png" });
fs.writeFileSync(outBefore, openBuf);

const field = await p.evaluate(PROBE_FIELD).catch((e)=>({err:String(e)}));

let typed = null;
if (typeStr && !field.err){
  // click the REAL DOM <input> rect (both runtimes overlay a DOM input for the field)
  const ir = await p.evaluate(()=>{ try{
    var v = infopanel.summary.content.title; var sp = v.isprite || v.sprite;
    var r = sp.__LzInputDiv.getBoundingClientRect();
    return { x:r.left, y:r.top, w:r.width, h:r.height };
  }catch(e){ return null; } });
  const fx = Math.round((ir?ir.x:field.x) + Math.min(ir?ir.w:40,40)/2), fy = Math.round((ir?ir.y:field.y) + (ir?ir.h:field.h)/2);
  await p.mouse.move(fx, fy); await sleep(30);
  await p.mouse.click(fx, fy);
  await sleep(120);
  // clear then type
  await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control');
  await p.keyboard.press('Backspace');
  for (const ch of typeStr){ await p.keyboard.type(ch); await sleep(20); }
  await sleep(120);
  const afterBuf = await settle(p, 30);
  fs.writeFileSync(outAfter, afterBuf);
  typed = await p.evaluate(PROBE_FIELD).catch((e)=>({err:String(e)}));
} else {
  fs.writeFileSync(outAfter, openBuf);
}

await b.close();
console.log(JSON.stringify({ button:{x:bx,y:by,w:btn.w,h:btn.h}, field, typed, typeStr:typeStr||null }, null, 0));
