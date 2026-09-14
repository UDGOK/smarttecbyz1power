import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,config,createSession,authenticate,csrfValid,RedisStore,privateHeaders} from '../src/smarttec-investor/server/auth.mjs';
import {handle} from '../src/smarttec-investor/server/handlers.mjs';
import {answerQuestion} from '../src/smarttec-investor/server/faq.mjs';
import {model,base,usd} from '../src/smarttec-investor/financial-model.mjs';
class Store{data=new Map();counts=new Map();async get(k){return this.data.get(k)||null;}async set(k,v){this.data.set(k,v);}async delete(k){this.data.delete(k);}async increment(k){const n=(this.counts.get(k)||0)+1;this.counts.set(k,n);return n;}}
const password='route-test-password';const hash=await hashPassword(password);const cfg=config({INVESTOR_ORIGIN:'https://www.smarttec.dev',INVESTOR_PASSWORD_HASH:hash,INVESTOR_SESSION_SECRET:'S'.repeat(64),VERCEL:'1'});
const req=(action,body,headers={},method=body===undefined?'GET':'POST')=>new Request('https://www.smarttec.dev/api/investor/'+action,{method,headers:{origin:cfg.origin,'x-vercel-forwarded-for':'198.51.100.1',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function signed(){const store=new Store();const r=await handle(req('login',{password}),'login',{cfg,store});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const b=await(await handle(req('bootstrap',undefined,{cookie}),'bootstrap',{cfg,store})).json();return {store,cookie,csrf:b.csrf};}
test('retired calculator routes preserve authentication and CSRF before returning Gone',async()=>{
 const {store,cookie,csrf}=await signed();
 for(const action of ['underwriting-scenario','calculate','compare','price-floor','export']){
  assert.equal((await handle(req(action,{}),action,{cfg,store})).status,401,action+' anonymous');
  assert.equal((await handle(req(action,{},{cookie}),action,{cfg,store})).status,403,action+' missing CSRF');
  assert.equal((await handle(req(action,{},{cookie,'x-csrf-token':csrf,origin:'https://evil.example'}),action,{cfg,store})).status,403,action+' cross origin');
  const response=await handle(req(action,{scenario:{rate:999}},{cookie,'x-csrf-token':csrf}),action,{cfg,store});
  assert.equal(response.status,410,action);assert.match(response.headers.get('cache-control'),/no-store/);
  const result=await response.json();assert.equal(result.modelVersion,model.version);assert.equal(result.url,'/investors#returns');assert.equal(result.scenario,undefined);assert.equal(result.result,undefined);
 }
});

test('new realistic images and modular models remain private',async()=>{const {store,cookie}=await signed();for(const action of ['concept-manufacturing','concept-compute','concept-energy','module-factory','module-rack','module-energy']){assert.equal((await handle(req(action),action,{cfg,store})).status,401);const r=await handle(req(action,undefined,{cookie}),action,{cfg,store});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok((await r.arrayBuffer()).byteLength>10000);}});
test('thermal assets remain private, no-store and return valid MIME types',async()=>{const {store,cookie}=await signed();for(const [action,mime] of [['thermal-model','model/gltf-binary'],['thermal-preview','image/webp']]){assert.equal((await handle(req(action),action,{cfg,store})).status,401);const r=await handle(req(action,undefined,{cookie}),action,{cfg,store});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),mime);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok((await r.arrayBuffer()).byteLength>1000);}});
test('password hashes are salted and wrong passwords fail',async()=>{assert.notEqual(hash,await hashPassword(password));assert.equal(await verifyPassword(password,hash),true);assert.equal(await verifyPassword('wrong',hash),false);assert.equal(await verifyPassword(password,'bad'),false);});
test('production configuration rejects insecure origin and missing secrets',()=>{assert.throws(()=>config({INVESTOR_ORIGIN:'http://www.smarttec.dev'}));assert.throws(()=>config({INVESTOR_ORIGIN:cfg.origin,INVESTOR_PASSWORD_HASH:hash,INVESTOR_SESSION_SECRET:'short'}));});
test('anonymous investor APIs deny access',async()=>{for(const action of ['bootstrap','model','calculate','export','faq']){const r=await handle(req(action),action,{cfg,store:new Store()});assert.equal(r.status,401,action);assert.equal(r.headers.get('cache-control'),privateHeaders['Cache-Control']);}});
test('login rejects wrong password and cross-origin request',async()=>{const store=new Store();assert.equal((await handle(req('login',{password:'bad'}),'login',{cfg,store})).status,401);assert.equal((await handle(req('login',{password},{origin:'https://evil.example'}),'login',{cfg,store})).status,403);});
test('login sets secure host cookie and authenticates data',async()=>{const store=new Store();const r=await handle(req('login',{password}),'login',{cfg,store});const c=r.headers.get('set-cookie');for(const s of ['__Host-smarttec-investor=','HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(c.includes(s));assert.ok((await authenticate(req('bootstrap',undefined,{cookie:c.split(';')[0]}),store,cfg)).csrf);});
test('sixth login attempt is rate limited',async()=>{const store=new Store();for(let i=0;i<5;i++)assert.equal((await handle(req('login',{password:'wrong'}),'login',{cfg,store})).status,401);assert.equal((await handle(req('login',{password}),'login',{cfg,store})).status,429);});
test('CSRF required for FAQ and logout',async()=>{const {store,cookie,csrf}=await signed();assert.equal((await handle(req('faq',{question:'How much funding is required?'},{cookie}),'faq',{cfg,store})).status,403);assert.equal(csrfValid(new Request(cfg.origin,{headers:{'x-csrf-token':'x'.repeat(64)}}),{csrf}),false);assert.equal((await handle(req('logout',{}, {cookie,'x-csrf-token':csrf,origin:'https://evil.example'}),'logout',{cfg,store})).status,403);});

test('authenticated model GET and HEAD expose only the reviewed snapshot',async()=>{
 const {store,cookie}=await signed();
 const get=await handle(req('model',undefined,{cookie}),'model',{cfg,store});assert.equal(get.status,200);assert.match(get.headers.get('content-type'),/application\/json/);assert.deepEqual(await get.json(),model);
 const head=await handle(req('model',undefined,{cookie},'HEAD'),'model',{cfg,store});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.match(head.headers.get('content-disposition'),/SmartTec_Model_v6\.1_1_Verified_Scenarios\.json/);assert.match(head.headers.get('cache-control'),/no-store/);
 const bootstrap=await(await handle(req('bootstrap',undefined,{cookie}),'bootstrap',{cfg,store})).json();assert.deepEqual(bootstrap.model,model);assert.equal(bootstrap.sample,undefined);assert.equal(bootstrap.mapData,undefined);assert.equal(bootstrap.mapConfig,undefined);assert.equal(bootstrap.campus,undefined);
});

test('tampered expired and rotated sessions are denied',async()=>{const store=new Store();const old=await createSession(store,cfg,Date.now()-4000000);assert.equal(await authenticate(req('bootstrap',undefined,{cookie:'__Host-smarttec-investor='+old.cookie}),store,cfg),null);const good=await createSession(store,cfg);assert.equal(await authenticate(req('bootstrap',undefined,{cookie:'__Host-smarttec-investor='+good.cookie.slice(0,-1)+'z'}),store,cfg),null);assert.equal(await authenticate(req('bootstrap',undefined,{cookie:'__Host-smarttec-investor='+good.cookie}),store,{...cfg,epoch:'new'}),null);});
test('logout revokes copied cookie',async()=>{const {store,cookie,csrf}=await signed();assert.equal((await handle(req('logout',{}, {cookie,'x-csrf-token':csrf}),'logout',{cfg,store})).status,200);assert.equal((await handle(req('bootstrap',undefined,{cookie}),'bootstrap',{cfg,store})).status,401);});
test('storage failure never grants access',async()=>{const {cookie}=await signed();const store={get:async()=>{throw new Error('Session service unavailable');}};assert.equal((await handle(req('bootstrap',undefined,{cookie}),'bootstrap',{cfg,store})).status,503);});
test('FAQ cites the current model and unknown questions stay unknown',()=>{
 const answer=answerQuestion('How much funding is required?');
 const funding=answer.matches.find(f=>f.id==='F17');assert.ok(funding);assert.ok(funding.answer.includes(usd(base.capital.totalUsd)));assert.ok(funding.sourceIds.includes('model-v6.1.1'));assert.ok(funding.sources.some(source=>source.title.includes(model.source.sha256)));
 assert.equal(answerQuestion('extraterrestrial plutonium reactor warranty').matches.length,0);assert.throws(()=>answerQuestion('a'.repeat(1001)));
});

test('oversized requests and invalid FAQ questions are rejected',async()=>{const {store,cookie,csrf}=await signed();for(const question of ['a'.repeat(5000),'',42])assert.equal((await handle(req('faq',{question},{cookie,'x-csrf-token':csrf}),'faq',{cfg,store})).status,400);});

test('Redis transport uses authenticated atomic expiring counters',async()=>{let sent;const store=new RedisStore({redisUrl:'https://test.upstash.io',redisToken:'test'},async(url,options)=>{sent=options;return new Response(JSON.stringify({result:1}));});assert.equal(await store.increment('key',900),1);assert.equal(sent.headers.Authorization,'Bearer test');const args=JSON.parse(sent.body);assert.equal(args[0],'EVAL');assert.ok(args[1].includes('EXPIRE'));});
test('reviewed snapshot is read-only and stale calculation inputs cannot override it',async()=>{
 const {store,cookie,csrf}=await signed();
 assert.equal((await handle(req('model',{scenario:{rate:999}},{cookie,'x-csrf-token':csrf}),'model',{cfg,store})).status,405);
 for(const method of ['PUT','PATCH','DELETE'])assert.equal((await handle(req('model',undefined,{cookie},method),'model',{cfg,store})).status,405);
 const snapshot=await(await handle(req('model',undefined,{cookie}),'model',{cfg,store})).json();assert.deepEqual(snapshot,model);
});

test('architectural assets require authentication and return model or PNG',async()=>{const {store,cookie}=await signed();for(const action of ['architecture-model','architecture-overview','architecture-manufacturing']){assert.equal((await handle(req(action),action,{cfg,store})).status,401);const r=await handle(req(action,undefined,{cookie}),action,{cfg,store});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const b=Buffer.from(await r.arrayBuffer());if(action==='architecture-model'){assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);}else assert.equal(b.toString('ascii',1,4),'PNG');}});
