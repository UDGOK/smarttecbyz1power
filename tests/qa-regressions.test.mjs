import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {loadTS} from './helpers/load-ts.mjs';

test('investor room cannot revive retired editable financial engines',()=>{
 const page=readFileSync('src/pages/investors/index.astro','utf8');
 const client=readFileSync('src/smarttec-investor/client/app.mjs','utf8');
 assert.doesNotMatch(page,/inv-calculator|data-underwriting-option|inv-import|inv-equipment-rows/);
 assert.doesNotMatch(client,/importScenario|calculateScenario|roi-engine|inv-price-floor/);
 assert.match(page,/data-model-source=\{model.source.sha256\}/);
 assert.match(page,/currentInvestmentFacts.map/,'Curated FAQ remains readable without JavaScript');
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
