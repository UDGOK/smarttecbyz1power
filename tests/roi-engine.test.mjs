import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateScenario,periodHours,npv,annualizedMonthlyIRR,requiredRateForNPV} from '../src/smarttec-investor/roi-engine.mjs';

function fixture() {
  // Synthetic arithmetic fixture. Not hardware pricing, a budget or a forecast.
  return {schemaVersion:1,startMonth:'2026-01',horizonMonths:12,siteCapex:0,softCosts:0,openingReserve:0,
    monthlyFixedOpex:0,monthlyNetworkCost:0,networkCommitmentMonths:0,monthlyDemandCharges:0,
    energyRatePerKwh:0,pue:1,extraITPeakKw:0,extraITAverageFraction:0,annualOpexEscalation:0,
    annualDiscountRate:0,exitSaleProceeds:0,exitDecommissionCost:0,exitOtherLiabilities:0,
    investorProRataFraction:null,debt:{principal:0,annualRate:0,termMonths:12},capexEvents:[],
    rows:[{id:'test',ownership:'owned',systems:1,completeSystemCost:1200,gpusPerSystem:4,
      peakKwPerSystem:1,averagePowerFraction:1,operatingStartMonth:1,operatingEndMonth:12,
      contracts:[{startMonth:1,endMonth:12,billing:'system_month',rate:120,paidOccupancy:1,
        collectionFraction:1,salesFeeFraction:0,annualRateEscalation:0,collectionLagMonths:0}]}]};
}
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('negative annual price changes model decay and reject prices below zero',()=>{
  const s=fixture();s.horizonMonths=24;s.rows[0].operatingEndMonth=24;
  Object.assign(s.rows[0].contracts[0],{endMonth:24,annualRateEscalation:-.1});
  const r=calculateScenario(s);near(r.schedule[11].billed,120);near(r.schedule[12].billed,108);near(r.totalBilled,12*(120+108));
  s.rows[0].contracts[0].annualRateEscalation=-1;near(calculateScenario(s).schedule[12].billed,0);
  s.rows[0].contracts[0].annualRateEscalation=-1.01;assert.throws(()=>calculateScenario(s),/annualRateEscalation/);
});
test('simple return and payback are independently checkable',()=>{
  const r=calculateScenario(fixture());near(r.project.netProfit,240);near(r.project.totalROI,.2);
  near(r.project.equityMultiple,1.2);assert.equal(r.project.sustainedPaybackMonth,10);
});
test('opening reserve is returned once, not free profit',()=>{
  const s=fixture();s.openingReserve=500;const r=calculateScenario(s);
  near(r.project.totalContributed,1700);near(r.project.totalDistributed,1940);near(r.project.netProfit,240);
});
test('losses consume reserve before additional capital calls',()=>{
  const s=fixture();s.openingReserve=100;s.monthlyFixedOpex=140;
  const r=calculateScenario(s);near(r.project.additionalContributions,140);near(r.project.netProfit,-1440);
  assert.equal(r.project.sustainedPaybackMonth,null);
});
test('expired contracts do not renew silently',()=>{
  const s=fixture();s.rows[0].contracts[0].endMonth=6;const r=calculateScenario(s);
  near(r.totalBilled,720);near(r.schedule[6].billed,0);
});
test('overlapping contracts are rejected',()=>{
  const s=fixture();s.rows[0].contracts.push({...s.rows[0].contracts[0],startMonth:6});
  assert.throws(()=>calculateScenario(s),/Overlapping/);
});
test('GPU hourly units include GPUs per system and actual month hours',()=>{
  const s=fixture();Object.assign(s.rows[0].contracts[0],{billing:'gpu_hour',rate:2,paidOccupancy:.5});
  const r=calculateScenario(s);near(r.schedule[0].billed,4*744*2*.5);near(r.totalBilled,4*8760*2*.5);
});
test('leap February and year rollover use calendar hours',()=>{
  assert.equal(periodHours('2028-02',1),696);assert.equal(periodHours('2026-12',2),744);
});
test('PUE applied once; zero paid occupancy does not mean zero power',()=>{
  const s=fixture();s.rows[0].contracts[0].paidOccupancy=0;s.pue=1.5;s.energyRatePerKwh=.1;
  const r=calculateScenario(s);near(r.schedule[0].facilityKwh,744*1.5);near(r.schedule[0].energyCost,111.6);
});
test('customer-owned hosting does not charge SmartTec for the hardware',()=>{
  const s=fixture();Object.assign(s.rows[0],{ownership:'customer',completeSystemCost:0,billableKwPerSystem:5});
  Object.assign(s.rows[0].contracts[0],{billing:'reserved_kw_month',rate:100});s.siteCapex=500;
  const r=calculateScenario(s);near(r.hardwareCapex,0);near(r.totalBilled,6000);
});
test('Cerebras-style system/token sales do not invent GPU equivalents',()=>{
  const s=fixture();s.rows[0].gpusPerSystem=null;
  Object.assign(s.rows[0].contracts[0],{billing:'million_tokens',rate:1,measuredBillableTokensPerSecondPerSystem:1000});
  near(calculateScenario(s).schedule[0].billed,1000*3600*744/1e6);
});
test('collection delay moves receipts without extending revenue',()=>{
  const s=fixture();Object.assign(s.rows[0].contracts[0],{endMonth:11,collectionLagMonths:1});
  const r=calculateScenario(s);near(r.schedule[0].collectedNetFees,0);near(r.schedule[11].collectedNetFees,120);near(r.totalCollectedNetFees,1320);
});
test('missing quote is rejected instead of converted to zero',()=>{
  const s=fixture();s.rows[0].completeSystemCost=null;assert.throws(()=>calculateScenario(s),/finite number/);
});
test('network commitments and receivables beyond horizon are rejected',()=>{
  const s=fixture();s.networkCommitmentMonths=60;assert.throws(()=>calculateScenario(s),/horizon/);
  s.networkCommitmentMonths=0;s.rows[0].contracts[0].collectionLagMonths=1;assert.throws(()=>calculateScenario(s),/horizon/);
});
test('interest-free financing separates equity funding and project return',()=>{
  const s=fixture();s.debt.principal=600;const r=calculateScenario(s);
  near(r.equity.initialContribution,600);near(r.equity.netProfit,240);near(r.project.totalROI,.2);near(r.equity.totalROI,.4);
});
test('outstanding debt is settled at exit',()=>{
  const s=fixture();s.debt={principal:600,annualRate:0,termMonths:24};const r=calculateScenario(s);
  near(r.schedule[11].debtBalloon,300);near(r.equity.netProfit,240);
});
test('refresh and decommission costs reduce profit dollar-for-dollar',()=>{
  const s=fixture();s.capexEvents=[{month:6,cost:200}];s.exitDecommissionCost=40;
  near(calculateScenario(s).project.netProfit,0);
});
test('pro rata investment fraction scales contributions and distributions',()=>{
  const s=fixture();s.investorProRataFraction=.1;const r=calculateScenario(s);
  near(r.investor.initialContribution,120);near(r.investor.totalDistributed,144);near(r.investor.totalROI,.2);
});
test('IRR is annualized and ambiguous cash flows are not cherry-picked',()=>{
  const cf=[-100,...Array(11).fill(0),110];near(annualizedMonthlyIRR(cf),.1);
  assert.equal(annualizedMonthlyIRR([-100,230,-132]),null);near(npv(cf,.1),0);
});
test('price floor solves NPV using all modeled costs',()=>{
  const s=fixture();near(requiredRateForNPV(s,'test'),100);
  s.rows[0].contracts[0].paidOccupancy=0;assert.equal(requiredRateForNPV(s,'test'),null);
});
