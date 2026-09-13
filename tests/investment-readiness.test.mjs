import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {investmentReadiness as r} from '../src/smarttec-investor/investment-readiness.mjs';
import historical from '../src/smarttec-investor/data/owner-deployment-study.json' with {type:'json'};
import {calculateScenario} from '../src/smarttec-investor/roi-engine.mjs';

test('cooling comparisons reconcile independently to scoped line items and one contingency',()=>{
  // Two CDUs, two dry coolers, two chillers, four rear doors, then installed packages.
  const subtotal=2*50000+2*35000+2*120000+4*12000+80000+110000+80000+60000+65000+32000+18000;
  assert.equal(subtotal,903000);
  const full=r.cooling.cases.find(c=>c.id==='full-scope');
  const lower=r.cooling.cases.find(c=>c.id==='lower-cost');
  assert.equal(full.installedCoolingAllowance,subtotal*1.2);
  assert.equal(lower.installedCoolingAllowance,(subtotal-240000+100000-70000)*1.2);
  assert.equal(full.partialInitialFunding,7274101);
  assert.equal(lower.partialInitialFunding,7022101);
  for(const c of r.cooling.cases){
    assert.equal(c.partialInitialFunding,r.hardware.totalCost+r.budget.startupAllowance+r.budget.openingReserve+c.installedCoolingAllowance);
    // The previous combined site allowance must not be added again.
    assert.notEqual(c.partialInitialFunding,5360000+566000+264501+c.installedCoolingAllowance+652800);
    assert.equal(c.additionalFounderContribution,c.partialInitialFunding-6000000);
  }
});

test('founder overage willingness does not turn partial costs into a complete budget or return',()=>{
  assert.equal(r.founderCapital.initialAvailable,6000000);
  assert.equal(r.founderCapital.overageWillingness,true);
  assert.equal(r.status,'incomplete');
  for(const key of ['nonCoolingSiteWork','revisedOpeningReserve','laterCapitalCalls','completeInitialFunding','finalRaise','updatedROI','updatedNPV','updatedPaybackMonth'])assert.equal(r.budget[key],null,key);
  assert.equal(r.cooling.annualCoolingElectricityCost,null);
  assert.equal(r.cooling.incrementalAnnualServiceCost,null);
  assert.equal(r.property.modeledPayment,null);
  assert.equal(r.power.reservedContinuousKW,null);
  assert.equal(r.power.verifiedAllInRate,null);
  const unfinished=structuredClone(historical.cases.find(c=>c.id==='proposed-60-20').scenario);
  unfinished.siteCapex=r.budget.nonCoolingSiteWork;
  assert.throws(()=>calculateScenario(unfinished),/siteCapex/);
});

test('revenue illustration bills only saleable GPUs and establishes no customer minimums',()=>{
  assert.equal(r.hardware.systems*r.hardware.gpusPerSystem,r.hardware.installedGPUs);
  assert.equal(r.hardware.saleableGPUs+r.hardware.reserveGPUs,r.hardware.installedGPUs);
  assert.equal(r.hardware.systems*r.hardware.systemPrice,5360000);
  assert.equal(r.commercial.grossAnnualAtIllustrativePaidHours,60*6.5*20*365);
  assert.equal(r.commercial.grossAnnualAtIllustrativePaidHours,2847000);
  assert.equal(r.commercial.signedCustomerContracts,0);
  assert.equal(r.commercial.paidPilots,0);
  assert.equal(r.commercial.establishedMinimumReceipts,null);
  assert.equal(r.cooling.existingWorkingAirConditioning,false);
});

test('historical planning libraries are not imported by live investor surfaces',()=>{
 for(const file of ['src/pages/investors/index.astro','src/pages/investors/pitch.astro','src/smarttec-investor/server/handlers.mjs','src/smarttec-investor/current-facts.mjs','src/smarttec-investor/data/immersive-pitch.mjs'])assert.doesNotMatch(readFileSync(file,'utf8'),/investment-readiness\.mjs|roi-engine\.mjs|owner-deployment-study\.json/);
});
