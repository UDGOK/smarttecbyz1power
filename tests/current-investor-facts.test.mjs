import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {model,base,contracted,assumptions as a} from '../src/smarttec-investor/financial-model.mjs';
import {currentInvestmentFacts,currentSources} from '../src/smarttec-investor/current-facts.mjs';
import {answerQuestion,faqList} from '../src/smarttec-investor/server/faq.mjs';

const dollars=n=>'$'+Math.round(n).toLocaleString('en-US');
const percent=(n,digits=2)=>(n*100).toFixed(digits)+'%';
const fact=id=>{
  const record=currentInvestmentFacts.find(f=>f.id===id);
  assert.ok(record,`${id}: current record exists`);
  const response=answerQuestion(record.question);
  assert.equal(response.reviewedAt,model.reviewedAt);
  const retrieved=response.matches.find(f=>f.id===id);
  assert.ok(retrieved,`${id}: its exact question retrieves the current record`);
  return retrieved;
};

test('public deployment and protected underwriting describe the same proposed fleet',()=>{
  const {publicDeployment:p}=loadTS('src/data/site.ts');
  assert.deepEqual([p.systems,p.gpusPerSystem,p.gpus,p.saleableGpus,p.reserveGpus],
    [base.capacity.nodes,base.capacity.installedGpus/base.capacity.nodes,base.capacity.installedGpus,base.capacity.saleableGpus,base.capacity.heldBackGpus]);
  assert.equal(p.supplier,'Supermicro');
  assert.match(p.status,/Proposed/);
  assert.match(p.cooling,/Direct liquid/i);
  const {campusConcept}=loadTS('src/data/site.ts');
  assert.match(campusConcept.budgetBasis,/v6\.1.*earlier air-cooled.*one-building/);
  assert.match(campusConcept.budgetBasis,/repricing/);
  assert.match(p.demand,/no signed customer contracts/);
  const capacity=fact('F11').answer;
  assert.ok(capacity.includes(`${base.capacity.installedGpus} installed`));
  assert.ok(capacity.includes(`${base.capacity.saleableGpus} saleable`));
  assert.match(capacity,/financial allocation, not a spare eight-GPU node/);
  assert.match(capacity,/revenue cannot be counted twice/);
});

test('funding FAQ uses complete v6.1 categories and scenario-specific working capital',()=>{
  const {answer,sources}=fact('F17');
  for(const amount of [base.capital.totalUsd,base.capital.hardwareUsd,base.capital.infrastructureUsd,base.capital.cashReserveUsd,base.capital.founderFundingGapUsd,contracted.capital.totalUsd]){
    assert.ok(answer.includes(dollars(amount)),`Funding answer omits ${dollars(amount)}`);
  }
  assert.match(answer,/owner-reported \$6m/);
  assert.match(answer,/not firm installed quotations or a fixed outside-investor raise/);
  assert.doesNotMatch(answer,/partialInitialFunding|exclude unknown non-cooling site work/);
  assert.ok(sources.every(s=>s.title));
  assert.ok(sources.some(s=>s.id==='model-v6.1'&&s.title.includes(model.source.sha256)));
});

test('cooling and return FAQs preserve proposed status and use dated funded project returns',()=>{
  const cooling=fact('F07');
  assert.match(cooling.answer,/no working air conditioning/);
  assert.match(cooling.answer,/newly supplied and commissioned/);
  assert.match(cooling.answer,/two nominal 50-ton chillers and five 40-kW/);
  assert.match(cooling.answer,/not installed equipment/);
  const roi=fact('F19');
  assert.ok(roi.answer.includes(percent(base.returns.datedFundedIrr)));
  assert.ok(roi.answer.includes(percent(contracted.returns.datedFundedIrr)));
  assert.match(roi.answer,/No investor-specific return is agreed/);
  assert.match(roi.answer,/hypothetical.*60 months.*95% paid share.*six-year hold/);
  assert.match(roi.answer,/BC LLC/);
  assert.match(roi.answer,/resale/);
});

test('revenue, energy and fee FAQs reflect ramp months, decline and grid-first costs',()=>{
  const revenue=fact('F-revenue-math').answer;
  assert.ok(revenue.includes('$'+base.commercial.merchantRateYear1Usd.toFixed(2)));
  assert.ok(revenue.includes(percent(base.commercial.merchantUtilizationYear1,0)));
  assert.ok(revenue.includes(percent(base.commercial.merchantUtilizationYear2Plus,0)));
  assert.ok(revenue.includes(percent(-base.commercial.annualMerchantRateChange,0)+' annual price decline'));
  for(const y of base.annual.slice(0,2))assert.ok(revenue.includes(dollars(y.revenueUsd)));
  assert.match(revenue,/Six months of construction leave six operating months/);
  assert.match(revenue,/Gross billing is not collected cash or profit/);
  assert.match(revenue,/22\.8 paid hours per day, not observed utilization/);
  const power=fact('F-power').answer;
  assert.ok(power.includes((a.energyUsdPerKwh*100).toFixed(1)+' cents per kWh'));
  assert.ok(power.includes(dollars(a.demandUsdPerKwMonth)+' per billed peak kW per month'));
  assert.ok(power.includes(percent(a.annualCostInflation,0)+' cost inflation'));
  assert.match(power,/Grid at launch/);
  assert.match(power,/Behind-the-meter savings are excluded/);
  const costs=fact('F-costs').answer;
  assert.ok(costs.includes(percent(a.blendedMerchantCommission,1)));
  assert.ok(costs.includes(percent(a.contractCommission,0)));
  assert.ok(costs.includes(`${a.includedSupportMonths} months from first billing`));
  assert.ok(costs.includes(percent(a.postWarrantySupportRate,0)));
  assert.match(costs,/of B300 system purchase cost annually/);
  assert.ok(costs.includes(dollars(a.phase1InternetAnnualUsd/12)+'/month'));
  assert.match(costs,/carrier scope and actual cost require reconciliation/);
  assert.match(costs,/Supplier terms require confirmation/);
});

test('cash and exit FAQs state the actual reserve policy and conditional recovery assumptions',()=>{
  const cash=fact('F-cash').answer;
  assert.ok(cash.includes(`${a.cashReserveMonths} months`));
  assert.ok(cash.includes(`Net-${a.collectionDays}`));
  assert.match(cash,/not an enforced minimum/);
  assert.match(cash,/annual distributions and a separately dated final receivable/);
  const exit=fact('F-exit').answer;
  for(const value of [a.hardwareResaleYear5,a.hardwareResaleYear6,a.infrastructureResale])assert.ok(exit.includes(percent(value,0)));
  assert.match(exit,/unverified exit assumptions/);
  assert.match(exit,/No renewal is assumed/);
});

test('all served FAQ records are unique, sourced and free of missing template values',()=>{
  const list=faqList();
  assert.equal(new Set(list.map(f=>f.id)).size,list.length);
  assert.equal(list.filter(f=>f.id==='F17').length,1);
  assert.deepEqual(list.map(f=>f.id),currentInvestmentFacts.map(f=>f.id));
  for(const f of currentInvestmentFacts){
    assert.doesNotMatch(f.answer,/\bundefined\b|\bNaN\b|\bInfinity\b/);
    assert.equal(f.reviewedAt,model.reviewedAt);
    for(const id of f.sourceIds)assert.ok(currentSources[id]?.title,`${f.id}: missing source ${id}`);
    assert.equal(list.find(item=>item.id===f.id).answer,f.answer);
  }
});
