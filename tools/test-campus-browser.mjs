// Run after a production build is served. No investor credentials or private APIs.
// BASE_URL=http://127.0.0.1:4337 node tools/test-campus-browser.mjs
// CHROME_PATH overrides the executable; QA_BROWSER defaults to local Chrome.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {headerSignature} from './header-contract.mjs';

const base=(process.env.BASE_URL||process.argv[2]||'http://127.0.0.1:4337').replace(/\/$/,'');
const route='/site/campus',asset='/assets/campus/2026-09';
const scene=JSON.parse(await readFile(new URL('../src/smarttec-campus/scene.json',import.meta.url),'utf8'));
const views=Object.keys(scene.views).sort(),timeout=Number(process.env.CAMPUS_TIMEOUT_MS)||60000;
const failures=[],reports=[];
const browser=await chromium.launch({
 ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:process.env.QA_BROWSER||'chrome'}),
 headless:process.env.HEADED!=='1',ignoreDefaultArgs:['--disable-back-forward-cache']
});

// Test-only observations of actual GPU work. No production globals are required.
function installProbe(){
 const probe=window.__campusQA={draws:0,uploads:0,persistedShows:0,canvases:[],failNextDraw:false,thrownDraws:0},records=new WeakMap();
 addEventListener('pageshow',event=>{if(event.persisted)probe.persistedShows++;});
 for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
  if(!Type)continue;
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','texImage2D','texSubImage2D','texImage3D','texSubImage3D','compressedTexImage2D','compressedTexSubImage2D','compressedTexImage3D','compressedTexSubImage3D']){
   const original=Type.prototype[name];if(typeof original!=='function')continue;
   const textureUpload=name.includes('Image');
   Type.prototype[name]=function(...args){
    const host=this.canvas?.closest?.('#canvas');
    if(host){
     if(!host.hidden&&!textureUpload&&probe.failNextDraw){probe.failNextDraw=false;probe.thrownDraws++;throw new Error('Intentional QA render exception');}
     let record=records.get(this.canvas);if(!record){record={canvas:this.canvas,draws:0,visibleDraws:0,uploads:0};records.set(this.canvas,record);probe.canvases.push(record);}
     // WebGL2 uploads decoded maps through texSubImage2D after texStorage2D.
     // Count data transfers during hidden prewarming too, but not null allocations.
     if(textureUpload){if(args.at(-1)!=null){probe.uploads++;record.uploads++;}}
     else{probe.draws++;record.draws++;if(!host.hidden)record.visibleDraws++;}
    }
    return original.apply(this,args);
   };
  }
 }
}
async function context(options={}){
 const ctx=await browser.newContext({viewport:{width:1360,height:950},deviceScaleFactor:1.5,...options});
 await ctx.addInitScript(installProbe);return ctx;
}
async function run(name,fn){
 const start=Date.now();
 try{const detail=await fn();reports.push({name,ok:true,ms:Date.now()-start,detail});console.log(`PASS ${name}${detail?' — '+JSON.stringify(detail):''}`);}
 catch(error){const detail=error.stack||String(error);failures.push({name,detail});reports.push({name,ok:false,ms:Date.now()-start,detail});console.error(`FAIL ${name}\n${detail}`);}
}
function observe(page){
 const requests=[],errors=[],bad=[];
 page.on('request',request=>requests.push(request.url()));
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)bad.push(`${response.status()} ${response.url()}`);});
 return {requests,errors,bad};
}
async function goto(page){
 const response=await page.goto(base+route,{waitUntil:'load',timeout:60000});assert.equal(response?.status(),200);
 await page.locator('#render').waitFor({state:'visible'});
 await page.waitForFunction(()=>{const image=document.querySelector('#render');return image?.complete&&image.naturalWidth>0;});
 return response;
}
async function modelReady(page){
 await page.locator('#stage').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{
  const host=document.querySelector('#canvas'),canvas=host?.querySelector('canvas');
  const visibleDraws=window.__campusQA.canvases.find(record=>record.canvas===canvas)?.visibleDraws||0;
  return host&&!host.hidden&&canvas?.width>0&&document.querySelector('#model-mode')?.getAttribute('aria-pressed')==='true'&&visibleDraws>0;
 },null,{timeout});
 await page.locator('#loading').waitFor({state:'hidden',timeout});
}
async function load3D(page){await page.locator('#model-mode').click();await modelReady(page);}
// HDR setup on a hidden canvas and rendering into a detached old canvas do not count.
const draws=page=>page.evaluate(()=>window.__campusQA.canvases.find(record=>record.canvas===document.querySelector('#canvas canvas'))?.visibleDraws||0);
async function changeInDraws(page,ms=450){const before=await draws(page);await page.waitForTimeout(ms);return (await draws(page))-before;}
const imageHash=async page=>createHash('sha256').update(await page.locator('#canvas canvas').screenshot({timeout:30000})).digest('hex');
async function pauseMotion(page){
 const motion=page.locator('#motion');if(await motion.isEnabled()&&await motion.getAttribute('aria-pressed')!=='true')await motion.click();
 await page.waitForTimeout(1200);
}
async function drag(page){
 await page.locator('#stage').scrollIntoViewIfNeeded();const box=await page.locator('#canvas canvas').boundingBox();assert.ok(box);
 await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.66,box.y+box.height*.54,{steps:8});await page.mouse.up();await page.waitForTimeout(1100);
}
async function assertClean(observed){assert.deepEqual(observed.errors,[],'no uncaught browser errors');assert.deepEqual(observed.bad,[],'no failed same-origin asset requests');}

