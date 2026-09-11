import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario} from '../src/smarttec-investor/underwriting.mjs';
import {makePowerScenario,comparePower,supply} from '../src/smarttec-investor/power-sensitivity.mjs';
test('reported power sensitivity changes only energy price and provenance',()=>{
 const standard=makeScenario('planned-mix'),power=makePowerScenario('planned-mix');
 assert.equal(power.energyRatePerKwh,.07);assert.equal(standard.energyRatePerKwh,.1);
 delete power.underwriting;delete standard.underwriting;power.energyRatePerKwh=.1;
 assert.deepEqual(power,standard);
 assert.equal(supply.exclusiveContinuousKw,null);assert.equal(supply.operatingStatus,null);assert.equal(supply.allInCostScopeVerified,false);
});
test('power benefit reconciles to energy savings without inventing demand savings or revenue',()=>{
 const {original,result,netCashImprovement}=comparePower('planned-mix');
 const energy=original.schedule.reduce((n,m)=>n+m.energyCost,0);
 assert.ok(Math.abs(netCashImprovement-energy*.3)<.001);
 assert.equal(result.totalCollectedNetFees,original.totalCollectedNetFees);
 assert.equal(result.requiredInitialFunding,original.requiredInitialFunding);
 assert.ok(result.project.netProfit<0);
});
