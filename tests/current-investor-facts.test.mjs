import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {investmentReadiness as r} from '../src/smarttec-investor/investment-readiness.mjs';
import {currentInvestmentFacts} from '../src/smarttec-investor/current-facts.mjs';
import {answerQuestion,faqList} from '../src/smarttec-investor/server/faq.mjs';
import kb from '../src/smarttec-investor/data/knowledge_base.json' with {type:'json'};

test('public deployment and protected underwriting describe the same proposed fleet',()=>{
  const {publicDeployment:p}=loadTS('src/data/site.ts');
  assert.deepEqual([p.systems,p.gpusPerSystem,p.gpus,p.saleableGpus,p.reserveGpus],
    [r.hardware.systems,r.hardware.gpusPerSystem,r.hardware.installedGPUs,r.hardware.saleableGPUs,r.hardware.reserveGPUs]);
  assert.equal(p.supplier,r.hardware.supplier);
  assert.match(p.status,/Proposed/);
  assert.match(p.cooling,/all cooling is new/);
  assert.match(p.demand,/no signed customer contracts/);
});

test('current FAQ funding answer agrees with the shared partial budget and preserves exclusions',()=>{
  const answer=answerQuestion('How much funding is required?').matches.find(f=>f.id==='F17');
  assert.ok(answer,'Funding question must retrieve the current funding record');
  for(const c of r.cooling.cases)assert.ok(answer.answer.includes('$'+c.partialInitialFunding.toLocaleString('en-US')));
  assert.match(answer.answer,/exclude unknown non-cooling site work/);
  assert.match(answer.answer,/final outside-investor raise are not established/);
  assert.ok(answer.sources.every(s=>s.title));
});

test('FAQ cooling and return answers supersede old installed-capacity and return claims',()=>{
  const cooling=answerQuestion('How much cooling is installed?').matches.find(f=>f.id==='F07');
  assert.match(cooling.answer,/no working air conditioning/);
  assert.match(cooling.answer,/newly supplied and commissioned/);
  const roi=answerQuestion('What ROI will I receive?').matches.find(f=>f.id==='F19');
  assert.match(roi.answer,/not established/);
  assert.match(roi.answer,/BC LLC/);
  const revenue=answerQuestion('What revenue could sixty GPUs generate at $6.50 per hour?').matches.find(f=>f.id==='F-revenue-math');
  assert.match(revenue.answer,/\$2,847,000/);
  assert.match(revenue.answer,/not contracted revenue, collected cash or profit/);
});

test('all served FAQ records are unique, sourced and free of missing template values',()=>{
  const list=faqList();
  assert.equal(new Set(list.map(f=>f.id)).size,list.length);
  assert.equal(list.filter(f=>f.id==='F17').length,1);
  for(const f of [...currentInvestmentFacts,...kb.facts]){
    assert.doesNotMatch(f.answer,/\bundefined\b|\bNaN\b/);
    for(const id of f.sourceIds)assert.ok(kb.sources[id]?.title,`${f.id}: missing source ${id}`);
  }
});
