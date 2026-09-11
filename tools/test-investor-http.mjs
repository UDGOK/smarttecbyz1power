// Tests the compiled Node adapter through real HTTP. Redis REST is a local TLS fixture.
import {createServer as httpsServer} from 'node:https';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import deckMetadata from '../src/smarttec-investor/data/investor-deck.json' with {type:'json'};
import pitchMedia from '../src/smarttec-investor/data/pitch-media.json' with {type:'json'};
import {chapters as pitchChapters} from '../src/smarttec-investor/data/immersive-pitch.mjs';
import {JSDOM} from 'jsdom';
import {hashPassword} from '../src/smarttec-investor/server/auth.mjs';
import {headerSignature} from './header-contract.mjs';
const dir=await mkdtemp(join(tmpdir(),'smarttec-http-'));let app,redis;let checks=0;
try{
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-days','1'],{stdio:'ignore'});
const data=new Map(),counts=new Map();
redis=httpsServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},async(req,res)=>{let body='';for await(const c of req)body+=c;try{assert.equal(req.headers.authorization,'Bearer fixture-token');const [cmd,key,...rest]=JSON.parse(body);let result;if(cmd==='GET')result=data.get(key)||null;if(cmd==='SET'){data.set(key,rest[0]);result='OK';}if(cmd==='DEL'){data.delete(key);result=1;}if(cmd==='EVAL'){const k=rest[1];result=(counts.get(k)||0)+1;counts.set(k,result);}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({result}));}catch{res.writeHead(400);res.end('{}');}});
await new Promise(r=>redis.listen(0,'127.0.0.1',r));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin='http://127.0.0.1:'+port;
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),INVESTOR_ORIGIN:origin,INVESTOR_LOCAL_HTTP:'1',INVESTOR_PASSWORD_HASH:await hashPassword('integration-password'),INVESTOR_SESSION_SECRET:'I'.repeat(64),UPSTASH_REDIS_REST_URL:'https://127.0.0.1:'+redis.address().port,UPSTASH_REDIS_REST_TOKEN:'fixture-token',NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')};delete env.VERCEL;
app=spawn(process.execPath,['dist/server/entry.mjs'],{env,stdio:['ignore','pipe','pipe']});let logs='';app.stderr.on('data',b=>logs+=b.toString());
let ready=false;for(let i=0;i<60;i++){try{await fetch(origin);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,'Compiled server did not start: '+logs);
let r=await fetch(origin+'/investors',{redirect:'manual'});assert.equal(r.status,303);checks++;assert.equal(r.headers.get('location'),'/investors/login');checks++;
r=await fetch(origin+'/investors/pitch',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/investors/login');assert.match(r.headers.get('cache-control'),/no-store/);checks++;
r=await fetch(origin+'/investors/login');const login=await r.text();assert.equal(r.status,200);assert.ok(!login.includes('39.21'));assert.ok(!login.includes('scrypt$'));checks++;
for(const path of ['presentation','bootstrap','survey','survey-image','concept-manufacturing','concept-compute','concept-energy','module-factory','module-rack','module-energy',...pitchMedia.assets.map(asset=>asset.action)]){r=await fetch(origin+'/api/investor/'+path);assert.equal(r.status,401);checks++;}
r=await fetch(origin+'/api/investor/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'integration-password'})});assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.get('set-cookie').split(';')[0];checks++;
r=await fetch(origin+'/investors',{headers:{Cookie:cookie}});const page=await r.text();assert.equal(r.status,200);assert.ok(page.includes('8460 US 70, Mead, OK 73449'));assert.ok(page.includes('inv-equipment-rows'));assert.ok(r.headers.get('cache-control').includes('no-store'));checks++;
assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);checks++;
r=await fetch(origin+'/investors/pitch',{headers:{Cookie:cookie}});const pitchPage=await r.text();assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');checks++;
const pitchDOM=new JSDOM(pitchPage),pitchDoc=pitchDOM.window.document;
assert.equal(pitchDoc.querySelectorAll('#pitch-stage [data-chapter]').length,13);
assert.deepEqual([...pitchDoc.querySelectorAll('[data-chapter]')].map(slide=>slide.dataset.chapter),pitchChapters.map(chapter=>chapter.id));
for(const script of pitchDoc.querySelectorAll('script')){assert.ok(script.src,'Pitch controller must stay external under the private CSP');assert.equal(script.textContent.trim(),'');}
for(const chapter of pitchChapters){const slide=pitchDoc.querySelector(`[data-chapter="${chapter.id}"]`);for(const metric of chapter.metrics)assert.ok(slide.textContent.includes(metric.value),`${chapter.id}: missing financial or project metric ${metric.value}`);}
assert.equal(pitchDoc.querySelector('#pitch-sound').getAttribute('aria-pressed'),'false');assert.equal(pitchDoc.querySelector('#pitch-film').getAttribute('src'),null);
assert.equal(pitchDoc.querySelector('#pitch-play').getAttribute('aria-label'),'Play slides');
assert.equal(pitchDoc.querySelector('#pitch-audio-options').hasAttribute('hidden'),true);
assert.equal(pitchDoc.querySelector('#pitch-audio-options').getAttribute('aria-controls'),'pitch-audio-panel');
assert.equal(pitchDoc.querySelector('#pitch-volume').getAttribute('type'),'range');
assert.deepEqual(['min','max','value'].map(name=>pitchDoc.querySelector('#pitch-volume').getAttribute(name)),['0','100','55']);
pitchDOM.window.close();checks++;
const launcherDOM=new JSDOM(page),launchers=[...launcherDOM.window.document.querySelectorAll('a[data-pitch-launch]')];
assert.ok(launchers.length>0,'Investor room needs a visible pitch launch link');
for(const link of launchers)assert.equal(link.getAttribute('href'),'/investors/pitch');
assert.match(launcherDOM.window.document.querySelector('#opportunity [data-pitch-launch]')?.textContent||'',/Open immersive investor deck/,'Opening section must name the immersive deck directly');
assert.equal(launcherDOM.window.document.querySelector('.site-header [data-pitch-launch]')?.getAttribute('href'),'/investors/pitch','Header must offer a direct pitch shortcut');
assert.equal(launcherDOM.window.document.querySelector('#inv-journey-next')?.getAttribute('href'),'#investor-presentation','Opening navigation must not skip the presentation');
const launchDialog=launcherDOM.window.document.querySelector('#investor-pitch-dialog');assert.ok(launchDialog);assert.equal(launchDialog.querySelector('iframe').getAttribute('src'),null,'Do not load the pitch before it is opened');launcherDOM.window.close();checks++;
for(const asset of pitchMedia.assets){
 const url=origin+'/api/investor/'+asset.action;
 r=await fetch(url,{method:'HEAD',headers:{Cookie:cookie,Range:'bytes=0-31'}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),asset.mime);assert.equal(r.headers.get('content-length'),String(asset.bytes));assert.equal(r.headers.get('accept-ranges'),'bytes');assert.equal(r.headers.get('content-range'),null);assert.equal((await r.arrayBuffer()).byteLength,0);assert.match(r.headers.get('cache-control'),/no-store/);checks++;
 r=await fetch(url,{headers:{Cookie:cookie,Range:'bytes=0-31'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes 0-31/${asset.bytes}`);assert.equal(r.headers.get('content-length'),'32');assert.deepEqual(Buffer.from(await r.arrayBuffer()),(await readFile('src/smarttec-investor/media/pitch/'+asset.filename)).subarray(0,32));checks++;
 r=await fetch(url,{headers:{Cookie:cookie,Range:`bytes=${asset.bytes}-`}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),`bytes */${asset.bytes}`);assert.equal((await r.arrayBuffer()).byteLength,0);checks++;
 r=await fetch(url,{method:'POST',headers:{Cookie:cookie,Origin:origin}});assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET, HEAD');checks++;
}
// An otherwise successful HTTP response can still ship a dead private menu
// if Astro inlines its small script and the page CSP refuses to execute it.
for(const html of [login,page]){
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length>0);
 for(const [,attributes,body]of scripts){assert.match(attributes,/\bsrc=/,'Private inline script would violate CSP: '+body.slice(0,160));assert.equal(body.trim(),'');}
 const homeHTML=await(await fetch(origin)).text();
 assert.deepEqual(headerSignature(html),headerSignature(homeHTML),'private entrance and room use the homepage header');
 checks++;
}
assert.equal((page.match(/id="inv-logout"/g)||[]).length,1);
assert.equal((login.match(/id="inv-logout"/g)||[]).length,0);
assert.ok(page.includes('<dialog'));assert.ok(page.includes('aria-haspopup="dialog"'));
for(const id of ['opportunity','campus','deployment','capital','returns','evidence','questions'])assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
checks++;
for(const asset of ['/investor-assets/fonts.css','/assets/fonts/GoogleSansCode-Regular.ttf','/assets/fonts/GoogleSansCode-Bold.ttf','/assets/brand/smarttec-lockup-offwhite-green.svg']){r=await fetch(origin+asset);assert.equal(r.status,200);checks++;}
const bootstrap=await(await fetch(origin+'/api/investor/bootstrap',{headers:{Cookie:cookie}})).json();const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':bootstrap.csrf};
for(const path of ['concept-manufacturing','concept-compute','concept-energy','module-factory','module-rack','module-energy']){r=await fetch(origin+'/api/investor/'+path,{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok((await r.arrayBuffer()).byteLength>10000);checks++;}
r=await fetch(origin+'/api/investor/calculate',{method:'POST',headers,body:JSON.stringify({scenario:bootstrap.sample})});assert.equal(r.status,200);const result=await r.json();assert.equal(result.requiredInitialFunding,330000);assert.ok(result.project.totalROI<0);checks++;
assert.ok(page.includes('Profitability is not yet established'));assert.equal((page.match(/data-underwriting-option=/g)||[]).length,26);checks++;
for(const currentAmount of ['$7,274,101','$7,022,101','$1,083,600','$831,600'])assert.ok(page.includes(currentAmount),currentAmount+' current comparison must be present');
assert.ok(page.includes('BC LLC'));assert.ok(page.includes('non-cooling'));checks++;
const fundingFAQ=await(await fetch(origin+'/api/investor/faq',{method:'POST',headers,body:JSON.stringify({question:'How much funding is required?'})})).json();
assert.ok(fundingFAQ.matches.some(f=>f.id==='F17'&&f.answer.includes('$7,274,101')&&f.answer.includes('exclude unknown non-cooling')));checks++;
// Exercise the real editor against the compiled API using a DOM, without live credentials.
const dom=new JSDOM(page,{url:origin+'/investors',runScripts:'outside-only'}),win=dom.window;
win.structuredClone=structuredClone;win.matchMedia=()=>({matches:true});win.gsap={from(){}};
win.HTMLElement.prototype.scrollIntoView=function(){};
win.fetch=(url,options={})=>fetch(new URL(url,origin),{...options,headers:{Cookie:cookie,Origin:origin,...options.headers}});
const reference=win.document.querySelector('#sta-reference');if(reference)reference.open=false;
win.eval((await readFile('src/smarttec-investor/client/app.mjs','utf8')).replace("import {gsap} from 'gsap';",''));
const until=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Editor did not reach expected state: '+win.document.querySelector('#inv-app-status').textContent);};
await until(()=>!win.document.querySelector('#inv-calculator').hidden);checks++;
win.document.querySelector('[data-underwriting-option="planned-mix"][data-underwriting-case="base"]').click();
await until(()=>win.document.querySelectorAll('.inv-equipment-row').length===2);
assert.equal(win.document.querySelector('[data-field="completeSystemCost"]').value,'80000');
assert.equal(win.document.querySelector('#inv-underwriting-note').hidden,false);checks++;
win.document.querySelector('#inv-acknowledge').checked=true;
win.document.querySelector('#inv-scenario-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>!win.document.querySelector('#inv-results').hidden);
assert.match(win.document.querySelector('#inv-result-cards').textContent,/-\$1,077,455/);checks++;
win.document.querySelector('#inv-price-floor').click();
await until(()=>win.document.querySelector('#inv-price-result').textContent.includes('Required revenue multiplier'));
assert.match(win.document.querySelector('#inv-price-result').textContent,/2\.006×/);
assert.match(win.document.querySelector('#inv-price-result').textContent,/\$4\.19 per gpu hour/);checks++;
const priceChange=win.document.querySelector('[data-field="annualRateEscalation"]');priceChange.value='-10';
assert.equal(priceChange.checkValidity(),true);priceChange.dispatchEvent(new win.Event('input',{bubbles:true}));
assert.equal(win.document.querySelector('#inv-results').hidden,true);assert.equal(win.document.querySelector('#inv-acknowledge').checked,false);checks++;
win.document.querySelector('[data-underwriting-option="b200-scale"][data-underwriting-case="favorable"]').click();
await until(()=>win.document.querySelectorAll('[data-field="profileId"]')[1]?.value==='hgx-b200-reference');
assert.equal(win.document.querySelectorAll('[data-field="systems"]')[1].value,'2');
win.document.querySelector('#inv-acknowledge').checked=true;
win.document.querySelector('#inv-scenario-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>!win.document.querySelector('#inv-results').hidden);
assert.match(win.document.querySelector('#inv-result-cards').textContent,/17\.1%/);checks++;
win.document.querySelector('[data-underwriting-power="reported"][data-underwriting-option="planned-mix"]').click();
await until(()=>win.document.querySelector('[data-field="energyRatePerKwh"]').value==='0.07');
assert.equal(win.document.querySelector('#inv-results').hidden,true);
assert.equal(win.document.querySelector('#inv-acknowledge').checked,false);checks++;
win.document.querySelector('[data-underwriting-option="proposed-60-20"]').click();
await until(()=>win.document.querySelector('[data-field="siteCapex"]').value==='652800');
assert.equal(win.document.querySelector('#inv-results').hidden,true);
assert.equal(win.document.querySelector('#inv-acknowledge').checked,false);checks++;
const owner=await (await fetch(origin+'/api/investor/underwriting-scenario',{method:'POST',headers,body:JSON.stringify({id:'proposed-60-20',ownerPricing:true})})).json();
assert.equal(owner.scenario.rows.reduce((n,r)=>n+r.systems*r.completeSystemCost,0),5360000);checks++;
r=await fetch(origin+'/api/investor/underwriting-scenario',{method:'POST',headers:{...headers,'X-CSRF-Token':'invalid'},body:JSON.stringify({id:'proposed-60-20',ownerPricing:true})});assert.equal(r.status,403);checks++;
r=await fetch(origin+'/api/investor/underwriting-scenario',{method:'POST',headers,body:JSON.stringify({id:'invented',ownerPricing:true})});assert.equal(r.status,400);checks++;
dom.window.close();
assert.ok(page.includes('Download investor presentation'));assert.ok(page.includes('href="/api/investor/presentation"'));checks++;
for(const key of ['b300-studio','power-supply-concept','campus-dusk']){
 const asset='/assets/investor/'+key+'.webp';assert.ok(page.includes('src="'+asset+'"'));
 const response=await fetch(origin+asset);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes('image/webp'));
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile('public'+asset));checks++;
}
assert.ok(page.includes('These AI-generated visuals illustrate the strategy'));checks++;
if(process.env.INVESTOR_VISUAL_QA==='1'){
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,channel:process.env.INVESTOR_QA_BROWSER||undefined});
 try{
  await mkdir('tmp/pdfs',{recursive:true});await mkdir('tmp/pitch-review',{recursive:true});await mkdir('tmp/pitch-audio',{recursive:true});
  const context=await browser.newContext({reducedMotion:'no-preference'});const split=cookie.indexOf('=');
  await context.addCookies([{name:cookie.slice(0,split),value:cookie.slice(split+1),url:origin}]);
  const instrumentSound=()=>{
   window.__pitchAudioContexts=[];
   const Native=window.AudioContext||window.webkitAudioContext;
   if(Native)window.AudioContext=new Proxy(Native,{construct(Target,args){const audio=new Target(...args);window.__pitchAudioContexts.push(audio);return audio;}});
   const nativeConnect=window.AudioNode?.prototype.connect;
   if(nativeConnect)window.AudioNode.prototype.connect=function(destination,...args){
    if(destination===this.context.destination){
     const context=this.context;
     if(!context.__pitchFinalAnalyser){context.__pitchFinalAnalyser=context.createAnalyser();context.__pitchFinalAnalyser.fftSize=4096;context.__pitchFinalAnalyser.smoothingTimeConstant=0;nativeConnect.call(context.__pitchFinalAnalyser,destination);}
     nativeConnect.call(this,context.__pitchFinalAnalyser,...args);return destination;
    }
    return nativeConnect.call(this,destination,...args);
   };
   window.__pitchMeasureAudio=async()=>{
    const context=window.__pitchAudioContexts.at(-1),analyser=context?.__pitchFinalAnalyser;
    if(!analyser)throw new Error('Final audio output was not connected to the measured destination');
    const values=new Float32Array(analyser.fftSize);let squares=0,peak=0,samples=0,finite=true;
    for(let frame=0;frame<16;frame++){
     analyser.getFloatTimeDomainData(values);
     for(const value of values){finite=finite&&Number.isFinite(value);squares+=value*value;peak=Math.max(peak,Math.abs(value));samples++;}
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    const rms=Math.sqrt(squares/samples);return{rms,peak,dbfs:20*Math.log10(rms||Number.MIN_VALUE),finite,state:context.state,sampleRate:context.sampleRate};
   };
  };
  await context.addInitScript(instrumentSound);
  const measureSound=page=>page.evaluate(()=>window.__pitchMeasureAudio());
  const audible=(measurement,label)=>{assert.ok(measurement.finite&&measurement.state==='running'&&measurement.rms>.012&&measurement.peak<.65,`${label}: rendered soundtrack should be audible without clipping: ${JSON.stringify(measurement)}`);};
  const tab=await context.newPage(),browserErrors=[];
  tab.on('pageerror',error=>browserErrors.push(error.message));
  for(const width of [1440,390]){
   const height=width===390?844:900;
   await tab.setViewportSize({width,height});await tab.goto(origin+'/investors');
   await tab.waitForFunction(()=>document.querySelector('#investor-pitch-dialog')?.dataset.mounted==='true'&&!document.querySelector('.inv-journey-dock').hidden);
   await tab.evaluate(()=>document.fonts.ready);
   await tab.waitForFunction(()=>!document.querySelector('#inv-calculator').hidden&&Number(getComputedStyle(document.querySelector('.inv-hero-copy')).opacity)>.99);
   assert.equal(await tab.evaluate(()=>scrollY),0,'Do not scroll to manufacture initial pitch-link visibility');
   for(const selector of ['.site-header [data-pitch-launch]','#opportunity [data-pitch-launch]']){
    const entry=tab.locator(selector),bounds=await entry.boundingBox();
    assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height,`${width}: ${selector} must be inside the first viewport`);
    assert.equal(await entry.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit);}),true,`${width}: presentation link must be unobscured and clickable`);
   }
   await tab.screenshot({path:`tmp/pitch-review/investor-entry-${width}.png`});
   assert.equal(await tab.locator('#inv-journey-next').getAttribute('href'),'#investor-presentation');
   await tab.locator('#inv-journey-next').click();
   await tab.waitForFunction(()=>document.querySelector('#inv-journey-title').textContent==='Immersive pitch & PDF');checks++;
   const section=tab.locator('#investor-presentation');await section.scrollIntoViewIfNeeded();
   await section.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
   assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await section.screenshot({path:`tmp/pdfs/investor-page-${width}.png`});
   for(const id of ['opportunity','deployment','capital','returns','evidence','questions']){
    const target=tab.locator('#'+id);await target.scrollIntoViewIfNeeded();
    await target.screenshot({path:`tmp/pdfs/investor-${id}-${width}.png`});
   }
   assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Private page must fit after all current sections render');
   assert.equal(await tab.locator('.inv-current-budget .inv-table-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,'Current funding rows must not hide in a capped scroll area');
   assert.deepEqual(await tab.locator('img').evaluateAll(images=>images.filter(i=>i.complete&&i.currentSrc&&!i.naturalWidth).map(i=>i.currentSrc)),[],'Loaded private images must decode');
  }
  await tab.setViewportSize({width:1440,height:1000});await tab.goto(origin+'/investors/pitch');
  await tab.waitForFunction(()=>document.querySelector('#pitch-stage')?.dataset.mounted==='true');
  await tab.waitForFunction(()=>{const video=document.querySelector('#pitch-film');return video.readyState>=2&&video.videoWidth===1920&&video.currentTime>0&&!video.paused;});
  assert.equal(await tab.locator('#pitch-sound').getAttribute('aria-pressed'),'false');
  assert.equal(await tab.evaluate(()=>window.__pitchAudioContexts.length),0,'Pitch must not create an AudioContext before opt-in');
  assert.equal(await tab.locator('#pitch-audio-options').isVisible(),false,'Volume settings stay hidden before sound opt-in');
  await tab.locator('#pitch-play').click();assert.equal(await tab.locator('#pitch-play').getAttribute('aria-label'),'Play slides');
  await tab.waitForFunction(()=>document.querySelector('#pitch-film').paused);
  const pausedProgress=await tab.locator('.pitch-progress').getAttribute('aria-valuenow');await tab.waitForTimeout(450);
  assert.equal(await tab.locator('.pitch-progress').getAttribute('aria-valuenow'),pausedProgress,'Pause must stop the chapter clock');checks++;
  await tab.locator('#pitch-sound').click();
  await tab.waitForFunction(()=>window.__pitchAudioContexts.length===1&&window.__pitchAudioContexts[0].state==='running'&&document.querySelector('#pitch-sound').getAttribute('aria-pressed')==='true');
  await tab.waitForTimeout(900);const pausedAudio=await measureSound(tab);audible(pausedAudio,'Sound enabled with slides paused');
  assert.equal(await tab.locator('#pitch-play').getAttribute('aria-label'),'Play slides');assert.equal(await tab.locator('#pitch-film').evaluate(video=>video.paused),true);
  assert.equal(await tab.locator('#pitch-audio-options').textContent(),'Volume 55%');checks++;
  await tab.locator('#pitch-audio-options').click();await tab.locator('#pitch-audio-panel[open]').waitFor();
  assert.equal(await tab.locator('#pitch-volume').inputValue(),'55');assert.equal(await tab.locator('#pitch-volume-value').textContent(),'55%');
  const volumeChapter=await tab.locator('body').getAttribute('data-chapter');
  await tab.locator('#pitch-volume').focus();await tab.keyboard.press('ArrowRight');
  assert.equal(await tab.locator('#pitch-volume').inputValue(),'56');assert.equal(await tab.locator('body').getAttribute('data-chapter'),volumeChapter,'Volume-arrow keys must not navigate chapters');
  await tab.keyboard.press('Home');assert.equal(await tab.locator('#pitch-volume').inputValue(),'0');assert.equal(await tab.locator('#pitch-volume-value').textContent(),'0%');
  await tab.waitForTimeout(350);const mutedAudio=await measureSound(tab);
  assert.ok(mutedAudio.finite&&mutedAudio.peak<.00001,`Volume zero must produce digital silence: ${JSON.stringify(mutedAudio)}`);
  assert.equal(await tab.locator('#pitch-sound').getAttribute('aria-pressed'),'false');
  assert.match(await tab.locator('[data-sound-label]').textContent(),/muted/i);
  await tab.locator('#pitch-volume').evaluate(input=>{input.value='55';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await tab.waitForTimeout(350);audible(await measureSound(tab),'Restored volume');
  assert.equal(await tab.locator('#pitch-volume-value').textContent(),'55%');checks++;
  await tab.locator('#pitch-audio-close').click();await tab.locator('#pitch-audio-panel[open]').waitFor({state:'hidden'});
  await tab.waitForFunction(()=>document.activeElement?.id==='pitch-audio-options');
  for(const width of [1440,390]){
   await tab.setViewportSize({width,height:width===390?844:1000});
   const volumeBounds=await tab.locator('#pitch-audio-options').boundingBox();
   assert.ok(volumeBounds&&volumeBounds.x>=0&&volumeBounds.y>=0&&volumeBounds.x+volumeBounds.width<=width+1&&volumeBounds.y+volumeBounds.height<=(width===390?844:1000),'Sound volume control must remain inside the viewport');
   assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sound footer must not overflow');
   await tab.screenshot({path:`tmp/pitch-audio/sound-on-${width}.png`});
   await tab.locator('.pitch-controls').screenshot({path:`tmp/pitch-audio/footer-${width}.png`});
   await tab.locator('#pitch-audio-options').click();await tab.locator('#pitch-audio-panel[open]').waitFor();
   const panelBounds=await tab.locator('#pitch-audio-panel').boundingBox();
   assert.ok(panelBounds&&panelBounds.x>=0&&panelBounds.y>=0&&panelBounds.x+panelBounds.width<=width+1&&panelBounds.y+panelBounds.height<=(width===390?844:1000),'Sound dialog must fit the viewport');
   await tab.screenshot({path:`tmp/pitch-audio/volume-dialog-${width}.png`});
   await tab.locator('#pitch-audio-close').click();await tab.locator('#pitch-audio-panel[open]').waitFor({state:'hidden'});
  }
  await tab.setViewportSize({width:1440,height:1000});
  await tab.locator('#pitch-sound').click();assert.equal(await tab.locator('#pitch-sound').getAttribute('aria-pressed'),'false');
  await tab.waitForFunction(()=>window.__pitchAudioContexts[0].state==='suspended');
  assert.equal(await tab.locator('#pitch-audio-options').isVisible(),false);checks++;
  console.log(`PASS: paused-slide soundtrack measured ${pausedAudio.dbfs.toFixed(1)} dBFS RMS, peak ${pausedAudio.peak.toFixed(3)}; zero volume measured peak ${mutedAudio.peak}.`);
  // Exercise the browser denial path deterministically; the presentation remains usable.
  await tab.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new DOMException('Fixture denial','NotAllowedError'));});
  await tab.locator('#pitch-fullscreen').click();await tab.waitForFunction(()=>document.querySelector('#pitch-media-status').textContent.includes('Full screen was unavailable'));checks++;
  await tab.locator('#pitch-chapters-open').click();await tab.locator('#pitch-chapters[open]').waitFor();
  assert.equal(await tab.locator('#pitch-chapters').getAttribute('aria-labelledby'),'pitch-index-title');
  assert.equal(await tab.evaluate(()=>document.querySelector('#pitch-chapters').contains(document.activeElement)),true,'Chapter dialog must receive focus');
  await tab.keyboard.press('Tab');assert.equal(await tab.evaluate(()=>document.querySelector('#pitch-chapters').contains(document.activeElement)),true,'Chapter dialog navigation must remain inside the modal');
  await tab.keyboard.press('Shift+Tab');assert.equal(await tab.evaluate(()=>document.querySelector('#pitch-chapters').contains(document.activeElement)),true,'Reverse navigation must return within the modal');
  await tab.keyboard.press('Escape');await tab.locator('#pitch-chapters[open]').waitFor({state:'hidden'});
  assert.equal(await tab.evaluate(()=>document.activeElement?.id),'pitch-chapters-open');checks++;
  const jump=async index=>{
   await tab.locator('#pitch-chapters-open').click();await tab.locator(`#pitch-chapters [data-jump="${index}"]`).click();
   await tab.waitForFunction(id=>document.body.dataset.chapter===id,pitchChapters[index].id);
  };
  await jump(8);assert.match(await tab.locator('#pitch-counter').textContent(),/09 \/ 13/);
  assert.match(await tab.locator('#pitch-announcement').textContent(),/Chapter 9 of 13/);checks++;
  await tab.keyboard.press('Home');await tab.waitForFunction(()=>document.body.dataset.chapter==='opening');
  for(let i=1;i<pitchChapters.length;i++){await tab.keyboard.press('ArrowRight');await tab.waitForFunction(id=>document.body.dataset.chapter===id,pitchChapters[i].id);}
  assert.equal(await tab.locator('#pitch-next').isDisabled(),true);await tab.keyboard.press('ArrowLeft');
  await tab.waitForFunction(()=>document.body.dataset.chapter==='investment');await tab.keyboard.press('End');await tab.waitForFunction(()=>document.body.dataset.chapter==='next-steps');checks++;
  // Real H.264 decoding for every film, not just HTTP success or a loaded poster.
  for(const [index,visual] of [[0,'fiber'],[1,'campus'],[2,'compute']]){
   await jump(index);if(await tab.locator('#pitch-play').getAttribute('aria-label')==='Play slides')await tab.locator('#pitch-play').click();
   await tab.waitForFunction(visual=>{const video=document.querySelector('#pitch-film');return video.dataset.visual===visual&&video.readyState>=2&&video.videoWidth===1920&&video.currentTime>0&&video.classList.contains('is-ready');},visual);
   assert.equal(await tab.locator('#pitch-film').evaluate(video=>video.error),null);await tab.locator('#pitch-play').click();checks++;
  }
  for(const width of [1440,390]){
   await tab.setViewportSize({width,height:width===390?844:1000});
   for(let i=0;i<pitchChapters.length;i++){
    await jump(i);const chapter=pitchChapters[i],slide=tab.locator(`.pitch-slide[data-chapter="${chapter.id}"]`);
    await tab.waitForFunction(()=>[...document.querySelectorAll('.pitch-slide.is-active .pitch-reveal')].every(el=>Number(getComputedStyle(el).opacity)>.95));
    assert.equal(await tab.locator('.pitch-slide:visible').count(),1,`${width} ${chapter.id}: exactly one chapter must be visible`);
    assert.equal((await slide.locator('.pitch-title').textContent()).trim(),chapter.title);
    assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width} ${chapter.id}: no horizontal overflow`);
    assert.equal(await slide.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${width} ${chapter.id}: chapter must fit horizontally`);
    for(const selector of ['#pitch-chapters-open','#pitch-prev','#pitch-play','#pitch-next','#pitch-sound','#pitch-fullscreen']){
     const rect=await tab.locator(selector).boundingBox();assert.ok(rect&&rect.x>=-1&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=(width===390?844:1000)+1,`${width} ${chapter.id}: control ${selector} must remain on screen`);
    }
    const overflow=await slide.evaluate(el=>el.scrollHeight>el.clientHeight+8);
    assert.equal(await tab.locator('#pitch-reading-hint').isVisible(),overflow,`${width} ${chapter.id}: reading cue must match settled chapter overflow`);
    await tab.screenshot({path:`tmp/pitch-review/ui-${width}-${chapter.id}.png`});
    for(const metric of await slide.locator('.pitch-metric strong').all()){
     await metric.scrollIntoViewIfNeeded();
     const readable=await metric.evaluate(el=>{const style=getComputedStyle(el),rect=el.getBoundingClientRect(),slide=el.closest('.pitch-slide').getBoundingClientRect();return {text:el.textContent.trim(),font:parseFloat(style.fontSize),opacity:Number(style.opacity),visible:style.visibility!=='hidden'&&rect.width>0&&rect.height>0&&rect.left>=slide.left-1&&rect.right<=slide.right+1&&rect.top>=slide.top-1&&rect.bottom<=slide.bottom+1};});
     assert.ok(readable.visible&&readable.opacity>.95&&readable.font>=20&&readable.text.length>0,`${width} ${chapter.id}: financial/project value must be readable: ${JSON.stringify(readable)}`);
    }
    if(chapter.id==='funding-bridge')await tab.screenshot({path:`tmp/pitch-review/ui-${width}-funding-bridge-metrics.png`});
    await slide.locator('.pitch-footnote').scrollIntoViewIfNeeded();assert.equal(await slide.locator('.pitch-footnote').isVisible(),true,`${width} ${chapter.id}: disclosures must remain reachable`);
    checks++;
   }
  }
  // The actual investor-room opener uses a lazy full-window iframe and releases it on close.
  await tab.setViewportSize({width:1440,height:1000});await tab.goto(origin+'/investors');
  await tab.waitForFunction(()=>document.querySelector('#investor-pitch-dialog')?.dataset.mounted==='true');
  const launch=tab.locator('[data-pitch-launch]').first(),frameLocator=tab.frameLocator('#investor-pitch-dialog iframe');
  const nativeFullscreenSupported=await tab.evaluate(()=>document.fullscreenEnabled&&typeof Element.prototype.requestFullscreen==='function');
  await launch.click();await tab.locator('#investor-pitch-dialog[open]').waitFor();
  await frameLocator.locator('#pitch-stage[data-mounted="true"]').waitFor();await tab.locator('#investor-pitch-loading').waitFor({state:'hidden'});
  if(nativeFullscreenSupported){
   await tab.waitForFunction(()=>document.fullscreenElement===document.querySelector('#investor-pitch-dialog .pitch-frame-shell'));
   console.log('PASS: native fullscreen entered the actual presentation shell through a user click.');
  }else console.log('NOTE: this browser reports native fullscreen unavailable; only the full-window fallback applies.');
  await tab.locator('#investor-pitch-close').click();
  await tab.waitForFunction(()=>!document.querySelector('#investor-pitch-dialog iframe').hasAttribute('src')&&!document.fullscreenElement);
  await tab.waitForFunction(()=>document.activeElement===document.querySelector('[data-pitch-launch]'),undefined,{timeout:3000});
  assert.equal(await launch.evaluate(el=>document.activeElement===el),true,'Native fullscreen close restores focus and leaves fullscreen');checks++;
  await tab.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Fixture denial','NotAllowedError'));});
  assert.equal(await tab.locator('#investor-pitch-dialog iframe').getAttribute('src'),null);
  await launch.click();await tab.locator('#investor-pitch-dialog[open]').waitFor();
  await frameLocator.locator('#pitch-stage[data-mounted="true"]').waitFor();await tab.locator('#investor-pitch-loading').waitFor({state:'hidden'});
  const frameBounds=await tab.locator('#investor-pitch-dialog iframe').boundingBox();
  assert.ok(frameBounds&&frameBounds.width>=1438&&frameBounds.height>=998,'Embedded pitch must fill the viewport when native fullscreen is denied');
  assert.equal(await tab.evaluate(()=>document.activeElement?.tagName),'IFRAME','Loaded presentation receives focus');
  await tab.evaluate(()=>window.postMessage({type:'smarttec:pitch-close'},location.origin));
  await tab.waitForTimeout(100);assert.equal(await tab.locator('#investor-pitch-dialog').evaluate(el=>el.open),true,'Messages from unrelated windows cannot close the presentation');
  await tab.locator('#investor-pitch-close').click();await tab.locator('#investor-pitch-dialog[open]').waitFor({state:'hidden'});
  await tab.waitForFunction(()=>!document.querySelector('#investor-pitch-dialog iframe').hasAttribute('src'));
  assert.equal(await tab.locator('#investor-pitch-dialog iframe').getAttribute('src'),null,'Closing the presentation must unload its media and audio context');
  assert.equal(await launch.evaluate(el=>document.activeElement===el),true,'Closing returns focus to the launch link');checks++;
  await launch.click();await frameLocator.locator('#pitch-stage[data-mounted="true"]').waitFor();
  await frameLocator.locator('[data-pitch-exit]').first().click();await tab.locator('#investor-pitch-dialog[open]').waitFor({state:'hidden'});
  await tab.waitForFunction(()=>!document.querySelector('#investor-pitch-dialog iframe').hasAttribute('src'));
  assert.equal(await tab.locator('#investor-pitch-dialog iframe').getAttribute('src'),null);checks++;
  await tab.setViewportSize({width:390,height:844});await launch.click();
  await frameLocator.locator('#pitch-stage[data-mounted="true"]').waitFor();await tab.locator('#investor-pitch-loading').waitFor({state:'hidden'});
  const mobileFrame=await tab.locator('#investor-pitch-dialog iframe').boundingBox(),parentClose=await tab.locator('#investor-pitch-close').boundingBox();
  assert.ok(mobileFrame&&mobileFrame.width>=388&&mobileFrame.width<=391&&mobileFrame.height>=842,'Embedded mobile pitch must fill the viewport');
  for(const selector of ['#pitch-sound','#pitch-fullscreen','.pitch-brand']){
   const control=await frameLocator.locator(selector).boundingBox();
   assert.ok(control&&parentClose&&(control.x+control.width<=parentClose.x||control.x>=parentClose.x+parentClose.width||control.y+control.height<=parentClose.y||control.y>=parentClose.y+parentClose.height),`Mobile embedded toolbar ${selector} must not overlap the parent close button`);
  }
  assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await frameLocator.locator('#pitch-poster').evaluate(image=>image.decode());
  await tab.waitForFunction(()=>{const doc=document.querySelector('#investor-pitch-dialog iframe').contentDocument;const reveals=[...doc.querySelectorAll('.pitch-slide.is-active .pitch-reveal')];return reveals.length>0&&reveals.every(el=>Number(doc.defaultView.getComputedStyle(el).opacity)>.95);});
  await tab.screenshot({path:'tmp/pitch-review/ui-390-embedded-opening.png'});
  await tab.locator('#investor-pitch-close').click();await tab.waitForFunction(()=>!document.querySelector('#investor-pitch-dialog iframe').hasAttribute('src'));
  assert.equal(await launch.evaluate(el=>document.activeElement===el),true);checks++;
  const reducedContext=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});
  await reducedContext.addInitScript(instrumentSound);
  await reducedContext.addCookies([{name:cookie.slice(0,split),value:cookie.slice(split+1),url:origin}]);
  const reducedTab=await reducedContext.newPage(),reducedVideoRequests=[];
  reducedTab.on('pageerror',error=>browserErrors.push(error.message));
  reducedTab.on('request',request=>{if(/\/api\/investor\/pitch-.*-video/.test(request.url()))reducedVideoRequests.push(request.url());});
  await reducedTab.goto(origin+'/investors/pitch');await reducedTab.waitForFunction(()=>document.querySelector('#pitch-stage')?.dataset.mounted==='true');
  await reducedTab.locator('#pitch-poster').evaluate(image=>image.decode());
  assert.equal(await reducedTab.locator('#pitch-film').getAttribute('src'),null);
  assert.equal(await reducedTab.locator('#pitch-play').getAttribute('aria-label'),'Play slides');
  await reducedTab.keyboard.press('ArrowRight');await reducedTab.waitForFunction(()=>document.body.dataset.chapter==='thesis');
  await reducedTab.locator('#pitch-poster').evaluate(image=>image.decode());await reducedTab.waitForTimeout(300);
  assert.deepEqual(reducedVideoRequests,[],'Reduced-motion viewers must not fetch videos without pressing Play');
  await reducedTab.screenshot({path:'tmp/pitch-review/ui-390-reduced-motion.png'});
  assert.equal(await reducedTab.evaluate(()=>window.__pitchAudioContexts.length),0,'Reduced-motion presentation must not start sound automatically');
  await reducedTab.locator('#pitch-sound').click();await reducedTab.waitForFunction(()=>document.querySelector('#pitch-sound').getAttribute('aria-pressed')==='true');
  await reducedTab.waitForTimeout(900);const reducedAudio=await measureSound(reducedTab);audible(reducedAudio,'Reduced-motion sound opt-in');
  assert.equal(await reducedTab.locator('#pitch-play').getAttribute('aria-label'),'Play slides');
  assert.equal(await reducedTab.locator('#pitch-film').getAttribute('src'),null);assert.deepEqual(reducedVideoRequests,[],'Sound opt-in must not enable motion or load videos');
  await reducedTab.screenshot({path:'tmp/pitch-audio/reduced-sound-on-390.png'});checks++;
  await reducedTab.locator('#pitch-sound').click();await reducedTab.waitForFunction(()=>window.__pitchAudioContexts[0].state==='suspended');
  await reducedTab.locator('#pitch-play').click();await reducedTab.waitForFunction(()=>document.querySelector('#pitch-film').readyState>=2&&document.querySelector('#pitch-film').currentTime>0);
  assert.ok(reducedVideoRequests.length>0,'Reduced-motion viewer can opt into video explicitly');await reducedContext.close();checks++;
  assert.deepEqual(browserErrors,[],'Private browser JavaScript errors');
 }finally{await browser.close();}
}
r=await fetch(origin+'/api/investor/presentation',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.ok(r.headers.get('cache-control').includes('no-store'));assert.ok(r.headers.get('content-disposition').includes(deckMetadata.filename));
const deckBytes=Buffer.from(await r.arrayBuffer());assert.equal(deckBytes.length,deckMetadata.bytes);assert.equal(createHash('sha256').update(deckBytes).digest('hex'),deckMetadata.sha256);checks++;
r=await fetch(origin+'/api/investor/presentation',{method:'HEAD',headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),String(deckMetadata.bytes));assert.equal((await r.arrayBuffer()).byteLength,0);checks++;
r=await fetch(origin+'/api/investor/survey',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');checks++;
r=await fetch(origin+'/api/investor/logout',{method:'POST',headers,body:'{}'});assert.equal(r.status,200);checks++;
r=await fetch(origin+'/investors',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(r.status,303);checks++;
r=await fetch(origin+'/api/investor/presentation',{headers:{Cookie:cookie}});assert.equal(r.status,401);checks++;
r=await fetch(origin+'/investors/pitch',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/investors/login');checks++;
r=await fetch(origin+'/api/investor/pitch-fiber-video',{headers:{Cookie:cookie,Range:'bytes=0-31'}});assert.equal(r.status,401);checks++;
console.log(`PASS: ${checks} compiled-server HTTP${process.env.INVESTOR_VISUAL_QA==='1'?' and browser':''} checks; local TLS Redis fixture, not a live Upstash/Vercel deployment.`);
}finally{app?.kill();if(redis)await new Promise(r=>redis.close(r));assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'smarttec-http-'),'Cleanup must stay inside this test fixture directory');await rm(dir,{recursive:true,force:true});}
