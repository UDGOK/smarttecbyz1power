import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {model,base,maximum,assumptions as a,headlineIrr} from '../src/smarttec-investor/financial-model.mjs';
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
  assert.match(campusConcept.budgetBasis,/v6\.1.*air-cooled.*one-building/i);
  assert.match(campusConcept.budgetBasis,/repric/i);
  assert.match(p.demand,/no signed customer contracts/i);
  const capacity=fact('F11').answer;
  assert.ok(capacity.includes(`${base.capacity.installedGpus} installed`));
  assert.ok(capacity.includes(`${base.capacity.saleableGpus} saleable`));
  assert.match(capacity,/financial allocation, not a spare eight-GPU node/);
  assert.match(capacity,/revenue cannot be counted twice/);
});

test('current funding, cash, commercial terms and timing remain aligned',()=>{
 const funding=fact('F17').answer;
 for(const v of [base.capital.totalUsd,base.capital.hardwareUsd,base.capital.infrastructureUsd,base.capital.cashReserveUsd,base.capital.founderFundingGapUsd])assert.ok(funding.includes(dollars(v)));
 const roi=fact('F19').answer;assert.match(roi,/9.78%/);assert.match(roi,/20% marketplace fee/);assert.match(roi,/below the hurdle/);assert.match(roi,/No investor-specific/);
 const revenue=fact('F-revenue-math').answer;
 for(const y of base.annual.slice(0,2))assert.ok(revenue.includes(dollars(y.revenueUsd)));
 assert.match(revenue,/not uptime/);assert.match(fact('F-costs').answer,/20% marketplace fee/);
 assert.match(fact('F-date').answer,/November 1, 2026/);assert.match(fact('F-date').answer,/October 1/);
 assert.match(fact('F-exit').answer,/Years 4–5 assume/);assert.match(fact('F07').answer,/requires repricing/);
 assert.match(fact('F-scale').answer,/historical v6.1.1 inputs/);
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
