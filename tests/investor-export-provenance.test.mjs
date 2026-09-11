import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,config,createSession} from '../src/smarttec-investor/server/auth.mjs';
import {handle} from '../src/smarttec-investor/server/handlers.mjs';
import {calculateScenario} from '../src/smarttec-investor/roi-engine.mjs';
import study from '../src/smarttec-investor/data/owner-deployment-study.json' with {type:'json'};
import sample from '../src/smarttec-investor/data/illustrative-scenario.json' with {type:'json'};
import {makeScenario} from '../src/smarttec-investor/underwriting.mjs';
import {makePowerScenario} from '../src/smarttec-investor/power-sensitivity.mjs';

class Store{data=new Map();counts=new Map();async get(k){return this.data.get(k)||null;}async set(k,v){this.data.set(k,v);}async delete(k){this.data.delete(k);}async increment(k){const n=(this.counts.get(k)||0)+1;this.counts.set(k,n);return n;}}
const cfg=config({INVESTOR_ORIGIN:'https://www.smarttec.dev',INVESTOR_PASSWORD_HASH:await hashPassword('export-provenance-test'),INVESTOR_SESSION_SECRET:'P'.repeat(64),VERCEL:'1'});
async function client(){
  const store=new Store();
  const session=await createSession(store,cfg);
  const headers={origin:cfg.origin,'Content-Type':'application/json',cookie:'__Host-smarttec-investor='+session.cookie,'x-csrf-token':session.csrf};
  // Read the CSRF token through the same authenticated bootstrap used by clients.
  const boot=await handle(new Request(cfg.origin+'/api/investor/bootstrap',{headers}),'bootstrap',{cfg,store});
  assert.equal(boot.status,200);
  headers['x-csrf-token']=(await boot.json()).csrf;
  return async(action,body)=>handle(new Request(cfg.origin+'/api/investor/'+action,{method:'POST',headers,body:JSON.stringify(body)}),action,{cfg,store});
}

test('all preset APIs disclose their historical basis without changing scenario values',async()=>{
  const send=await client();
  const cases=[
    [{id:'proposed-60-20',ownerPricing:true},study.cases.find(c=>c.id==='proposed-60-20').scenario],
    [{id:'planned-mix',kind:'base'},makeScenario('planned-mix','base')],
    [{id:'planned-mix',kind:'base',powerBasis:'reported'},makePowerScenario('planned-mix','base')]
  ];
  for(const [body,expected]of cases){
    const response=await send('underwriting-scenario',body);
    assert.equal(response.status,200);
    const loaded=await response.json();
    assert.deepEqual(loaded.scenario,expected);
    assert.equal(loaded.provenance.status,'historical-preset-or-edited-sensitivity');
    assert.equal(loaded.provenance.currentProjectStatus,'incomplete');
    assert.match(loaded.provenance.currentCostDisclosure,/cooling and non-cooling/);
    assert.match(loaded.provenance.currentCostDisclosure,/BC LLC/);
  }
});

test('standalone JSON and CSV exports retain current-cost warnings and identical financial values',async()=>{
  const send=await client();
  const scenario=structuredClone(study.cases.find(c=>c.id==='proposed-60-20').scenario);
  const expected=calculateScenario(scenario);
  const jsonResponse=await send('export',{scenario,format:'json'});
  assert.equal(jsonResponse.status,200);
  const exported=await jsonResponse.json();
  assert.deepEqual(exported.scenario,scenario);
  assert.deepEqual(exported.result,expected);
  assert.equal(exported.provenance.status,'historical-preset-or-edited-sensitivity');
  assert.ok(exported.disclosures.some(d=>/BC LLC/.test(d)&&/No definitive updated project ROI/.test(d)));
  const csvResponse=await send('export',{scenario,format:'csv'});
  assert.equal(csvResponse.status,200);
  const lines=(await csvResponse.text()).split('\r\n');
  assert.equal(lines.length,expected.schedule.length+2);
  assert.match(lines[0],/historical-preset-or-edited-sensitivity/);
  assert.match(lines[0],/BC LLC/);
  assert.match(lines[0],/cooling and non-cooling/);
  assert.match(lines[0],/No definitive updated project ROI/);
  const keys=lines[1].split(',').map(c=>c.slice(1,-1));
  for(const [i,row]of expected.schedule.entries()){
    const values=lines[i+2].split(',').map(c=>Number(c.slice(1,-1)));
    assert.deepEqual(values,keys.map(key=>row[key]));
  }
});

test('custom and illustration exports preserve their own basis and disclose unresolved project economics',async()=>{
  const send=await client();
  for(const illustration of [false,true]){
    const response=await send('export',{scenario:sample,format:'json',illustration});
    assert.equal(response.status,200);
    const exported=await response.json();
    assert.equal(exported.provenance.status,illustration?'historical-illustration':'user-entered-sensitivity');
    assert.match(exported.provenance.currentCostDisclosure,/Current project costs remain incomplete/);
    assert.equal(exported.provenance.currentProjectStatus,'incomplete');
    if(illustration){assert.ok(exported.provenance.notes.length>0);assert.match(exported.provenance.basis,/RTX-only/);}
  }
});
