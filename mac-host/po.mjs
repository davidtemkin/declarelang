import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b=await puppeteer.launch({executablePath:CHROME,headless:true,args:["--no-sandbox"],
  defaultViewport:{width:1280,height:800,deviceScaleFactor:2}});
const p=await b.newPage();
await p.goto(process.argv[2]+"/test/probe/blur.declare?render=dom",{waitUntil:"networkidle0"});
await new Promise(r=>setTimeout(r,2500));
console.log(await p.evaluate(()=>{
  const root=document.querySelector("[data-declare-app]");
  const out=[];
  let el=root;
  while(el && el!==document.body){
    const cs=getComputedStyle(el);
    out.push(`${el.tagName}${el.dataset.declareApp!==undefined?"[app-root]":""} overflow=${cs.overflow} clipPath=${cs.clipPath!=="none"} size=${el.clientWidth}x${el.clientHeight}`);
    el=el.parentElement;
  }
  // and the draw canvas itself
  const c=root.querySelector("canvas");
  const cc=c?getComputedStyle(c):null;
  out.push(`drawEl: ${c?`${c.width}x${c.height}dev at left=${cc.left} top=${cc.top}`:"none"}`);
  return out.join("\n");
}));
await b.close();
