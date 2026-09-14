import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,teamMembers,pitchContact} from '../src/smarttec-investor/data/immersive-pitch.mjs';
import {model,base,market,downside,maximum,assumptions as a,headlineIrr,usd,millions} from '../src/smarttec-investor/financial-model.mjs';
import team from '../src/data/team.json' with {type:'json'};

const chapter=id=>chapters.find(c=>c.id===id);
const wordCount=text=>text.trim().split(/\s+/).length;

test('immersive story remains concise, complete and free of missing display values',()=>{
  assert.equal(chapters.length,14);
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

test('immersive target metrics match current recalculated scenarios',()=>{
 assert.deepEqual(chapter('investment').metrics.slice(0,3).map(m=>m.value),[base,downside,market].map(s=>(s.returns.headlineIrr*100).toFixed(2)+'%'));
 assert.equal(chapter('investment').metrics[0].value,'9.78%');
 assert.equal(chapter('funding-bridge').metrics[3].value,usd(base.capital.totalUsd));
 assert.match(chapter('investment').keypoints.join(' '),/20%.*15%/);
 assert.match(chapter('investment').footnote,/not guaranteed investor returns/);
 assert.match(chapter('commercial').footnote,/not take-or-pay/);
 assert.deepEqual(chapter('commercial').metrics.map(m=>m.value),['$6.50','90%','20%','$5.20']);
 assert.match(chapter('delivery').metrics[0].value,/Nov 1, 2026/);
 assert.match(chapter('fleet').lede,/requires repricing/);
});

test('immersive team roster matches the existing owner-supplied site roster',()=>{
  assert.deepEqual(teamMembers,team);
  assert.deepEqual(chapter('team').team,teamMembers);
  assert.equal(pitchContact.name,'Yasir Jahangir');
  assert.equal(pitchContact.emailHref,'mailto:'+pitchContact.email);
  assert.equal(pitchContact.phoneHref,'tel:+1'+pitchContact.phone.replaceAll('-',''));
});
