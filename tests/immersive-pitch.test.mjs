import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,teamMembers,pitchContact} from '../src/smarttec-investor/data/immersive-pitch.mjs';
import {model,base,contracted,scenario,pct,usd,millions} from '../src/smarttec-investor/financial-model.mjs';
import team from '../src/data/team.json' with {type:'json'};

const chapter=id=>chapters.find(c=>c.id===id);
const money=value=>'$'+value.toLocaleString('en-US');
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
    for(const metric of c.metrics)for(const key of ['label','value','note'])assert.ok(typeof metric[key]==='string'&&metric[key].trim(),c.id+' '+key);
  }
  assert.doesNotMatch(JSON.stringify(chapters),/\bundefined\b|\bNaN\b/);
});

test('immersive figures use the reviewed model with consistent return timing',()=>{
 assert.deepEqual(chapter('fleet').metrics.map(m=>m.value),['64','60','4',usd(base.capital.nodePriceUsd)]);
 assert.deepEqual(chapter('investment').metrics.map(m=>m.value),['base','contracted-36','contracted-60-at-650','contracted-60'].map(id=>pct(scenario(id).returns.datedFundedIrr)));
 assert.equal(chapter('funding-bridge').metrics[3].value,usd(base.capital.totalUsd));
 assert.equal(chapter('founder-capital').metrics[0].value,millions(model.assumptions.initialFounderCapitalUsd));
 assert.ok(base.returns.datedFundedIrr<0);
 assert.match(chapter('investment').footnote,/not promised investor returns/);
 assert.doesNotMatch(JSON.stringify(chapters),/28\.7%|month-49|\$7,274,101|\$7,022,101|below.?7|\$2,847,000/i);
});
test('commercial and service chapters distinguish assumptions from contracted demand',()=>{
 assert.equal(chapter('commercial').metrics[1].value,usd(base.annual[0].revenueUsd));
 assert.equal(chapter('commercial').metrics[3].value,'0');
 assert.match(chapter('commercial').footnote,/Gross billing is not collected cash or profit/);
 assert.deepEqual(chapter('thesis').metrics.map(m=>m.value),['Multi-tenant','Single-tenant','Customer-owned']);
 assert.match(chapter('thesis').keypoints.join(' '),/do not add colocation revenue/);
 assert.match(chapter('investment').keypoints.join(' '),/95% paid share/);
 assert.match(chapter('power').lede,/no assumed behind-the-meter savings/);
 assert.match(chapter('cooling').footnote,/not installed capacity/);
});

test('immersive team roster matches the existing owner-supplied site roster',()=>{
  assert.deepEqual(teamMembers,team);
  assert.deepEqual(chapter('team').team,teamMembers);
  assert.equal(pitchContact.name,'Yasir Jahangir');
  assert.equal(pitchContact.emailHref,'mailto:'+pitchContact.email);
  assert.equal(pitchContact.phoneHref,'tel:+1'+pitchContact.phone.replaceAll('-',''));
});
