// Run against a served production build, without credentials or private APIs.
// BASE_URL=http://127.0.0.1:4340 node tools/test-campus-entry-browser.mjs
// CHROME_PATH or QA_BROWSER can select another installed Chromium browser.
// CAMPUS_ENTRY_CASE matches part of a group name for a focused regression run.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=(process.env.BASE_URL||process.argv[2]||'http://127.0.0.1:4340').replace(/\/$/,'');
const asset='/assets/campus/2026-09/renders/';
const views=['13-hero-arrival','01-campus-aerial','14-datahall-interior','16-manufacturing-interior'];
const stages=['land','wait','power','machine','campus'];
const timeout=Number(process.env.CAMPUS_TIMEOUT_MS)||45000;
const failures=[],reports=[];
const browser=await chromium.launch({
 ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:process.env.QA_BROWSER||'chrome'}),
 headless:process.env.HEADED!=='1',ignoreDefaultArgs:['--disable-back-forward-cache']
});

function installProbe(){
 const probe=window.__campusEntryQA={draws:0,frames:0,persistedShows:0};
 addEventListener('pageshow',event=>{if(event.persisted)probe.persistedShows++;});
 for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
  if(!Type)continue;
  for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
   const original=Type.prototype[method];if(typeof original!=='function')continue;
   Type.prototype[method]=function(...args){
    if(this.canvas?.id==='experience-canvas')probe.draws++;
    return original.apply(this,args);
   };
  }
 }
}
async function context(options={}){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,...options});
 await ctx.addInitScript(installProbe);return ctx;
}
function observe(page){
 const requests=[],errors=[],bad=[];
 page.on('request',request=>requests.push(request.url()));
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)bad.push(`${response.status()} ${response.url()}`);});
 return {requests,errors,bad};
}
function assertLightweight(observed,{content=false}={}){
 assert.deepEqual(observed.requests.filter(url=>/\.(?:glb|hdr)(?:\.gz)?(?:\?|$)|meshopt_decoder|\/_astro\/viewer\./.test(url)),[],
  'render entry points never request the full campus model, environment, decoder, or viewer');
 assert.deepEqual(observed.requests.filter(url=>/\/_astro\/stage-campus\.[^/]+\.js(?:\?|$)/.test(url)),[],
  'the old procedural campus stage stays unloaded');
 assert.ok(!observed.requests.some(url=>url.includes('/api/investor/')),'public browsing never requests protected assets');
 if(content)assert.ok(!observed.requests.some(url=>/\/_astro\/(?:three|renderer|stage-)[^/]*\.js/.test(url)),
  'static campus content pages do not start a WebGL scene');
}
function assertClean(observed){
 assert.deepEqual(observed.errors,[],'no uncaught browser errors');
 assert.deepEqual(observed.bad,[],'no failed same-origin HTTP responses');
}
async function run(name,fn){
 if(process.env.CAMPUS_ENTRY_CASE&&!name.includes(process.env.CAMPUS_ENTRY_CASE))return;
 const start=Date.now();
 try{const detail=await fn();reports.push({name,ok:true,ms:Date.now()-start,detail});console.log(`PASS ${name} — ${JSON.stringify(detail)}`);}
 catch(error){const detail=error.stack||String(error);failures.push({name,detail});reports.push({name,ok:false,ms:Date.now()-start,detail});console.error(`FAIL ${name}\n${detail}`);}
}
async function openHome(page){
 const response=await page.goto(base+'/',{waitUntil:'load',timeout});assert.equal(response?.status(),200);
 // Entry is automatic. Clicking Skip races its 80 ms reduced-motion handoff.
 await page.waitForFunction(()=>window.__experience?.currentStage&&!document.querySelector('#main')?.inert&&!document.body.hasAttribute('data-booting'),null,{timeout});
 await page.evaluate(()=>{
  window.__campusEntryUnsubscribe?.();
  window.__campusEntryUnsubscribe=window.__experience.onFrame(()=>window.__campusEntryQA.frames++);
 });
}
async function menuStage(page,index){
 if(!await page.locator('#site-menu').isVisible())await page.locator('#menu-toggle').click();
 await page.locator(`[data-menu-stage="${index}"]`).click();
 await page.waitForFunction(id=>window.__experience?.currentStage?.id===id,stages[index],{timeout});
 await page.locator('#site-menu').waitFor({state:'hidden',timeout});
 if(index===4){
  try{await page.locator('#campus-ui').waitFor({state:'visible',timeout:12000});}
  catch(error){
   const state=await page.evaluate(()=>{
    const describe=selector=>{const element=document.querySelector(selector);return element?{hidden:element.hidden,display:getComputedStyle(element).display,rect:element.getBoundingClientRect().toJSON()}:null;};
    return {panel:describe('[data-stage-panel][data-stage="campus"]'),visual:describe('#home-campus-visual'),ui:describe('#campus-ui'),after:describe('#after'),main:describe('#main'),stage:{id:window.__experience?.currentStage?.id,static:window.__experience?.currentStage?.static},body:{...document.body.dataset},scrollY,height:innerHeight,panels:[...document.querySelectorAll('[data-stage-panel]')].map(panel=>({stage:panel.dataset.stage,hidden:panel.hidden,rect:panel.getBoundingClientRect().toJSON()}))};
   });
   throw new Error(`${error.message}\nCampus entry state: ${JSON.stringify(state)}`,{cause:error});
  }
  await page.locator('#home-campus-visual').waitFor({state:'visible',timeout});
 }else{
  await page.locator('#campus-ui').waitFor({state:'hidden',timeout});
  await page.locator('#home-campus-visual').waitFor({state:'hidden',timeout});
 }
}
async function imageReady(page,key){
 await page.waitForFunction(key=>{
  const images=[...document.querySelectorAll('#home-campus-visual .home-campus-image.is-active')];
  return images.length===1&&images[0].complete&&images[0].naturalWidth>0&&images[0].currentSrc.includes('/'+key+'-1600.webp')&&
   document.querySelector(`[data-campus-view="${key}"]`)?.getAttribute('aria-pressed')==='true';
 },key,{timeout});
 assert.equal(await page.locator('[data-campus-view][aria-pressed="true"]').count(),1,'exactly one selected view');
 assert.doesNotMatch(await page.locator('#home-campus-status').innerText(),/loading|could not load/i);
}
async function selectView(page,key,{keyboard=false}={}){
 const button=page.locator(`[data-campus-view="${key}"]`);
 if(keyboard){await button.focus();await button.press('Enter');}else await button.click();
 await imageReady(page,key);
}
async function scrollBelowCampus(page){
 const start=await page.evaluate(()=>scrollY);
 await page.mouse.move(320,330);
 for(let i=0;i<5;i++){await page.mouse.wheel(0,700);await page.waitForTimeout(120);}
 await page.waitForFunction(start=>scrollY>start+300,start);
 const after=await page.locator('#after').evaluate(element=>({hidden:element.hidden,top:element.getBoundingClientRect().top,height:element.clientHeight,vh:innerHeight}));
 assert.equal(after.hidden,false,'services are released after the last chapter');
 assert.ok(after.top<after.vh&&after.top+after.height>0,'native wheel scrolling reaches the services below the campus');
 await page.locator('#campus-ui').waitFor({state:'hidden'});
 return await page.evaluate(start=>scrollY-start,start);
}
async function returnToCampusSlowly(page){
 // Enter only the first 40 px of the panel: below the gallery's 80 px threshold.
 // A zero-margin observer fires here, then misses the later visibility boundary.
 await page.evaluate(()=>{
  const panel=document.querySelector('[data-stage-panel][data-stage="campus"]');
  scrollTo({top:scrollY+panel.getBoundingClientRect().bottom-40,behavior:'instant'});
 });
 await page.waitForFunction(()=>Math.abs(document.querySelector('[data-stage-panel][data-stage="campus"]').getBoundingClientRect().bottom-40)<3);
 await page.waitForTimeout(180);
 assert.equal(await page.locator('#campus-ui').isVisible(),false,'the gallery stays hidden below its visibility boundary');
 await page.mouse.move(320,330);await page.mouse.wheel(0,-100);
 await page.waitForFunction(()=>document.querySelector('[data-stage-panel][data-stage="campus"]').getBoundingClientRect().bottom>=80);
 await page.locator('#campus-ui').waitFor({state:'visible',timeout:5000});
 await page.locator('#home-campus-visual').waitFor({state:'visible',timeout:5000});
 return await page.locator('[data-stage-panel][data-stage="campus"]').evaluate(panel=>panel.getBoundingClientRect().bottom);
}
async function noOverflow(page){
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(size.scroll<=size.width+1,`no horizontal overflow: ${JSON.stringify(size)}`);return size;
}

