// Tests the compiled Node adapter through real HTTP. Redis REST is a local TLS fixture.
import {createServer as httpsServer} from 'node:https';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
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
r=await fetch(origin+'/investors/login');const login=await r.text();assert.equal(r.status,200);assert.ok(!login.includes('39.21'));assert.ok(!login.includes('scrypt$'));checks++;
for(const path of ['bootstrap','survey','survey-image','concept-manufacturing','concept-compute','concept-energy','module-factory','module-rack','module-energy']){r=await fetch(origin+'/api/investor/'+path);assert.equal(r.status,401);checks++;}
r=await fetch(origin+'/api/investor/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'integration-password'})});assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.get('set-cookie').split(';')[0];checks++;
r=await fetch(origin+'/investors',{headers:{Cookie:cookie}});const page=await r.text();assert.equal(r.status,200);assert.ok(page.includes('8460 US 70, Mead, OK 73449'));assert.ok(page.includes('inv-equipment-rows'));assert.ok(r.headers.get('cache-control').includes('no-store'));checks++;
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
assert.ok(page.includes('Profitability is not yet established'));assert.equal((page.match(/data-underwriting-option=/g)||[]).length,18);checks++;
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
dom.window.close();
r=await fetch(origin+'/api/investor/survey',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');checks++;
r=await fetch(origin+'/api/investor/logout',{method:'POST',headers,body:'{}'});assert.equal(r.status,200);checks++;
r=await fetch(origin+'/investors',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(r.status,303);checks++;
console.log(`PASS: ${checks} compiled-server HTTP checks; local TLS Redis fixture, not a live Upstash/Vercel deployment.`);
}finally{app?.kill();if(redis)await new Promise(r=>redis.close(r));await rm(dir,{recursive:true,force:true});}
