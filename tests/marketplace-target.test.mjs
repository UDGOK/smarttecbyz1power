import fs from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {model} from '../src/smarttec-investor/financial-model.mjs';
import assert from 'node:assert/strict';
const results=JSON.parse(fs.readFileSync(new URL('../docs/model-audit/marketplace-results-2026-09-14.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const npv=(r,flows)=>flows.reduce((s,c,i)=>s+c/(1+r)**i,0);
function irr(flows){let lo=-.9,hi=2;assert(npv(lo,flows)>0&&npv(hi,flows)<0);for(let i=0;i<160;i++){const mid=(lo+hi)/2;if(npv(mid,flows)>0)lo=mid;else hi=mid;}return(lo+hi)/2;}
function close(a,b){assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
for(const [i,s] of results.entries()) test(s.name+' reconciles independently and supplies the published target',()=>{
 let loss=0;
 for(const y of s.annual){
  const revenue=60*8760*(y.year===1?11/12:1)*(y.year===1?s.initialUtilization:.9)*6.5*(1+s.annualPriceChange)**(y.year-1);
  close(y.revenue,revenue);close(y.fees,revenue*.2);
  close(y.opex,['energy','demand','staff','insurance','admin','software','internet','propertyTax','upkeep','support','fees'].reduce((a,k)=>a+y[k],0));
  close(y.ebitda,revenue-y.opex);close(y.operatingIncome,y.ebitda-y.depreciation);
  close(y.priorLoss,loss);
  const opTax=(Math.max(0,y.operatingIncome)-Math.min(loss,.8*Math.max(0,y.operatingIncome)))*.25;
  const totalIncome=y.operatingIncome+y.saleGain;
  const lossUsed=Math.min(loss,.8*Math.max(0,totalIncome));
  const totalTax=(Math.max(0,totalIncome)-lossUsed)*.25;
  close(y.tax,opTax);close(y.saleTax,-(totalTax-opTax));
  close(y.sitePayment,Math.max(0,y.operatingIncome-opTax)*.01);
  close(y.operatingCash,y.ebitda-opTax-y.sitePayment);
  close(y.headlineCash,y.operatingCash+y.resale+y.saleTax+y.reserveRelease);
  loss+=Math.max(0,-totalIncome)-lossUsed;
 }
 const flows=[-s.capital,...s.annual.map(y=>y.headlineCash)];
 close(irr(flows),s.irr);close(npv(.15,flows),s.npv);close(s.cashReconciliation,0);
 const published=model.scenarios[i];close(published.capital.totalUsd,s.capital);close(published.returns.headlineIrr,s.irr);close(published.returns.npvUsd,s.npv);
 for(const [n,y] of s.annual.entries()){close(published.annual[n].revenueUsd,y.revenue);close(published.annual[n].operatingCashUsd,y.operatingCash);close(published.annual[n].headlineCashUsd,y.headlineCash);}
});
test('target source and assumptions are explicit, with no fabricated guaranteed revenue',()=>{
 const raw=fs.readFileSync('docs/model-audit/marketplace-results-2026-09-14.json','utf8').replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(raw).digest('hex'),model.source.sha256);
 assert.equal((model.scenarios[0].returns.headlineIrr*100).toFixed(2),'9.78');
 assert.equal(model.scenarios[0].commercial.marketplaceCommission,.2);
 assert.equal(model.scenarios[0].commercial.guaranteedRevenue,false);
 assert.equal(model.timing.firstBillingPlanned,'2026-11-01');
});