try{
 await run('campus content pages use approved renders and a real full-explorer link',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   for(const route of ['/site','/about','/contact']){
    const response=await page.goto(base+route,{waitUntil:'load',timeout});assert.equal(response?.status(),200);
    const fold=page.locator('details.page-scene-fold');
    if(await fold.count()&&!await fold.evaluate(element=>element.open))await fold.locator('summary').click();
    const figure=page.locator('.page-scene--campus');assert.equal(await figure.count(),1);
    await figure.scrollIntoViewIfNeeded();
    const img=figure.locator('.cinema__media img');
    await img.evaluate(image=>image.decode());
    assert.ok((await img.getAttribute('src')).startsWith(asset+'13-hero-arrival-'),'approved Blender arrival render');
    assert.equal(await page.locator('[data-page-scene], [data-scene-launch], .page-scene canvas').count(),0,'no old embedded campus viewer');
    const anchor=figure.locator('a[data-campus-launch], a.page-scene__campus-link');
    assert.equal(await anchor.getAttribute('href'),'/site/campus');assert.equal(await anchor.getAttribute('target'),null);
    const topic=figure.locator('.cinema__topics [data-cinema-select="1"]');await topic.click();
    assert.equal(await topic.getAttribute('aria-pressed'),'true','lightweight topic controls remain usable');
    await noOverflow(page);assertLightweight(observed,{content:true});
    await anchor.click();await page.waitForURL(base+'/site/campus',{timeout});
    await page.locator('#render').evaluate(image=>image.decode());
    assert.equal(await page.locator('#model-mode').getAttribute('aria-pressed'),'false','full explorer still opens in rendered-image mode');
    assertLightweight(observed,{content:true});
   }
   assertClean(observed);return {routes:3};
  }finally{await ctx.close();}
 });

 await run('home gallery is lazy, selectable, GPU-idle, and leaves/reenters through chapter navigation',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   await openHome(page);
   assert.equal(await page.locator('#home-campus-visual img[src]').count(),0,'gallery images load only when its chapter is entered');
   await menuStage(page,3);await page.waitForTimeout(600);
   assert.equal(await page.locator('#home-campus-visual img[src]').count(),0,'warming the next stage does not load gallery images');
   await menuStage(page,4);await imageReady(page,views[0]);
   assert.deepEqual(await page.locator('[data-campus-view]').evaluateAll(buttons=>buttons.map(button=>button.dataset.campusView)),views);
   assert.equal(await page.locator('[data-campus], #campus-hotspots, #campus-legend').count(),0,'legacy orbit and hotspot controls removed');
   assert.equal(await page.locator('.home-campus-open').getAttribute('href'),'/site/campus');
   for(const key of views)await selectView(page,key,{keyboard:key===views[2]});
   assert.equal(await page.evaluate(()=>window.__experience.currentStage.static),true,'last chapter is a static stage');
   await page.waitForTimeout(2200);
   const before=await page.evaluate(()=>({...window.__campusEntryQA}));await page.waitForTimeout(700);
   const after=await page.evaluate(()=>({...window.__campusEntryQA}));
   assert.equal(after.draws-before.draws,0,'static campus does no idle GPU drawing');
   assert.ok(after.frames>before.frames+3,'host navigation callbacks continue while rendering is idle');
   assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-virtual-scroll')),false,'final chapter restores native page scrolling');
   const scrollDistance=await scrollBelowCampus(page);
   await menuStage(page,3);
   assert.equal(await page.locator('#after').evaluate(element=>element.hidden),true);
   assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-virtual-scroll')),true,'earlier chapters regain virtual scrolling');
   const previous=await page.evaluate(()=>window.__campusEntryQA.draws);await page.waitForTimeout(700);
   assert.ok(await page.evaluate(()=>window.__campusEntryQA.draws)>previous,'rendering resumes on a dynamic chapter');
   await menuStage(page,4);await imageReady(page,views[3]);
   // Real upward overscroll must still retreat after the final stage went GPU-idle.
   await page.waitForTimeout(1600);await page.mouse.move(1000,320);
   for(let i=0;i<4;i++){await page.mouse.wheel(0,-600);await page.waitForTimeout(160);}
   await page.waitForFunction(()=>window.__experience?.currentStage?.id==='machine',null,{timeout});
   await page.locator('#campus-ui').waitFor({state:'hidden'});
   await menuStage(page,4);await imageReady(page,views[3]);
   assertLightweight(observed);assertClean(observed);return {views:views.length,idleDraws:after.draws-before.draws,liveCallbacks:after.frames-before.frames,scrollDistance};
  }finally{await ctx.close();}
 });

 await run('home image failure and a superseded load preserve usable view selection',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);let failed=0,delayed=0;
  try{
   await page.route('**'+asset+views[3]+'-1600.webp',async route=>{failed++;await route.abort('failed');});
   await openHome(page);await menuStage(page,4);await imageReady(page,views[0]);
   await page.locator(`[data-campus-view="${views[3]}"]`).click();
   await page.waitForFunction(()=>document.querySelector('#home-campus-status')?.textContent.includes('could not load'));
   assert.ok(failed>0,'the failure path was exercised');
   assert.ok((await page.locator('.home-campus-image.is-active').getAttribute('src')).includes(views[0]),'last decoded render remains visible');
   await selectView(page,views[2]);
   await page.route('**'+asset+views[1]+'-1600.webp',async route=>{
    delayed++;await new Promise(resolve=>setTimeout(resolve,1000));await route.continue().catch(()=>{});
   });
   await page.locator(`[data-campus-view="${views[1]}"]`).click();
   await page.waitForFunction(()=>document.querySelector('#home-campus-status')?.textContent.includes('Loading'));
   await selectView(page,views[0]);await page.waitForTimeout(1300);await imageReady(page,views[0]);
   assert.ok(delayed>0,'a competing pending image request was exercised');
   await menuStage(page,2);await menuStage(page,4);await imageReady(page,views[0]);
   assertLightweight(observed);assertClean(observed);return {failedRequests:failed,delayedRequests:delayed};
  }finally{await ctx.close();}
 });

 await run('mobile reduced-motion campus controls, menu, and native scrolling remain usable',async()=>{
  const ctx=await context({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await ctx.newPage(),observed=observe(page);
  try{
   await openHome(page);await menuStage(page,4);await imageReady(page,views[0]);
   const size=await noOverflow(page);
   const controls=await page.locator('[data-campus-view], .home-campus-open').evaluateAll(elements=>elements.map(element=>{
    const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:innerWidth,height:innerHeight};
   }));
   assert.ok(controls.every(rect=>rect.x>=0&&rect.y>=0&&rect.right<=rect.width+1&&rect.bottom<=rect.height+1),'all mobile gallery controls fit in the viewport');
   const motion=await page.locator('.home-campus-image.is-active').evaluate(image=>({animation:getComputedStyle(image).animationName,transition:getComputedStyle(image).transitionDuration}));
   assert.equal(motion.animation,'none');
   assert.ok(motion.transition.split(',').every(time=>parseFloat(time)/(time.trim().endsWith('ms')?1000:1)<=0.001),
    'reduced motion removes perceptible image crossfades');
   await selectView(page,views[2]);
   await page.locator('#menu-toggle').click();await page.locator('#site-menu-close').click();await page.locator('#site-menu').waitFor({state:'hidden'});
   await selectView(page,views[1]);
   const cancelled=await page.evaluate(()=>{
    const target=document.querySelector('[data-stage-panel][data-stage="campus"]'),fire=(type,y)=>{
     const event=new Event(type,{bubbles:true,cancelable:true}),touches=[{clientX:185,clientY:y,identifier:1}];
     Object.defineProperty(event,'touches',{value:touches});Object.defineProperty(event,'changedTouches',{value:touches});
     target.dispatchEvent(event);return event.defaultPrevented;
    };
    fire('touchstart',500);const blocked=[400,300,200].map(y=>fire('touchmove',y));fire('touchend',200);return blocked.some(Boolean);
   });
   assert.equal(cancelled,false,'touch panning is not cancelled by gallery or journey listeners');
   await scrollBelowCampus(page);
   const returnPanelBottom=await returnToCampusSlowly(page);await imageReady(page,views[1]);
   await menuStage(page,3);await menuStage(page,4);await imageReady(page,views[1]);
   // Dynamic preference changes must also stop motion without resetting the view.
   await page.emulateMedia({reducedMotion:'no-preference'});await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>!document.querySelector('#home-campus-visual')?.classList.contains('is-moving'));
   await imageReady(page,views[1]);assertLightweight(observed);assertClean(observed);return {...size,touchCancelled:cancelled,returnPanelBottom};
  }finally{await ctx.close();}
 });

 await run('full-explorer navigation and restored homepage keep the gallery and menu functional',async()=>{
  const ctx=await context(),page=await ctx.newPage(),observed=observe(page);
  try{
   await openHome(page);await menuStage(page,4);await selectView(page,views[2]);
   // Exercise persisted events even on a browser that elects not to cache WebGL pages.
   await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await imageReady(page,views[2]);await selectView(page,views[1]);
   await page.locator('.home-campus-open').click();await page.waitForURL(base+'/site/campus',{timeout});
   await page.locator('#render').evaluate(image=>image.decode());assertLightweight(observed);
   await page.goBack({waitUntil:'commit'});await page.waitForURL(base+'/',{waitUntil:'commit',timeout});
   await page.waitForFunction(()=>window.__experience?.currentStage,null,{timeout});
   const persistedShows=await page.evaluate(()=>window.__campusEntryQA.persistedShows);
   if(persistedShows>0){
    await imageReady(page,views[1]);assert.equal(await page.locator('#main').evaluate(element=>element.inert),false,'restored page is not trapped behind intro');
   }else{
    await page.waitForFunction(()=>!document.querySelector('#main')?.inert&&!document.body.hasAttribute('data-booting'),null,{timeout});
    await menuStage(page,4);await imageReady(page,views[0]);
   }
   await page.locator('#menu-toggle').click();await page.locator('#site-menu-close').click();await page.locator('#site-menu').waitFor({state:'hidden'});
   await selectView(page,views[3]);await menuStage(page,3);await menuStage(page,4);await imageReady(page,views[3]);
   assertLightweight(observed);assertClean(observed);return {persistedShows};
  }finally{await ctx.close();}
 });
}finally{await browser.close();}
console.log(JSON.stringify({base,passed:reports.length-failures.length,total:reports.length,failures},null,2));
if(failures.length)process.exitCode=1;
