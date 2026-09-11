import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,teamMembers,pitchContact} from '../src/smarttec-investor/data/immersive-pitch.mjs';
import {investmentReadiness as r} from '../src/smarttec-investor/investment-readiness.mjs';
import {loadTS} from './helpers/load-ts.mjs';

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

test('immersive financial metrics reconcile to readiness without reviving historical returns',()=>{
  const full=r.cooling.cases.find(c=>c.id==='full-scope'),lower=r.cooling.cases.find(c=>c.id==='lower-cost');
  assert.deepEqual(chapter('fleet').metrics.map(m=>m.value),[String(r.hardware.installedGPUs),String(r.hardware.saleableGPUs),String(r.hardware.reserveGPUs),money(r.hardware.systemPrice)]);
  assert.equal(chapter('founder-capital').metrics[0].value,'$'+(r.founderCapital.initialAvailable/1e6).toFixed(2)+'m');
  assert.equal(chapter('founder-capital').metrics[1].value,'$'+(r.hardware.totalCost/1e6).toFixed(2)+'m');
  assert.deepEqual(chapter('cooling').metrics.slice(0,2).map(m=>m.value),[money(full.installedCoolingAllowance),money(lower.installedCoolingAllowance)]);
  assert.deepEqual(chapter('funding-bridge').metrics.map(m=>m.value),[money(full.partialInitialFunding),money(lower.partialInitialFunding),money(full.additionalFounderContribution),money(lower.additionalFounderContribution)]);
  assert.match(chapter('funding-bridge').footnote,/unknown non-cooling site work, reserve revisions and later capital calls/);
  for(const value of [r.budget.startupAllowance,r.budget.openingReserve,r.budget.oldCombinedSiteAllowance])assert.ok(chapter('funding-bridge').keypoints.join(' ').includes(money(value)));
  assert.equal(chapter('site-rights').metrics[0].value,r.property.siteAgreementYears+' years');
  assert.equal(chapter('site-rights').metrics[1].value,(r.property.annualPaymentFraction*100).toFixed(0)+'%');
  assert.match(chapter('site-rights').metrics[1].note,/profit after expenses/);
  assert.equal(r.budget.updatedROI,null);
  assert.equal(chapter('investment').metrics[0].value,'Not established');
  assert.doesNotMatch(JSON.stringify(chapters),/28\.7%|month-49|\$604,000|\$7\.03|guaranteed (?:profit|return)/i);
});

test('revenue chapter preserves reserve exclusion and uncontracted pricing and demand',()=>{
  const c=chapter('commercial');
  const expected=r.hardware.saleableGPUs*r.commercial.illustrativePaidHoursPerDay*r.commercial.proposedGrossRatePerGPUHour*r.commercial.daysPerYear;
  assert.equal(c.metrics[0].value,money(expected));
  assert.match(c.metrics[0].note,/Uncontracted/);
  assert.match(c.metrics[1].note,/Host receipts versus customer price unresolved/);
  assert.equal(c.metrics[3].value,String(r.commercial.signedCustomerContracts));
  assert.equal(c.metrics[3].value,'0');
  assert.match(c.footnote,/No binding minimum receipts/);
  assert.match(chapter('cooling').metrics[0].note,/not minimum pricing/);
  assert.match(chapter('cooling').metrics[1].note,/Hypothetical/);
});

test('immersive team roster matches the existing owner-supplied site roster',()=>{
  const {team}=loadTS('src/data/team.ts');
  assert.deepEqual(teamMembers.map(p=>[p.name,p.role]),team.map(p=>[p.name,p.role]));
  assert.deepEqual(chapter('team').team,teamMembers);
  assert.equal(pitchContact.name,'Yasir Jahangir');
  assert.equal(pitchContact.emailHref,'mailto:'+pitchContact.email);
  assert.equal(pitchContact.phoneHref,'tel:+1'+pitchContact.phone.replaceAll('-',''));
});
