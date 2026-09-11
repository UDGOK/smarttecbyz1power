import {writeFileSync,mkdirSync} from 'node:fs';
import study from '../src/smarttec-investor/data/owner-deployment-study.json' with {type:'json'};
import {calculateScenario} from '../src/smarttec-investor/roi-engine.mjs';
const candidate=study.cases.find(c=>c.id==='proposed-60-20');
const scenario=candidate.scenario,result=calculateScenario(scenario);
const annual=Array.from({length:5},(_,i)=>{
 const months=result.schedule.slice(i*12,i*12+12);
 const sum=k=>months.reduce((n,m)=>n+m[k],0);
 return {year:i+1,billed:sum('billed'),receipts:sum('collectedNetFees'),opex:sum('energyCost')+sum('nonEnergyCost'),operatingCash:sum('operatingCash'),capex:sum('capex'),netDistributions:result.project.cashFlows.slice(i*12+1,i*12+13).reduce((n,v)=>n+v,0)};
});
const replacement=structuredClone(scenario);replacement.capexEvents[0].cost=5360000;
mkdirSync('tmp/pdfs',{recursive:true});
writeFileSync('tmp/pdfs/deck-financials.json',JSON.stringify({scenario,result,annual,study,fullReplacementNPV:calculateScenario(replacement).project.npv},null,2));
