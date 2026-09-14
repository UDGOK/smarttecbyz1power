import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {model,base,contracted,scenario,assumptions as a,usd,rate,pct,serviceLines} from '../src/smarttec-investor/financial-model.mjs';

const close=(actual,expected,label,tolerance=0.000001)=>assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual} differs from ${expected}`);
const sum=values=>values.reduce((total,value)=>total+value,0);
const npv=(r,cash,times)=>sum(cash.map((amount,n)=>amount/(1+r)**times[n]));
function solveIrr(cash,times){
  const lo=-.9,hi=2;
  assert.ok(npv(lo,cash,times)>0&&npv(hi,cash,times)<0,'IRR is bracketed');
  let lower=lo,upper=hi;
  for(let n=0;n<160;n++){
    const mid=(lower+upper)/2;
    if(npv(mid,cash,times)>0)lower=mid;else upper=mid;
  }
  return (lower+upper)/2;
}
const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const scenarioIds=['downside','base','market','contracted','marketplace-heavy','delayed','maximum-base'];
const nativeHeadlineIrr={downside:-0.17594512626260184,base:-0.028017286912230044,market:0.06643029243912935,contracted:0.0432250490496795,'marketplace-heavy':-0.07061325837996169,delayed:-0.05380501348471056,'maximum-base':0.004867930155241007};
const nativeCapital={downside:6739330.83886309,base:6790216.48975309,market:6862007.11019809,contracted:6810597.70841809,'marketplace-heavy':6908758.90975309,delayed:6864692.235240253,'maximum-base':24848983.836574085};

test('canonical v6.1.1 provenance, scenario scope and display units stay explicit',()=>{
  assert.equal(model.version,'6.1.1');
  assert.equal(model.source.filename,'SmartTec_B300_Investor_Model_v6.1_1.xlsx');
  assert.equal(model.source.sha256,'60ef7ae93c731fecee74e31241dd5e2ac3cf669bb74a0668d57f77796aa179aa');
  assert.equal(model.source.sizeBytes,667333);
  assert.equal(model.source.formulaCount,26721);
  assert.equal(model.source.originalUnchanged,true);
  assert.equal(model.source.nativeExcelVersion,'16.0');
  assert.equal(model.source.nativeExcelBuild,20326);
  assert.equal(model.source.nativeScenarioCopies.length,7);
  assert.deepEqual(model.scenarios.map(s=>s.id),scenarioIds);
  assert.equal(a.primaryReturnMetric,'headlineIrr');
  assert.equal(a.currency,'USD');
  assert.equal(a.ratesAreFractions,true);
  assert.equal(a.allContractedCasesUnsigned,true);
  assert.equal(a.hardwareResaleYear5,.20);
  assert.equal(a.hardwareResaleYear6,.15);
  assert.equal(a.hurdleRate,.15);
  assert.match(a.powerStrategy,/Grid power at launch.*separate future investment.*not included/);
  assert.equal(a.energyUsdPerKwh,.095);
  assert.equal(a.demandUsdPerKwMonth,12);
  assert.equal(a.phase1InternetAnnualUsd,48000);
  assert.match(a.supportCostBasis,/Complete B300 system purchase subtotal/);
  assert.equal(rate(6.5),'$6.50');
  assert.equal(usd(base.capital.totalUsd),'$6,790,216');
  assert.equal(usd(-2981587.7309),'-$2,981,588');
  assert.equal(pct(base.returns.headlineIrr),'-2.80%');
  assert.equal(pct(contracted.returns.headlineIrr),'4.32%');
  assert.equal(pct(null),'Not resolved');
  assert.throws(()=>scenario('invented-profitable-case'),/Unknown reviewed model scenario/);
  assert.equal(serviceLines.length,3);
  assert.match(serviceLines.find(s=>s.name==='Colocation').description,/revenue is excluded/);
  for(const s of model.scenarios){
    close(s.capital.totalUsd,nativeCapital[s.id],`${s.id} native initial funding`);
    close(s.returns.headlineIrr,nativeHeadlineIrr[s.id],`${s.id} native headline IRR`,1e-12);
    assert.ok(s.returns.headlineIrr<a.hurdleRate,`${s.id} remains below the hurdle`);
  }
  assert.equal(model.source.scorecardInconsistency.scenarioId,'delayed');
  close(model.source.scorecardInconsistency.scorecardCapitalOverstatementUsd,4388.2070635557175,'documented delayed Scorecard difference');
});

for(const s of model.scenarios){
  test(`${s.id}: capital components reconcile and fleet/engineering scope remains consistent`,()=>{
    const c=s.capital,t=s.technical,p=s.capacity;
    close(c.serverHardwareUsd,p.nodes*c.nodePriceUsd,'complete system purchase subtotal');
    close(c.hardwareUsd,c.serverHardwareUsd+c.storageAndSparesUsd+c.freightAndTaxUsd,'hardware subtotal');
    close(c.infrastructureUsd,sum(c.infrastructureBreakdown.map(row=>row.amountUsd)),'infrastructure subtotal');
    close(c.cashReserveUsd,c.reserveCostComponentUsd+c.reserveReceivablesComponentUsd,'working capital allowance');
    close(c.totalUsd,c.hardwareUsd+c.infrastructureUsd+c.cashReserveUsd+c.launchTopUpUsd,'initial funding');
    close(c.founderFundingGapUsd,Math.max(0,c.totalUsd-a.initialFounderCapitalUsd),'gap against reported founder funds');
    assert.equal(p.installedGpus,p.nodes*8);
    assert.equal(p.installedGpus,p.saleableGpus+p.heldBackGpus);
    assert.deepEqual([p.nodes,p.installedGpus,p.saleableGpus,p.heldBackGpus],s.id==='maximum-base'?[30,240,225,15]:[8,64,60,4]);
    close(t.billedPeakKw,t.facilityPeakKw*a.demandPeakFactor,'demand billing assumption');
    close(t.facilityPeakKw,t.itKw*t.worstDayPue,'facility peak load');
    close(t.installedCoolingTons,t.chillerCount*t.chillerUnitTons,'nominal installed cooling');
    assert.equal(t.inRowUnitKw,40);
    assert.ok(Math.abs(sum([c.hardwareUsd,c.infrastructureUsd,c.cashReserveUsd,c.launchTopUpUsd].map(Math.round))-Math.round(c.totalUsd))<=2,'whole-dollar display differs by rounding only');
  });

  test(`${s.id}: independently reconstruct revenue, channel fees and support`,()=>{
    const c=s.commercial,p=s.capacity;
    assert.equal(s.annual.length,s.horizonYears);
    assert.equal(c.renewalAssumed,false);
    assert.equal(c.contractMonthsBeyondExit,0);
    for(const y of s.annual){
      const end=y.year*12,start=(y.year-1)*12;
      const op=Math.max(0,Math.min(12,end-c.buildMonths));
      const cm=c.contractedGpus?Math.max(0,Math.min(end,c.buildMonths+c.contractTermMonths)-Math.max(start,c.buildMonths)):0;
      const util=y.year===1?c.merchantUtilizationYear1:c.merchantUtilizationYear2Plus;
      const merchantRate=c.merchantRateYear1Usd*(1+c.annualMerchantRateChange)**(y.year-1);
      const contract=c.contractedGpus*a.annualHours/12*cm*c.contractPaidShare*c.contractRateUsd;
      const expired=c.contractedGpus*a.annualHours/12*(op-cm)*util*merchantRate;
      const merchant=(p.saleableGpus-c.contractedGpus)*a.annualHours/12*op*util*merchantRate;
      assert.equal(y.operatingMonths,op);
      assert.equal(y.contractMonths,cm);
      close(y.contractRevenueUsd,contract,'fixed contract gross billing');
      close(y.expiredContractRevenueUsd,expired,'expired cohort merchant billing');
      close(y.merchantRevenueUsd,merchant,'merchant cohort billing');
      close(y.revenueUsd,contract+expired+merchant,'gross billing total');
      close(y.channelFeesUsd,contract*c.contractCommission+(expired+merchant)*c.blendedMerchantCommission,'scenario-specific channel fees');
      close(y.ebitdaUsd,y.revenueUsd-y.opexUsd,'EBITDA');
      close(y.operatingCashUsd,y.ebitdaUsd-y.operatingTaxUsd-y.bcLlcPaymentUsd,'operating cash after tax/site share');
      const covered=Math.max(0,Math.min(end,c.buildMonths+a.includedSupportMonths)-Math.max(start,c.buildMonths));
      assert.equal(y.includedSupportMonths,covered);
      const support=s.capital.serverHardwareUsd*(covered*a.includedSupportRate+(op-covered)*a.postWarrantySupportRate)/12*(1+a.annualCostInflation)**(y.year-1);
      close(y.supportUsd,support,'support basis and operating-month coverage');
    }
  });

  test(`${s.id}: funded cash includes reserves, invoices, calls and exit components once`,()=>{
    let companyCash=s.capital.cashReserveUsd+s.capital.launchTopUpUsd,previousAr=0;
    const c=s.commercial;
    for(const y of s.annual){
      const util=y.year===1?c.merchantUtilizationYear1:c.merchantUtilizationYear2Plus;
      const price=c.merchantRateYear1Usd*(1+c.annualMerchantRateChange)**(y.year-1);
      const contractInLastMonth=c.contractedGpus>0&&y.year*12<=c.contractServiceEndMonth;
      const contractInvoice=c.contractedGpus*(contractInLastMonth?c.contractPaidShare*c.contractRateUsd:util*price);
      const merchantInvoice=(s.capacity.saleableGpus-c.contractedGpus)*util*price;
      const ar=y.operatingMonths?(contractInvoice+merchantInvoice)*a.annualHours/12*Math.round(a.collectionDays/30):0;
      close(y.receivablesUsd,ar,'last invoice receivable');
      const cashOps=y.operatingCashUsd-(ar-previousAr);
      const calls=Math.max(0,-companyCash-cashOps);
      const target=y.year<s.horizonYears?s.capital.reserveCostComponentUsd+s.capital.launchTopUpUsd:0;
      const distribution=Math.max(0,companyCash+calls+cashOps-target);
      companyCash+=calls+cashOps-distribution;
      close(y.cashFromOperationsUsd,cashOps,'cash after AR movement');
      close(y.capitalCallsUsd,calls,'later capital call');
      close(y.distributionsUsd,distribution,'distribution before disposal');
      close(y.endingCompanyCashUsd,companyCash,'remaining company cash');
      close(y.fundedCashUsd,-calls+distribution+y.terminalCollectionUsd+y.resaleUsd+y.resaleTaxUsd,'funded cash including exit items');
      const terminal=y.year===s.horizonYears;
      close(y.terminalCollectionUsd,terminal?ar:0,'receivables settled once at exit');
      close(y.reserveReleaseUsd,terminal?s.capital.cashReserveUsd+s.capital.launchTopUpUsd:0,'headline reserve release');
      close(y.headlineCashUsd,y.operatingCashUsd+y.resaleUsd+y.resaleTaxUsd+y.reserveReleaseUsd,'headline project cash');
      const resaleRate=s.horizonYears===6?a.hardwareResaleYear6:a.hardwareResaleYear5;
      close(y.resaleUsd,terminal?s.capital.hardwareUsd*resaleRate+s.capital.infrastructureUsd*a.infrastructureResale:0,'gross asset disposal');
      assert.ok(y.resaleTaxUsd<=0,'resale tax is a signed outflow');
      previousAr=ar;
    }
    close(companyCash,0,'company cash released at exit');
    close(sum(s.annual.map(y=>y.capitalCallsUsd)),s.returns.laterCapitalCallsUsd,'later calls total');
    assert.equal(s.returns.laterCapitalCallsUsd>0,s.id==='downside','only Downside requires a later modeled call');
    const initial=s.datedCash.filter(cash=>cash.kind==='initial-capital');
    assert.equal(initial.length,1);
    assert.equal(initial[0].date,a.modelStartDate);
    close(initial[0].amountUsd,-s.capital.totalUsd,'initial contribution');
    const terminal=s.datedCash.filter(cash=>cash.kind==='terminal-receivable');
    assert.equal(terminal.length,1);
    close(terminal[0].amountUsd,s.returns.terminalReceivableUsd,'terminal receivable');
    const sale=new Date(a.modelStartDate+'T00:00:00Z');sale.setUTCFullYear(sale.getUTCFullYear()+s.horizonYears);
    assert.equal(day(terminal[0].date)-sale.getTime()/86400000,a.collectionDays);
    for(const y of s.annual){
      const date=new Date(a.modelStartDate+'T00:00:00Z');date.setUTCFullYear(date.getUTCFullYear()+y.year);
      const dated=s.datedCash.find(cash=>cash.kind==='annual-investor-cash'&&cash.date===date.toISOString().slice(0,10));
      close(dated?.amountUsd??0,y.fundedCashUsd-y.terminalCollectionUsd,'dated annual cash');
    }
    close(sum(s.datedCash.map(c=>c.amountUsd)),-s.capital.totalUsd+sum(s.annual.map(y=>y.headlineCashUsd)),'cash conservation across timing conventions');
  });

  test(`${s.id}: independently solve headline, funded and dated returns`,()=>{
    const r=s.returns,initial=-s.capital.totalUsd;
    const headline=[initial,...s.annual.map(y=>y.headlineCashUsd)];
    const funded=[initial,...s.annual.map(y=>y.fundedCashUsd)];
    const operating=[initial,...s.annual.map(y=>y.operatingCashUsd)];
    const years=headline.map((_,year)=>year);
    const cash=s.datedCash.map(c=>c.amountUsd);
    const elapsed=s.datedCash.map(c=>(day(c.date)-day(a.modelStartDate))/365);
    close(solveIrr(headline,years),r.headlineIrr,'headline IRR',1e-7);
    close(solveIrr(funded,years),r.annualFundedIrr,'annual-funded IRR',1e-7);
    close(solveIrr(cash,elapsed),r.datedFundedIrr,'dated-funded XIRR',1e-7);
    if(r.operatingOnlyIrr===null){
      assert.equal(s.id,'downside');
      assert.ok(operating.slice(1).some(v=>v<0),'unresolved series contains a later operating loss');
    }else close(solveIrr(operating,years),r.operatingOnlyIrr,'operating-only IRR',1e-7);
    close(npv(a.hurdleRate,headline,years),r.npvUsd,'headline NPV');
    close(npv(a.hurdleRate,funded,years),r.annualFundedNpvUsd,'annual-funded NPV');
    close(npv(a.hurdleRate,cash,elapsed),r.datedFundedNpvUsd,'dated-funded NPV');
    close(sum(headline.slice(1))/-initial,r.moic,'headline MOIC');
    close(sum(cash.filter(c=>c>0))/-sum(cash.filter(c=>c<0)),r.fundedMoic,'funded MOIC');
    close(sum(operating.slice(1))/-initial,r.operatingMoic,'operating-only MOIC');
    let unrecovered=-initial,payback=null;
    for(const y of s.annual){if(payback===null&&y.operatingCashUsd>=unrecovered)payback=y.year-1+unrecovered/y.operatingCashUsd;unrecovered-=y.operatingCashUsd;}
    close(Math.max(0,unrecovered),r.unrecoveredOperatingCapitalUsd,'unrecovered operating capital');
    if(payback===null)assert.equal(r.operatingPaybackYears,null);else close(r.operatingPaybackYears,payback,'operating payback');
  });
}

test('workbook-native cases retain their exact commercial conditions',()=>{
  assert.deepEqual(contracted.annual.map(y=>y.contractMonths),[6,12,12,6,0]);
  assert.equal(contracted.commercial.contractServiceStartMonth,7);
  assert.equal(contracted.commercial.contractServiceEndMonth,42);
  assert.equal(contracted.commercial.contractedGpus,40);
  assert.equal(contracted.commercial.contractRateUsd,6.5);
  assert.equal(contracted.commercial.contractPaidShare,.95);
  assert.equal(contracted.commercial.contractTermMonths,36);
  assert.equal(contracted.commercial.merchantRateYear1Usd,7.5);
  assert.equal(contracted.commercial.merchantUtilizationYear1,.4);
  assert.equal(contracted.commercial.merchantUtilizationYear2Plus,.5);
  assert.equal(scenario('marketplace-heavy').commercial.marketplaceShare,1);
  assert.equal(scenario('marketplace-heavy').commercial.blendedMerchantCommission,.25);
  assert.equal(scenario('downside').commercial.annualMerchantRateChange,-.2);
  assert.equal(scenario('delayed').commercial.buildMonths,12);
  assert.ok(scenario('delayed').capital.launchTopUpUsd>0);
});

test('investor annual table separates distributions, operating cash and asset disposal',()=>{
  const page=readFileSync(new URL('../src/pages/investors/index.astro',import.meta.url),'utf8');
  assert.match(page,/<th>Modeled distribution<\/th>/);
  assert.doesNotMatch(page,/<th>Distribution incl\. exit recovery<\/th>/);
  assert.match(page,/Separate post-sale receivable collection/);
  assert.match(page,/Headline project IRR:/);
  const expression=page.match(/Separate net asset-sale cash at exit:\s*\{usd\((s\.annual\.reduce\([\s\S]*?,0\))\)\}/)?.[1];
  assert.ok(expression,'Net disposal is explicitly shown separately');
  const displayedNetSale=new Function('s',`return ${expression};`);
  for(const s of model.scenarios){
    const expected=sum(s.annual.map(y=>y.resaleUsd+y.resaleTaxUsd));
    close(displayedNetSale(s),expected,`${s.id}: net asset sale`);
    assert.ok(displayedNetSale(s)<=sum(s.annual.map(y=>y.resaleUsd)),'sale tax cannot increase proceeds');
  }
});
