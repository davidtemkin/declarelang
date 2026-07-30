import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [origin,prog,mode,out]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:CHROME,headless:true,args:["--no-sandbox"],
  defaultViewport:{width:1280,height:800,deviceScaleFactor:2}});
const p=await b.newPage();
await p.goto(`${origin}${prog}?render=${mode}`,{waitUntil:"networkidle0"});
await new Promise(r=>setTimeout(r,3000));
await p.screenshot({path:out}); await b.close();
