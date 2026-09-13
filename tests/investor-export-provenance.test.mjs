import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,config,createSession} from '../src/smarttec-investor/server/auth.mjs';
import {handle} from '../src/smarttec-investor/server/handlers.mjs';
import {model} from '../src/smarttec-investor/financial-model.mjs';

class Store{data=new Map();counts=new Map();async get(k){return this.data.get(k)||null;}async set(k,v){this.data.set(k,v);}async delete(k){this.data.delete(k);}async increment(k){const n=(this.counts.get(k)||0)+1;this.counts.set(k,n);return n;}}
const cfg=config({INVESTOR_ORIGIN:'https://www.smarttec.dev',INVESTOR_PASSWORD_HASH:await hashPassword('export-provenance-test'),INVESTOR_SESSION_SECRET:'P'.repeat(64),VERCEL:'1'});
async function client(){
 const store=new Store(),session=await createSession(store,cfg);
 const headers={origin:cfg.origin,'Content-Type':'application/json',cookie:'__Host-smarttec-investor='+session.cookie};
 const boot=await handle(new Request(cfg.origin+'/api/investor/bootstrap',{headers}),'bootstrap',{cfg,store});assert.equal(boot.status,200);
 headers['x-csrf-token']=(await boot.json()).csrf;
 return (action,{method='GET',body,query=''}={})=>handle(new Request(cfg.origin+'/api/investor/'+action+query,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),action,{cfg,store});
}

test('downloaded model retains exact reviewed scenarios, source provenance and private headers',async()=>{
 const send=await client(),response=await send('model');assert.equal(response.status,200);
 assert.match(response.headers.get('content-disposition'),/^attachment; filename="SmartTec_Model_v6\.1_Verified_Scenarios\.json"$/);
 for(const header of ['cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.match(response.headers.get(header),/no-store/);
 const snapshot=await response.json();assert.deepEqual(snapshot,model);assert.equal(snapshot.version,'6.1');assert.match(snapshot.source.sha256,/^[a-f0-9]{64}$/i);assert.ok(snapshot.reviewedAt);
 assert.ok(snapshot.scenarios.some(s=>s.id==='base'));assert.ok(snapshot.scenarios.some(s=>s.id==='contracted-60'));
});

test('HEAD describes the same private download without a payload',async()=>{
 const send=await client(),get=await send('model'),head=await send('model',{method:'HEAD'});assert.equal(head.status,200);
 for(const header of ['content-type','content-disposition','cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.equal(head.headers.get(header),get.headers.get(header));
 assert.equal((await head.arrayBuffer()).byteLength,0);
});

test('client scenario parameters cannot change the reviewed export',async()=>{
 const send=await client();
 const query=await send('model',{query:'?rate=99&scenario=historical&format=csv'});assert.equal(query.status,200);assert.deepEqual(await query.json(),model);
 const posted=await send('model',{method:'POST',body:{scenario:{rate:99},format:'csv'}});assert.equal(posted.status,405);
 for(const action of ['underwriting-scenario','calculate','compare','price-floor','export']){
  const response=await send(action,{method:'POST',body:{id:'planned-mix',scenario:{rate:99},format:'json'}});assert.equal(response.status,410);
  const body=await response.json();assert.equal(body.modelVersion,model.version);assert.equal(body.url,'/investors#returns');assert.equal(body.result,undefined);assert.equal(body.scenario,undefined);
 }
});