try{
 await run('public first paint, shared header, and all 16 rendered views',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   const response=await goto(page);await page.waitForTimeout(900);
   const firstRequests=[...observed.requests];
   assert.ok(!firstRequests.some(url=>/\.(?:glb|hdr)(?:\.gz)?(?:\?|$)|\/_astro\/three(?:[.-]|\/)|meshopt_decoder/.test(url)),'3D engine, model and HDR stay behind user intent');
   assert.ok(!observed.requests.some(url=>url.includes('/api/investor/')),'public page never requests protected assets');
   const home=await page.request.get(base+'/');assert.equal(home.status(),200);
   assert.deepEqual(headerSignature(await response.text()),headerSignature(await home.text()));
   assert.equal(await page.locator('h1').count(),1);
   const ids=await page.locator('[id]').evaluateAll(elements=>elements.map(element=>element.id));assert.equal(new Set(ids).size,ids.length,'unique HTML IDs');
   assert.deepEqual(await page.locator('[data-view]').evaluateAll(buttons=>buttons.map(button=>button.dataset.view)),views);
   for(const key of views){
    await page.locator(`[data-view="${key}"]`).click();
    await page.waitForFunction(key=>{const image=document.querySelector('#render');return image?.complete&&image.naturalWidth>0&&image.currentSrc.includes('/'+key+'-');},key);
    assert.equal(await page.locator(`[data-view="${key}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
    const href=await page.locator('#full-image').getAttribute('href');assert.equal(href,`${asset}/renders/${key}-2400.webp`);
    const response=await page.request.head(base+href);assert.equal(response.status(),200);assert.match(response.headers()['content-type']||'',/image\/webp/);
   }
   assert.ok(!observed.requests.some(url=>/\.(?:glb|hdr)(?:\.gz)?(?:\?|$)/.test(url)),'render browsing does not silently start 3D');
   await assertClean(observed);return {views:views.length,initialRequests:firstRequests.length};
  }finally{await ctx.close();}
 });

 await run('decoded 3D materials, filters, cutaway, quality, lifecycle and motion',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   await goto(page);await load3D(page);
   assert.ok(observed.requests.some(url=>url.includes(`${asset}/campus.glb`)),'model loaded on request');
   assert.ok(observed.requests.some(url=>url.includes(`${asset}/environment-1k.hdr`)),'HDR requested');
   assert.ok((await page.evaluate(()=>window.__campusQA.uploads))>=4,'decoded textures uploaded to WebGL');
   assert.match(await page.locator('#overlay-note').innerText(),/HDR/i,'lighting actually loaded, not just requested');
   for(const system of ['cooling','power','fiber','all']){
    await page.locator(`[data-system="${system}"]`).click();await modelReady(page);
    assert.equal(await page.locator(`[data-system="${system}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-system][aria-pressed="true"]').count(),1);
    const selected=await page.locator('[data-flow][data-selected="true"]').count();assert.equal(selected,system==='all'?3:1);
    assert.equal(await page.locator('.flow-legend').isVisible(),true);
   }
   await page.locator('[data-system="cooling"]').click();await modelReady(page);await pauseMotion(page);
   const cutBefore=await imageHash(page),pressed=await page.locator('#cutaway').getAttribute('aria-pressed');
   await page.locator('#cutaway').click();await page.waitForTimeout(350);
   assert.notEqual(await page.locator('#cutaway').getAttribute('aria-pressed'),pressed);
   assert.notEqual(await imageHash(page),cutBefore,'shell toggle changes rendered geometry');
   await page.locator('#stop-tracing').click();await page.locator('[data-appearance="system"]').click();await page.waitForTimeout(350);
   const systemImage=await imageHash(page);await page.locator('[data-appearance="photoreal"]').click();await page.waitForTimeout(350);
   assert.notEqual(await imageHash(page),systemImage,'system appearance changes the actual rendering');
   const balanced=await page.locator('#canvas canvas').evaluate(canvas=>canvas.width);
   await page.locator('#quality').selectOption('high');
   await page.waitForFunction(width=>document.querySelector('#canvas canvas').width>width,balanced,{timeout:30000});
   assert.match(await page.locator('#quality-note').innerText(),/^High/);
   await page.locator('#quality').selectOption('balanced');
   await page.waitForFunction(width=>document.querySelector('#canvas canvas').width===width,balanced);

   await page.locator('[data-system="cooling"]').click();await modelReady(page);
   if(await page.locator('#motion').getAttribute('aria-pressed')==='true')await page.locator('#motion').click();
   assert.ok(await changeInDraws(page)>0,'visible flow animation draws frames');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(1300);
   assert.equal(await page.locator('#motion').isDisabled(),true);
   assert.equal(await page.locator('#motion').getAttribute('aria-pressed'),'true');
   assert.equal(await changeInDraws(page),0,'dynamic reduced motion stops continuing GPU work');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.waitForFunction(()=>!document.querySelector('#motion').disabled);
   if(await page.locator('#motion').getAttribute('aria-pressed')==='true')await page.locator('#motion').click();
   await page.locator('#stage').scrollIntoViewIfNeeded();assert.ok(await changeInDraws(page)>0);
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(400);
   const offscreen=await page.locator('#stage').evaluate(element=>{const r=element.getBoundingClientRect();return r.bottom<=0||r.top>=innerHeight;});assert.ok(offscreen,'test moves the stage fully offscreen');
   assert.equal(await changeInDraws(page),0,'offscreen flow does not keep rendering');
   await page.locator('#stage').scrollIntoViewIfNeeded();await page.waitForTimeout(150);assert.ok(await changeInDraws(page)>0,'flow resumes when visible');

   // Exercise persisted lifecycle even if this browser declines a real bfcache entry.
   await pauseMotion(page);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   if(await page.locator('#canvas').isHidden())await load3D(page);else await modelReady(page);
   const beforeDrag=await imageHash(page);await drag(page);assert.notEqual(await imageHash(page),beforeDrag,'controls work after persisted page lifecycle');
   await page.locator('.campus-breadcrumb a[href="/site"]').click();await page.waitForURL(base+'/site');
   await page.goBack({waitUntil:'commit'});await page.waitForURL(base+route,{waitUntil:'commit'});
   if(await page.locator('#canvas').isHidden())await load3D(page);else await modelReady(page);
   await pauseMotion(page);const beforeBackDrag=await imageHash(page);await drag(page);
   assert.notEqual(await imageHash(page),beforeBackDrag,'real back navigation restores usable controls');
   const backCache=await page.evaluate(()=>window.__campusQA.persistedShows);
   const modelRequestsBeforeLoss=observed.requests.filter(url=>url.includes(`${asset}/campus.glb`)).length;
   const lost=await page.locator('#canvas canvas').evaluate(canvas=>{window.__campusQA.lostCanvas=canvas;const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
   assert.ok(lost,'Chrome exposes the context-loss test extension');await page.locator('#render').waitFor({state:'visible'});
   assert.equal(await page.locator('#canvas').isHidden(),true,'context loss falls back to a real render');
   await page.locator('[data-view="13-hero-arrival"]').click();await page.waitForFunction(()=>{const image=document.querySelector('#render');return image.complete&&image.naturalWidth>0;});
   await page.waitForFunction(()=>!document.querySelector('#model-mode').disabled);
   assert.match(await page.locator('#model-mode').innerText(),/restart\s+3d/i,'context loss offers in-page recovery');
   await load3D(page);
   assert.equal(await page.evaluate(()=>document.querySelector('#canvas canvas')!==window.__campusQA.lostCanvas),true,'restart creates a fresh canvas');
   assert.equal(observed.requests.filter(url=>url.includes(`${asset}/campus.glb`)).length,modelRequestsBeforeLoss,'restart reuses the successfully downloaded model');
   await pauseMotion(page);const restartImage=await imageHash(page);
   await page.locator('[data-view="14-datahall-interior"]').click();await modelReady(page);await page.waitForTimeout(1100);
   assert.notEqual(await imageHash(page),restartImage,'restarted renderer responds to camera selection');
   await page.locator('#image-mode').click();assert.equal(await page.locator('#render').isVisible(),true);
   await load3D(page);await pauseMotion(page);const restartDraws=await draws(page);await drag(page);
   assert.ok(await draws(page)>restartDraws,'new active canvas draws after mode switches and orbit input');
   await assertClean(observed);return {textureUploads:await page.evaluate(()=>window.__campusQA.uploads),persistedShows:backCache};
  }finally{await ctx.close();}
 });

 await run('High selected during a failed load retries into a working new renderer',async()=>{
  const ctx=await context(),page=await ctx.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));let attempts=0,rejectModel=true,releaseFailure,firstRequest;
  const requestSeen=new Promise(resolve=>{firstRequest=resolve;}),failureGate=new Promise(resolve=>{releaseFailure=resolve;});
  // Hold the first attempt while High is selected, then fail both gzip/plain paths.
  await page.route('**/assets/campus/**/campus.glb*',async request=>{attempts++;if(rejectModel){firstRequest();await failureGate;await request.fulfill({status:503,contentType:'text/plain',body:'Intentional QA model failure'});}else await request.continue();});
  try{
   await goto(page);await page.locator('#model-mode').click();
   await Promise.race([requestSeen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Model request did not start')),30000))]);
   await page.evaluate(()=>{window.__campusQA.failedCanvas=document.querySelector('#canvas canvas');});
   await page.locator('#quality').selectOption('high');await page.waitForTimeout(1200);releaseFailure();
   await page.waitForFunction(()=>{const status=document.querySelector('#status')?.textContent||'';return /could not|unavailable|retry/i.test(status)&&!document.querySelector('#model-mode').disabled;},null,{timeout});
   assert.equal(await page.locator('#render').isVisible(),true);assert.equal(await page.locator('#canvas').isHidden(),true);
   await page.locator('[data-view="14-datahall-interior"]').click();
   await page.waitForFunction(()=>{const image=document.querySelector('#render');return image.complete&&image.naturalWidth>0&&image.currentSrc.includes('14-datahall-interior');});
   rejectModel=false;const beforeRetry=attempts;
   await load3D(page);assert.ok(attempts>beforeRetry,'retry fetched a new model');assert.deepEqual(errors,[]);
   assert.equal(await page.locator('#quality').inputValue(),'high','latest quality choice survives the failed attempt');
   assert.equal(await page.evaluate(()=>document.querySelector('#canvas canvas')!==window.__campusQA.failedCanvas),true,'failed renderer is replaced');
   await pauseMotion(page);const highImage=await imageHash(page),beforeView=await draws(page);
   await page.locator('[data-view="03-compute-cooling"]').click();await modelReady(page);await page.waitForTimeout(1100);
   assert.ok(await draws(page)>beforeView,'High renders into the current canvas after retry');
   assert.notEqual(await imageHash(page),highImage,'High camera changes affect visible pixels');
   await page.locator('#quality').selectOption('balanced');await page.locator('#quality').selectOption('high');
   await pauseMotion(page);const beforeDrag=await draws(page);await drag(page);assert.ok(await draws(page)>beforeDrag);
   assert.deepEqual(errors,[],'retry and subsequent quality changes have no uncaught errors');
  }finally{releaseFailure();await ctx.close();}
 });

 await run('rapid controls settle on the latest view, mode and quality',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   await goto(page);await load3D(page);
   await page.evaluate(()=>{
    const click=selector=>document.querySelector(selector).click();
    const quality=value=>{const select=document.querySelector('#quality');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};
    click('[data-view="14-datahall-interior"]');click('[data-system="power"]');quality('high');
    click('[data-view="16-manufacturing-interior"]');click('[data-system="fiber"]');quality('balanced');
    click('[data-appearance="system"]');quality('high');click('[data-system="cooling"]');quality('balanced');
    click('[data-appearance="photoreal"]');
   });
   await modelReady(page);await page.waitForTimeout(1200);
   assert.equal(await page.locator('[data-view="10-rack-liquid-cooling"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-system="cooling"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-system][aria-pressed="true"]').count(),1);
   assert.equal(await page.locator('#quality').inputValue(),'balanced');
   assert.equal(await page.locator('[data-appearance="photoreal"]').getAttribute('aria-pressed'),'true');
   await pauseMotion(page);const before=await imageHash(page);await drag(page);assert.notEqual(await imageHash(page),before);
   await page.evaluate(()=>{
    const quality=document.querySelector('#quality');quality.value='high';quality.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#image-mode').click();document.querySelector('[data-view="16-manufacturing-interior"]').click();
    document.querySelector('#model-mode').click();document.querySelector('#image-mode').click();
    document.querySelector('[data-view="13-hero-arrival"]').click();
   });
   await page.waitForTimeout(1500);
   assert.equal(await page.locator('#render').isVisible(),true,'late quality work does not steal image mode');
   assert.equal(await page.locator('#canvas').isHidden(),true);
   assert.equal(await page.locator('[data-view="13-hero-arrival"]').getAttribute('aria-pressed'),'true');
   assert.equal(await changeInDraws(page),0,'image mode does not continue GPU rendering');
   await load3D(page);await pauseMotion(page);const count=await draws(page);await drag(page);assert.ok(await draws(page)>count);
   await assertClean(observed);
  }finally{await ctx.close();}
 });

 await run('one-time render exception recovers through Restart 3D without refresh',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   await goto(page);await load3D(page);await pauseMotion(page);
   await page.evaluate(()=>{window.__campusQA.failedDrawCanvas=document.querySelector('#canvas canvas');window.__campusQA.failNextDraw=true;});
   await page.locator('#reset').click();
   await page.locator('#render').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.__campusQA.thrownDraws),1,'exception was injected into an active render');
   assert.equal(await page.locator('#canvas').isHidden(),true);
   assert.equal(await page.locator('#model-mode').isEnabled(),true);
   assert.match(await page.locator('#model-mode').innerText(),/restart\s+3d/i);
   assert.match(await page.locator('#status').innerText(),/rendering.*interrupted/i,'failure is explained in the page');
   await load3D(page);await pauseMotion(page);
   assert.equal(await page.evaluate(()=>document.querySelector('#canvas canvas')!==window.__campusQA.failedDrawCanvas),true,'restart replaces the renderer that threw');
   const before=await draws(page),picture=await imageHash(page);await drag(page);
   assert.ok(await draws(page)>before,'replacement renderer handles new input');assert.notEqual(await imageHash(page),picture);
   assert.equal(await page.evaluate(()=>window.__campusQA.thrownDraws),1,'fault injection fires only once');
   await assertClean(observed);
  }finally{await ctx.close();}
 });

 await run('mobile layout and initial reduced-motion 3D remain usable',async()=>{
  const ctx=await context({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await ctx.newPage(),observed=observe(page);
  try{
   await goto(page);
   const overflow=()=>page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   let size=await overflow();assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
   await page.locator('[data-view="16-manufacturing-interior"]').click();
   await page.waitForFunction(()=>{const image=document.querySelector('#render');return image.complete&&image.naturalWidth>0&&image.currentSrc.includes('16-manufacturing-interior');});
   await load3D(page);await page.locator('[data-system="fiber"]').click();await modelReady(page);await page.waitForTimeout(1200);
   assert.equal(await page.locator('#motion').isDisabled(),true);assert.equal(await changeInDraws(page),0);
   size=await overflow();assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
   assert.ok((await page.locator('#canvas canvas').boundingBox()).width>250,'mobile canvas has useful width');
   await page.locator('#image-mode').click();assert.equal(await page.locator('#render').isVisible(),true);
   await assertClean(observed);return size;
  }finally{await ctx.close();}
 });
}finally{await browser.close();}
console.log(JSON.stringify({base,checks:reports.length,failures:failures.length,results:reports},null,2));
if(failures.length)process.exitCode=1;
