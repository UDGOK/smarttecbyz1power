import supply from './data/power-supply.json' with {type:'json'};
import {makeScenario} from './underwriting.mjs';
import {calculateScenario} from './roi-engine.mjs';

export {supply};
export function makePowerScenario(id,kind='base') {
  const s=makeScenario(id,kind);
  s.energyRatePerKwh=supply.sensitivityRatePerKwh;
  s.underwriting.powerSupply=structuredClone(supply);
  s.underwriting.status='Owner-reported power-price sensitivity; agreement and full cost scope not verified';
  s.underwriting.assumptions=[...s.underwriting.assumptions,
    'POWER OVERRIDE: $0.07/kWh energy input replaces the original energy price. This is a ceiling sensitivity to the owner-reported below-7-cent agreement, not a verified delivered all-in cost. It still escalates 3% annually. Opening reserve and all other inputs are unchanged.',
    'No savings in demand charges, new generation/storage capex, fuel, maintenance, replacement, charging losses, power revenue or earlier commissioning are assumed. If these costs fall to SmartTec, enter them before treating this as a complete business case. Firm exclusive kW, operating date and agreement term remain unknown.'
  ];
  return s;
}
export function comparePower(id,kind='base') {
  const original=calculateScenario(makeScenario(id,kind)),scenario=makePowerScenario(id,kind),result=calculateScenario(scenario);
  return {scenario,result,original,netCashImprovement:result.project.netProfit-original.project.netProfit};
}
