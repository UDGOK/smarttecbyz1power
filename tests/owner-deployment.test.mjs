import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnerScenario} from '../src/smarttec-investor/owner-deployment.mjs';
import {calculateScenario} from '../src/smarttec-investor/roi-engine.mjs';
import study from '../src/smarttec-investor/data/owner-deployment-study.json' with {type:'json'};
const close=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);

test('owner prices purchase complete eight-GPU systems and reserves never create sales',()=>{
 const s=buildOwnerScenario({b300:8,rtx:0,hours:20,reserve:'half'});
 assert.equal(s.rows.reduce((n,r)=>n+r.systems*r.completeSystemCost,0),5360000);
 const r=calculateScenario(s);
 // Calendar-independent aggregate: 57 operating months with the exact engine dates.
 const days=r.schedule.slice(3).reduce((n,m)=>n+new Date(Date.UTC(2026,9+m.month,0)).getUTCDate(),0);
 close(r.totalCollectedNetFees,60*20*6.5*days*.98*.9);
 close(r.schedule[0].billed,0);
 const spare=buildOwnerScenario({b300:1,rtx:1,reserve:'node'});
 assert.equal(spare.rows.reduce((n,r)=>n+r.systems*r.completeSystemCost,0),840000);
 assert.ok(spare.rows.every(r=>r.gpusPerSystem===8&&r.contracts.length===0));
 const idle=calculateScenario(spare);assert.equal(idle.totalCollectedNetFees,0);
 assert.ok(idle.schedule[3].energyCost>0);
});

test('published owner cases reconcile to cash conservation and stress results',()=>{
 for(const c of study.cases){
  assert.deepEqual(c.scenario,buildOwnerScenario(c));
  const r=calculateScenario(c.scenario);
  close(c.result.profit,r.project.totalDistributed-r.project.totalContributed);
  close(c.result.npv,r.project.npv);
  close(c.result.totalFunding,r.project.totalContributed);
  if(c.hardwareNegotiation){
   const target=c.hardwareNegotiation;
   assert.ok(calculateScenario(target.scenario).project.npv>=0);
   assert.ok(target.scenario.rows.every(row=>row.completeSystemCost<=670000));
  }
  close(c.declineNPV,calculateScenario(buildOwnerScenario({...c,decline:-.1})).project.npv);
  close(c.extraOperationsNPV,calculateScenario(buildOwnerScenario({...c,extraOps:10000})).project.npv);
  const priced=structuredClone(c.scenario);
  priced.rows.forEach(row=>row.contracts.forEach(contract=>contract.rate=Math.ceil(c.priceRequired*100)/100));
  assert.ok(calculateScenario(priced).project.npv>=0,'Rounded-up price must actually meet the hurdle');
 }
});

test('exhaustive search proves minimums within its stated bounds',()=>{
 let tested=0;
 for(const g of study.groups){let best=null;
  for(let nodes=1;nodes<=16;nodes++)for(let b300=0;b300<=nodes;b300++){
   const r=calculateScenario(buildOwnerScenario({b300,rtx:nodes-b300,hours:g.hours,reserve:g.reserve}));tested++;
   if(r.project.npv>=0){assert.ok(nodes*8>64);const candidate={installed:nodes*8,b300,rtx:nodes-b300,totalFunding:r.project.totalContributed};
    if(!best||candidate.installed<best.installed||(candidate.installed===best.installed&&candidate.totalFunding<best.totalFunding))best=candidate;
   }
  }
  assert.equal(g.minimum?.installed??null,best?.installed??null);
  assert.equal(g.minimum?.b300??null,best?.b300??null);
 }
 assert.equal(tested,912);assert.equal(study.tested,tested);
});

test('search rejects fractional systems and unsupported utilization assumptions',()=>{
 for(const params of [{b300:1.5,rtx:0},{b300:17,rtx:0},{b300:1,rtx:0,hours:25},{b300:1,rtx:0,extraOps:-1}])assert.throws(()=>buildOwnerScenario(params));
});
