import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateScenario,npv} from '../src/smarttec-investor/roi-engine.mjs';
import {makeScenario,options,requiredRevenueMultiplier,summarizeOption} from '../src/smarttec-investor/underwriting.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);

for(const option of options)for(const kind of ['base','downside','favorable'])test(`${option.id}/${kind}: independent revenue, cost and cash conservation`,()=>{
  const s=makeScenario(option.id,kind),r=calculateScenario(s);
  let receipts=0,opex=0;
  for(let month=1;month<=60;month++){
    const date=new Date(Date.UTC(2026,8+month+1,0));
    const hours=date.getUTCDate()*24;
    let average=1;
    for(const row of s.rows){
      if(month>=4)average+=row.systems*row.peakKwPerSystem*row.averagePowerFraction;
      const c=row.contracts.find(c=>month>=c.startMonth&&month<=c.endMonth);
      if(c)receipts+=c.rate*row.systems*(c.billing==='gpu_hour'?row.gpusPerSystem*hours:row.billableKwPerSystem)*c.paidOccupancy*.98*.9;
    }
    opex+=(average*1.4*hours*s.energyRatePerKwh+s.monthlyFixedOpex+8075+s.monthlyDemandCharges)*1.03**Math.floor((month-1)/12);
  }
  const purchases=s.rows.reduce((n,row)=>n+row.systems*row.completeSystemCost,0)+s.siteCapex+s.softCosts;
  const later=s.capexEvents.reduce((n,e)=>n+e.cost,0);
  near(receipts,r.totalCollectedNetFees);
  near(receipts-opex-purchases-later-s.exitDecommissionCost,r.project.netProfit);
  near(r.requiredInitialFunding+r.project.additionalContributions,r.project.totalContributed);
  near(r.project.totalDistributed-r.project.totalContributed,r.project.netProfit);
  near(r.schedule.at(-1).project.cashBalance,0);
  if(r.project.annualizedMonthlyIRR!==null)near(npv(r.project.cashFlows,r.project.annualizedMonthlyIRR),0);
});
test('rate hurdle reprices every type and year, not only the introductory ramp segment',()=>{
  const s=makeScenario('planned-mix'),factor=requiredRevenueMultiplier(s);
  const original=structuredClone(s);
  s.rows.forEach(row=>row.contracts.forEach(c=>c.rate*=factor));
  near(calculateScenario(s).project.npv,0);
  assert.ok(factor>1);
  assert.equal(original.rows[0].contracts[0].rate,2.09);
  assert.equal(requiredRevenueMultiplier({...original,rows:original.rows.map(row=>({...row,contracts:[]}))}),null);
});
test('historical plan counts and new conditional alternatives are not conflated',()=>{
  const s=makeScenario('planned-mix');assert.deepEqual(s.rows.map(r=>[r.id,r.systems,r.gpusPerSystem]),[['rtx',2,4],['b300',1,8]]);
  assert.equal(s.rows[0].contracts[0].startMonth,4);
  near(s.rows[0].contracts[2].rate,2.09*.9);
  near(s.rows[0].contracts[5].rate,2.09*.9**4);
  assert.equal(s.exitSaleProceeds,0);assert.equal(s.debt.principal,0);
  assert.throws(()=>makeScenario('invalid'));assert.throws(()=>makeScenario('planned-mix','optimistic-magic'));
});
test('favorable B200 expansion clears hurdle, base and full-replacement stress fail',()=>{
  const base=summarizeOption('b200-scale'),fav=summarizeOption('b200-scale','favorable');
  assert.ok(base.npv<0);assert.ok(fav.npv>0);assert.ok(fav.irr>.15);assert.equal(fav.payback,44);
  assert.ok(fav.fullReplacementNPV<0);
  assert.ok(summarizeOption('b300-scale','favorable').npv<0);
});
test('hosting has zero SmartTec GPU capex and never double-counts GPU rental receipts',()=>{
  const s=makeScenario('customer-hosting');assert.equal(calculateScenario(s).hardwareCapex,0);
  assert.ok(s.rows.every(r=>r.ownership==='customer'&&r.contracts.every(c=>c.billing==='reserved_kw_month')));
  assert.equal(s.monthlyNetworkCost,8075);assert.ok(s.siteCapex>0);
});
