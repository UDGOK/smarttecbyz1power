import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.QA_BASE||process.argv[2]||'http://127.0.0.1:4337';
const out=process.env.QA_OUTPUT||'tmp/investor-v61-public-audit';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.QA_BROWSER||'chrome',headless:true});
const results=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  for(const route of ['/','/site','/power','/colocation','/compute','/model-planner','/news','/about','/contact','/brand','/investors/login']){
   const page=await context.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push({url:r.url(),status:r.status()});});
   const response=await page.goto(base+route,{waitUntil:'networkidle',timeout:60000});
   await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,85));}});
   await page.waitForTimeout(500);
   const state=await page.evaluate(()=>({title:document.title,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth,
    brokenImages:[...document.images].filter(i=>i.currentSrc&&i.complete&&!i.naturalWidth).map(i=>i.currentSrc),
    images:document.images.length,placeholder:/\[PLACEHOLDER:|TODO:|Lorem ipsum/i.test(document.body.innerText),
    entryPending:document.body.hasAttribute('data-entry-pending')}));
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${width}-${route.slice(1).replaceAll('/','-')||'home'}.png`});
   const item={width,route,status:response.status(),errors,failed,...state};results.push(item);console.log(JSON.stringify(item));await page.close();
  }
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:950}}),page=await context.newPage();
 const start=Date.now();await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.body.hasAttribute('data-entry-pending'),{},{timeout:15000});
 console.log(JSON.stringify({automaticEntryMs:Date.now()-start}));
 await page.screenshot({path:`${out}/normal-home.png`});await context.close();
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify({base,results},null,2));}
if(results.some(r=>r.status!==200||r.errors.length||r.failed.length||r.overflow||r.brokenImages.length||r.placeholder||r.entryPending))process.exitCode=1;
