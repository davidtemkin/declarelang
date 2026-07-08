// inputleak.mjs — demonstrate the input-overlay Z-ORDER LEAK (and its fix).
//
//   node inputleak.mjs <url> <W> <H> <out.png>
//
// Loads a component-sampler-style app, waits until built+settled, then MOVES the draggable
// "Frosty" window (id=fw) UP so it covers the two <edittext> fields, settles, and screenshots.
// BEFORE the kernel change the fields are DOM overlays that float ABOVE the canvas-drawn window
// (their text leaks on top of the window chrome); AFTER, they are static canvas text the window
// correctly occludes.  Prints the field + window rects it found.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, W, H, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const DPR = +(process.env.CAP_DPR || 1) || 1;

const HOOK = `(function(){ window.__olmarks={}; window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); } };
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){ window.__olmark('canvas-init'); clearInterval(iv);} }catch(e){} },2); })();`;

// find every LzInputText field (walk the view tree) + the fw window; move the window to cover
// the fields, and report absolute rects.
const MOVE = `(function(){
  function abs(v){ var x=0,y=0; for(var p=v; p && p!==canvas; p=p.parent){ x+=(p.x||0); y+=(p.y||0);} return {x:x,y:y}; }
  var fields=[];
  function walk(v){ if(!v) return;
    var isInput=false; try{ isInput = (v.isprite && lz.__LzInputTextSprite && v.isprite instanceof lz.__LzInputTextSprite); }catch(e){}
    if(isInput){ var a=abs(v); fields.push({x:a.x,y:a.y,w:v.width||0,h:v.height||0,text:(v.getText?v.getText():'')}); }
    var s=v.subviews; if(s) for(var i=0;i<s.length;i++) walk(s[i]);
  }
  walk(canvas);
  var w=null; try{ w=fw; }catch(e){}
  var wrect=null;
  if(w){
    // cover the field cluster: move the window over the two edittext fields (top-right).
    var tgt = fields.filter(function(f){ return f.text==='text entry here' || f.text==='disabled'; });
    var minx=1e9,miny=1e9; for(var i=0;i<tgt.length;i++){ minx=Math.min(minx,tgt[i].x); miny=Math.min(miny,tgt[i].y); }
    if(tgt.length){ w.setAttribute('x', (w.x||0) + (minx-8) - abs(w).x); w.setAttribute('y', (w.y||0) + (miny-8) - abs(w).y); }
    w.bringToFront && w.bringToFront();
    var wa=abs(w); wrect={x:wa.x,y:wa.y,w:w.width||0,h:w.height||0};
  }
  return { fields: fields, window: wrect };
})()`;

async function launch(){ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath:CHROME,
  headless:"new", userDataDir:"/tmp/leak-"+Date.now()+"-"+i,
  args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size="+W+","+H] }); }
  catch(e){ await sleep(1200); } } throw new Error("chrome launch failed x8"); }

async function settle(p){ let prev=null; for (let i=0;i<60;i++){ const buf = await p.screenshot({ type:"png" });
  if (prev && Buffer.compare(prev, buf)===0){ return buf; } prev=buf; await sleep(120); } return prev; }

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width:W, height:H, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});
for (let i=0;i<300;i++){ const m = await p.evaluate(()=>window.__olmarks&&window.__olmarks['canvas-init']).catch(()=>null); if (m!=null) break; await sleep(50); }
await settle(p);
const info = await p.evaluate(MOVE).catch((e)=>({err:String(e)}));
await sleep(200);
const buf = await settle(p);
fs.writeFileSync(out, buf);
await b.close();
console.log(JSON.stringify(info));
