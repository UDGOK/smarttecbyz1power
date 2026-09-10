import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {loadTS} from './helpers/load-ts.mjs';

const source=readFileSync('src/smarttec-investor/client/app.mjs','utf8');
function investor(){
  const requests=[],elements=new Map();
  const context=vm.createContext({structuredClone,requestRevision:0,scenario:{rate:10},result:null,lastScenario:null,illustration:false,
    $:s=>{if(!elements.has(s))elements.set(s,{hidden:true,reportValidity:()=>true,replaceChildren(){},scrollIntoView(){}});return elements.get(s);},
    status(){},cards(){},chart(){},table(){},printAssumptions(){},matchMedia:()=>({matches:true}),
    api:async(action,payload)=>({json:()=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject}))})});
  vm.runInContext(source.slice(source.indexOf('function stale()'),source.indexOf('function field(')),context);
  vm.runInContext(source.slice(source.indexOf('async function calculate('),source.indexOf('async function answer(')),context);
  return {context,requests,calculate:()=>vm.runInContext('calculate()',context),stale:()=>vm.runInContext('stale()',context)};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('editing while calculating cannot display or export an obsolete scenario',async()=>{
  const f=investor(),pending=f.calculate();await tick();
  f.context.scenario.rate=20;f.stale();f.requests[0].resolve({rate:10});await pending;
  assert.equal(f.context.result,null);assert.equal(f.context.lastScenario,null);
  assert.equal(f.requests[0].payload.scenario.rate,10);
});
test('overlapping calculations retain the latest result and matching export snapshot',async()=>{
  const f=investor(),first=f.calculate();await tick();
  f.context.scenario.rate=20;f.stale();const second=f.calculate();await tick();
  f.requests[1].resolve({rate:20});await second;f.requests[0].resolve({rate:10});await first;
  assert.equal(f.context.result.rate,20);assert.equal(f.context.lastScenario.rate,20);
});
test('failed latest calculation keeps previous result unavailable',async()=>{
  const f=investor(),pending=f.calculate();await tick();f.requests[0].reject(new Error('offline'));await pending;
  assert.equal(f.context.result,null);assert.equal(f.context.lastScenario,null);
});

test('planner clears stale results for empty searches and invalid numeric input, and recovers',()=>{
  const {models}=JSON.parse(readFileSync('src/data/models.json','utf8'));
  const model=models[0];
  const dom=new JSDOM(`<main class="doc"><form data-planner>
    <input id="mp-search"><select id="mp-model"><option value="${model.id}">${model.name}</option></select>
    <select id="mp-precision"><option value="fp16">FP16</option></select><select id="mp-workload"><option value="inference">Inference</option></select>
    <input type="number" id="mp-context" value="4096"><input type="number" id="mp-concurrency" value="1">
    <p id="mp-model-hint"></p><p data-out-model></p><p data-out-formula></p><p data-out-total></p>
    <article data-accel="rtx-pro-6000"><b data-accel-count></b><span data-accel-power></span></article>
    </form></main>`);
  const {document}=dom.window;
  loadTS('src/lib/model-planner-ui.ts',{document,fetch:async()=>({ok:false})}).initPlanner();
  const output=()=>document.querySelector('[data-out-total]').textContent;
  const input=(id,value)=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  assert.notEqual(output(),'—');
  input('#mp-search','zz-no-model-zz');assert.equal(output(),'—');assert.equal(document.querySelector('#mp-model').disabled,true);
  assert.equal(document.querySelector('[data-accel-power]').textContent,'—');
  input('#mp-search','');assert.notEqual(output(),'—');assert.equal(document.querySelector('#mp-model').disabled,false);
  for(const value of ['0','','1.5']){input('#mp-concurrency',value);assert.equal(output(),'—');assert.equal(document.querySelector('#mp-concurrency').getAttribute('aria-invalid'),'true');}
  input('#mp-concurrency','2');assert.notEqual(output(),'—');
  input('#mp-context','0');assert.equal(output(),'—');input('#mp-context','4096');assert.notEqual(output(),'—');
  dom.window.close();
});

for(const [name,response,ok] of [
  ['accepted',{ok:true,json:async()=>({success:'true'})},true],
  ['rejected HTTP 200',{ok:true,json:async()=>({success:false,message:'not activated'})},false],
  ['empty acknowledgment',{ok:true,json:async()=>({})},false],
  ['server error',{ok:false},false],
  ['invalid JSON',{ok:true,json:async()=>{throw new Error('invalid JSON');}},false],
]) test(`inquiry delivery: ${name}`,async()=>{
  let sent;
  const mod=loadTS('src/lib/inquiry.ts',{window:globalThis,fetch:async(url,options)=>{sent={url,options};return response;}});
  assert.equal((await mod.submitInquiry({email:'qa@example.invalid',notes:'test'})).ok,ok);
  assert.equal(sent.url,'https://formsubmit.co/ajax/yasir@futonix.com');
  assert.equal(JSON.parse(sent.options.body).notes,'test');
  assert.match(mod.failureMessage('network'),/yasir@futonix.com/);
});
test('inquiry network failure reports failure',async()=>{
  const mod=loadTS('src/lib/inquiry.ts',{window:globalThis,fetch:async()=>{throw new Error('offline');}});
  assert.equal((await mod.submitInquiry({email:'qa@example.invalid'})).ok,false);
});
