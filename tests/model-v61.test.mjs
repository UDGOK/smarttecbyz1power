import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {model,base,contracted,scenario,assumptions as a,usd,rate,pct,serviceLines} from '../src/smarttec-investor/financial-model.mjs';

const close=(actual,expected,label,tolerance=0.000001)=>assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual} differs from ${expected}`);
const sum=values=>values.reduce((total,value)=>total+value,0);
const npv=(r,cash,times)=>sum(cash.map((amount,n)=>amount/(1+r)**times[n]));
function solveIrr(cash,times){
  let lo=-0.9,hi=2;
  assert.ok(npv(lo,cash,times)>0&&npv(hi,cash,times)<0,'IRR is bracketed');
  for(let n=0;n<160;n++){
    const mid=(lo+hi)/2;
    if(npv(mid,cash,times)>0)lo=mid;else hi=mid;
  }
  return (lo+hi)/2;
}
const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const contractIds=['contracted-36','contracted-60','contracted-60-at-650'];

test('canonical v6.1 provenance, scenario scope and display units stay explicit',()=>{
  assert.equal(model.version,'6.1');
  assert.equal(model.source.sha256,'297c9fa394193d02871016b8f1d9b7586f1d62df4483efd7ea69acaedd421c4e');
  assert.equal(model.source.formulaCount,26721);
  assert.equal(model.source.originalUnchanged,true);
  assert.equal(model.source.nativeExcelVersion,'16.0');
  assert.deepEqual(model.scenarios.map(s=>s.id),['base',...contractIds,'delayed','maximum-base']);
  assert.equal(a.primaryReturnMetric,'datedFundedIrr');
  assert.equal(a.currency,'USD');
  assert.equal(a.ratesAreFractions,true);
  assert.equal(a.allContractedCasesUnsigned,true);
  assert.equal(a.hardwareResaleYear5,0.20);
  assert.equal(a.hardwareResaleYear6,0.15);
  assert.equal(a.hurdleRate,0.15);
  assert.match(a.powerStrategy,/Grid power at launch.*separate future investment.*not included/);
  assert.equal(a.energyUsdPerKwh,0.095);
  assert.equal(a.demandUsdPerKwMonth,12);
  assert.equal(a.phase1InternetAnnualUsd,48000);
  assert.match(a.supportCostBasis,/Complete B300 system purchase subtotal/);
  assert.equal(rate(6.5),'$6.50');
  assert.equal(usd(base.capital.totalUsd),'$6,934,755');
  assert.equal(usd(-3100285.9109),'-$3,100,286');
  assert.equal(pct(base.returns.datedFundedIrr),'-3.12%');
  assert.equal(pct(contracted.returns.datedFundedIrr),'21.25%');
  assert.equal(pct(null),'Not resolved');
  assert.throws(()=>scenario('invented-profitable-case'),/Unknown reviewed model scenario/);
  assert.equal(serviceLines.length,3);
  assert.match(serviceLines.find(s=>s.name==='Colocation').description,/revenue is excluded/);
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
    const roundedParts=[c.hardwareUsd,c.infrastructureUsd,c.cashReserveUsd,c.launchTopUpUsd].map(Math.round);
    assert.ok(Math.abs(sum(roundedParts)-Math.round(c.totalUsd))<=2,'whole-dollar display may differ by rounding only');
  });

  test(`${s.id}: independently reconstruct revenue, channel fees and support across ramp/contract expiry`,()=>{
    const c=s.commercial,p=s.capacity;
    assert.equal(s.annual.length,s.horizonYears);
    assert.equal(c.renewalAssumed,false);
    assert.equal(c.contractMonthsBeyondExit,0);
    if(c.contractedGpus){
      assert.equal(s.status,'hypothetical-unsigned');
      assert.equal(c.contractedGpus,60);
      assert.equal(c.contractPaidShare,0.95);
      assert.equal(c.contractServiceStartMonth,c.buildMonths+1);
      assert.equal(c.contractServiceEndMonth,c.buildMonths+c.contractTermMonths);
      assert.ok(c.contractServiceEndMonth<=s.horizonYears*12,'contract obligations end before disposal');
    }
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
      close(y.merchantRevenueUsd,merchant,'original merchant cohort billing');
      close(y.revenueUsd,contract+expired+merchant,'gross billing total');
      close(y.channelFeesUsd,contract*a.contractCommission+(expired+merchant)*a.blendedMerchantCommission,'channel fees follow billing type');
      close(y.ebitdaUsd,y.revenueUsd-y.opexUsd,'EBITDA');
      close(y.operatingCashUsd,y.ebitdaUsd-y.operatingTaxUsd-y.bcLlcPaymentUsd,'operating cash after tax/site share');
      const covered=Math.max(0,Math.min(end,c.buildMonths+a.includedSupportMonths)-Math.max(start,c.buildMonths));
      assert.equal(y.includedSupportMonths,covered);
      const support=s.capital.serverHardwareUsd*(covered*a.includedSupportRate+(op-covered)*a.postWarrantySupportRate)/12*(1+a.annualCostInflation)**(y.year-1);
      close(y.supportUsd,support,'support is based on complete-system purchase price and operating-month coverage');
    }
  });

  test(`${s.id}: funded cash includes each reserve, invoice and exit component exactly once`,()=>{
    let companyCash=s.capital.cashReserveUsd+s.capital.launchTopUpUsd,previousAr=0;
    const c=s.commercial;
    for(const y of s.annual){
      const util=y.year===1?c.merchantUtilizationYear1:c.merchantUtilizationYear2Plus;
      const price=c.merchantRateYear1Usd*(1+c.annualMerchantRateChange)**(y.year-1);
      const contractInLastMonth=c.contractedGpus>0&&y.year*12<=c.contractServiceEndMonth;
      const contractInvoice=c.contractedGpus*(contractInLastMonth?c.contractPaidShare*c.contractRateUsd:util*price);
      const merchantInvoice=(s.capacity.saleableGpus-c.contractedGpus)*util*price;
      const ar=y.operatingMonths?(contractInvoice+merchantInvoice)*a.annualHours/12*Math.round(a.collectionDays/30):0;
      close(y.receivablesUsd,ar,'last invoice receivable, not annual average');
      const cashOps=y.operatingCashUsd-(ar-previousAr);
      const calls=Math.max(0,-companyCash-cashOps);
      const target=y.year<s.horizonYears?s.capital.reserveCostComponentUsd+s.capital.launchTopUpUsd:0;
      const distribution=Math.max(0,companyCash+calls+cashOps-target);
      companyCash+=calls+cashOps-distribution;
      close(y.cashFromOperationsUsd,cashOps,'cash receipts after AR movement');
      close(y.capitalCallsUsd,calls,'actual later capital call');
      close(y.distributionsUsd,distribution,'cash distribution before separate asset disposal');
      close(y.endingCompanyCashUsd,companyCash,'remaining company cash');
      close(y.fundedCashUsd,-calls+distribution+y.terminalCollectionUsd+y.resaleUsd+y.resaleTaxUsd,'funded investor cash including separate exit components');
      const terminal=y.year===s.horizonYears;
      close(y.terminalCollectionUsd,terminal?ar:0,'receivables settled exactly once at exit');
      close(y.reserveReleaseUsd,terminal?s.capital.cashReserveUsd+s.capital.launchTopUpUsd:0,'headline reserve release');
      close(y.headlineCashUsd,y.operatingCashUsd+y.resaleUsd+y.resaleTaxUsd+y.reserveReleaseUsd,'annual headline cash');
      const resaleRate=s.horizonYears===6?a.hardwareResaleYear6:a.hardwareResaleYear5;
      close(y.resaleUsd,terminal?s.capital.hardwareUsd*resaleRate+s.capital.infrastructureUsd*a.infrastructureResale:0,'gross asset disposal, excluding reserve');
      assert.ok(y.resaleTaxUsd<=0,'resale tax is a signed cash outflow');
      previousAr=ar;
    }
    close(companyCash,0,'company cash fully released at exit');
    close(sum(s.annual.map(y=>y.capitalCallsUsd)),s.returns.laterCapitalCallsUsd,'later calls total');
    assert.equal(s.returns.laterCapitalCallsUsd,0,'published cases use only their funded initial call');
    const initial=s.datedCash.filter(cash=>cash.kind==='initial-capital');
    assert.equal(initial.length,1);
    assert.equal(initial[0].date,a.modelStartDate);
    close(initial[0].amountUsd,-s.capital.totalUsd,'initial investor contribution');
    const terminal=s.datedCash.filter(cash=>cash.kind==='terminal-receivable');
    assert.equal(terminal.length,1);
    close(terminal[0].amountUsd,s.returns.terminalReceivableUsd,'separate final collection amount');
    const sale=new Date(a.modelStartDate+'T00:00:00Z');
    sale.setUTCFullYear(sale.getUTCFullYear()+s.horizonYears);
    assert.equal(day(terminal[0].date)-sale.getTime()/86400000,a.collectionDays,'collection occurs after sale');
    for(const y of s.annual){
      const date=new Date(a.modelStartDate+'T00:00:00Z');
      date.setUTCFullYear(date.getUTCFullYear()+y.year);
      const dated=s.datedCash.find(cash=>cash.kind==='annual-investor-cash'&&cash.date===date.toISOString().slice(0,10));
      close(dated?.amountUsd??0,y.fundedCashUsd-y.terminalCollectionUsd,'dated annual cash excludes final AR');
    }
    close(sum(s.datedCash.map(c=>c.amountUsd)),-s.capital.totalUsd+sum(s.annual.map(y=>y.headlineCashUsd)),'independent cash conservation across timing conventions');
  });

  test(`${s.id}: independently solve annual IRR, XIRR, NPV, MOIC and operating payback`,()=>{
    const r=s.returns;
    const initial=-s.capital.totalUsd;
    const annual=[initial,...s.annual.map(y=>y.headlineCashUsd)];
    const funded=[initial,...s.annual.map(y=>y.fundedCashUsd)];
    const operating=[initial,...s.annual.map(y=>y.operatingCashUsd)];
    const years=annual.map((_,year)=>year);
    const cash=s.datedCash.map(c=>c.amountUsd);
    const elapsed=s.datedCash.map(c=>(day(c.date)-day(a.modelStartDate))/365);
    close(solveIrr(annual,years),r.headlineIrr,'headline IRR',1e-7);
    close(solveIrr(funded,years),r.annualFundedIrr,'annual funded IRR',1e-7);
    close(solveIrr(operating,years),r.operatingOnlyIrr,'operating-only IRR',1e-7);
    close(solveIrr(cash,elapsed),r.datedFundedIrr,'date-aware funded XIRR',1e-7);
    close(npv(a.hurdleRate,annual,years),r.npvUsd,'headline NPV');
    close(npv(a.hurdleRate,funded,years),r.annualFundedNpvUsd,'annual funded NPV');
    close(npv(a.hurdleRate,cash,elapsed),r.datedFundedNpvUsd,'dated funded NPV');
    close(sum(annual.slice(1))/-initial,r.moic,'headline MOIC');
    close(sum(cash.filter(c=>c>0))/-sum(cash.filter(c=>c<0)),r.fundedMoic,'actual funded MOIC');
    close(sum(operating.slice(1))/-initial,r.operatingMoic,'operating-only MOIC');
    let unrecovered=-initial,payback=null;
    for(const y of s.annual){
      if(payback===null&&y.operatingCashUsd>=unrecovered)payback=y.year-1+unrecovered/y.operatingCashUsd;
      unrecovered-=y.operatingCashUsd;
    }
    close(Math.max(0,unrecovered),r.unrecoveredOperatingCapitalUsd,'unrecovered operating capital');
    if(payback===null)assert.equal(r.operatingPaybackYears,null);else close(r.operatingPaybackYears,payback,'operating payback');
    const clears=['contracted-60','contracted-60-at-650'].includes(s.id);
    assert.equal(r.datedFundedIrr>=a.hurdleRate,clears,'only qualifying hypothetical cases clear the hurdle');
    assert.equal(r.datedFundedNpvUsd>=0,clears,'NPV sign agrees with the same dated return basis');
  });
}

test('term and pricing sensitivities retain their exact published conditions',()=>{
  const short=scenario('contracted-36'),long=scenario('contracted-60'),low=scenario('contracted-60-at-650');
  assert.deepEqual(short.annual.map(y=>y.contractMonths),[6,12,12,6,0]);
  assert.deepEqual(long.annual.map(y=>y.contractMonths),[6,12,12,12,12,6]);
  assert.equal(short.commercial.contractServiceEndMonth,42);
  assert.equal(long.commercial.contractServiceEndMonth,66);
  assert.equal(long.horizonYears,6);
  close(short.annual[3].receivablesUsd,119738.25,'36-month expiry last invoice');
  close(long.annual[5].receivablesUsd,96987.9825,'60-month expiry last invoice');
  assert.equal(low.commercial.contractRateUsd,6.5);
  assert.equal(long.commercial.contractRateUsd,7.5);
  for(const s of [short,long,low]){
    assert.equal(s.commercial.merchantRateYear1Usd,7.5,'contract-price sensitivity retains Contracted merchant fallback');
    assert.equal(s.commercial.merchantUtilizationYear2Plus,0.5);
    assert.equal(s.commercial.annualMerchantRateChange,-0.1);
  }
  assert.ok(long.capital.cashReserveUsd>low.capital.cashReserveUsd,'pricing cases recalculate their own working capital');
  assert.ok(scenario('delayed').capital.launchTopUpUsd>0,'delayed initial contribution includes launch shortfall');
});

test('investor annual table separates cash distributions from net asset disposal and respects signed sale tax',()=>{
  const page=readFileSync(new URL('../src/pages/investors/index.astro',import.meta.url),'utf8');
  assert.match(page,/<th>Operating distribution incl\. reserve release<\/th>/);
  assert.doesNotMatch(page,/<th>Distribution incl\. exit recovery<\/th>/);
  assert.match(page,/Separate post-sale receivable collection/);
  // Evaluate the actual displayed net-disposal expression so a subtraction of
  // an already-negative tax cannot pass by merely preserving the right label.
  const expression=page.match(/Separate net asset-sale cash at exit:\s*\{usd\((s\.annual\.reduce\([\s\S]*?,0\))\)\}/)?.[1];
  assert.ok(expression,'Net disposal is explicitly shown separately from distributions');
  const displayedNetSale=new Function('s',`return ${expression};`);
  for(const s of model.scenarios){
    const expected=sum(s.annual.map(y=>y.resaleUsd+y.resaleTaxUsd));
    close(displayedNetSale(s),expected,`${s.id}: displayed sale proceeds net of signed tax`);
    assert.ok(displayedNetSale(s)<=sum(s.annual.map(y=>y.resaleUsd)),'sale tax must not increase disposal proceeds');
  }
});
