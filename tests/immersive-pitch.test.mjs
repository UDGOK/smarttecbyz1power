import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,teamMembers,pitchContact} from '../src/smarttec-investor/data/immersive-pitch.mjs';
import {model,base,market,contracted,maximum,assumptions as a,headlineIrr,usd,millions} from '../src/smarttec-investor/financial-model.mjs';
import team from '../src/data/team.json' with {type:'json'};

const chapter=id=>chapters.find(c=>c.id===id);
const wordCount=text=>text.trim().split(/\s+/).length;

test('immersive story remains concise, complete and free of missing display values',()=>{
  assert.equal(chapters.length,13);
  assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length);
  const visuals=new Set(['fiber','compute','campus']);
  const kinds=new Set(['hero','metrics','fleet','power','site','revenue','budget','cooling','roadmap','team','closing']);
  for(const c of chapters){
    assert.ok(visuals.has(c.visual),c.id);
    assert.ok(kinds.has(c.kind),c.id);
    assert.ok(c.duration>=18&&c.duration<=24,c.id);
    assert.ok(wordCount(c.title)<=8,c.id+' title');
    assert.ok(wordCount(c.eyebrow)<=5,c.id+' eyebrow');
    assert.ok(wordCount(c.lede)<=35,c.id+' lede');
    assert.ok(c.metrics.length<=4&&c.keypoints.length<=3,c.id);
    assert.ok(c.footnote.length>0,c.id);
    for(const item of c.metrics)for(const key of ['label','value','note'])assert.ok(typeof item[key]==='string'&&item[key].trim(),c.id+' '+key);
  }
  assert.doesNotMatch(JSON.stringify(chapters),/\bundefined\b|\bNaN\b|\bInfinity\b/);
});

test('immersive figures use headline IRR as the workbook primary return',()=>{
  assert.equal(a.primaryReturnMetric,'headlineIrr');
  assert.deepEqual(chapter('fleet').metrics.map(item=>item.value),[
    String(base.capacity.installedGpus),String(base.capacity.saleableGpus),String(base.capacity.heldBackGpus),usd(base.capital.nodePriceUsd)
  ]);
  assert.deepEqual(chapter('investment').metrics.map(item=>item.value),[base,market,contracted,maximum].map(item=>(headlineIrr(item)*100).toFixed(2)+'%'));
  assert.equal(chapter('funding-bridge').metrics[3].value,usd(base.capital.totalUsd));
  assert.equal(chapter('founder-capital').metrics[0].value,millions(model.assumptions.initialFounderCapitalUsd));
  assert.ok(headlineIrr(base)<0);
  assert.ok(base.annual.every(year=>year.operatingCashUsd>0));
  assert.match(chapter('investment').lede,/operating cash is positive in every modeled year/);
  assert.match(chapter('investment').lede,/five-year headline IRR remains negative/);
  assert.match(chapter('investment').keypoints.join(' '),/No built-in Phase-1 scenario clears the 15% hurdle/);
  assert.match(chapter('investment').footnote,/Headline project IRR is the workbook primary metric/);
  assert.match(chapter('investment').footnote,/no scenario return is promised to an investor/i);
});

test('commercial and service chapters distinguish assumptions from contracted demand',()=>{
  assert.equal(contracted.commercial.contractedGpus,40);
  assert.equal(contracted.commercial.contractRateUsd,6.5);
  assert.equal(contracted.commercial.contractPaidShare,0.95);
  assert.equal(contracted.commercial.contractTermMonths,36);
  assert.equal(chapter('commercial').metrics[1].value,usd(base.annual[0].revenueUsd));
  assert.equal(chapter('commercial').metrics[2].value,'40 GPUs');
  assert.match(chapter('commercial').metrics[2].note,/\$6\.50.*36 months.*unsigned/);
  assert.match(chapter('commercial').keypoints.join(' '),/40 reserved GPUs with 20 merchant GPUs/);
  assert.match(chapter('commercial').footnote,/Gross billing is not collected cash or profit/);
  assert.deepEqual(chapter('thesis').metrics.map(item=>item.value),['Multi-tenant','Single-tenant','Customer-owned']);
  assert.match(chapter('thesis').keypoints.join(' '),/do not add colocation revenue/);
  assert.match(chapter('commercial').keypoints.join(' '),/no capacity is counted twice/);
  assert.match(chapter('power').lede,/no assumed behind-the-meter savings/);
  assert.match(chapter('cooling').footnote,/not installed capacity/);
  assert.match(chapter('cooling').footnote,/direct-liquid concept cannot replace this budget/i);
  assert.doesNotMatch(JSON.stringify(chapters),/contracted-36|contracted-60|contracted-60-at-650|60 GPUs[^.]*\$7\.50/);
});

test('immersive team roster matches the existing owner-supplied site roster',()=>{
  assert.deepEqual(teamMembers,team);
  assert.deepEqual(chapter('team').team,teamMembers);
  assert.equal(pitchContact.name,'Yasir Jahangir');
  assert.equal(pitchContact.emailHref,'mailto:'+pitchContact.email);
  assert.equal(pitchContact.phoneHref,'tel:+1'+pitchContact.phone.replaceAll('-',''));
});
