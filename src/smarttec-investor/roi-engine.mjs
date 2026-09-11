/** SmartTec reference cash-flow engine v1.1.0.
 * Deterministic, dependency-free ES module. USD; monthly periods.
 * Financial scenario only: never certifies capacity, workload fit, quotes or securities terms.
 * See 03_ROI_Model_Spec.md for scope, units and limitations.
 */
const sum = xs => xs.reduce((a, b) => a + b, 0);
const number = (v, name, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new Error(`${name}: required finite number in [${min}, ${max}]`);
  return v;
};
const integer = (v, name, min, max) => {
  number(v, name, min, max);
  if (!Number.isInteger(v)) throw new Error(`${name}: integer required`);
};
const ratio = (v, name) => number(v, name, 0, 1);

export function periodHours(startMonth, index) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) throw new Error('startMonth: YYYY-MM required');
  const [y, m] = startMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + index, 0)).getUTCDate() * 24;
}

export function npv(cashFlows, annualDiscountRate) {
  number(annualDiscountRate, 'annualDiscountRate', -0.999999, 1000000);
  return sum(cashFlows.map((cf, m) => cf / (1 + annualDiscountRate) ** (m / 12)));
}

export function annualizedMonthlyIRR(cashFlows) {
  // Decline to select a potentially misleading root for nonconventional cash flows.
  const signs = cashFlows.filter(v => Math.abs(v) > 1e-8).map(Math.sign);
  const changes = signs.slice(1).filter((v, i) => v !== signs[i]).length;
  if (changes !== 1 || signs[0] !== -1) return null;
  let lo = -0.999999, hi = 1;
  while (npv(cashFlows, hi) > 0 && hi < 1000000) hi = Math.min(1000000, hi * 2 + 1);
  if (npv(cashFlows, lo) < 0 || npv(cashFlows, hi) > 0) return null;
  for (let i = 0; i < 180; i++) {
    const mid = (lo + hi) / 2;
    if (npv(cashFlows, mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function summarize(cashFlows, discount) {
  const contributed = -sum(cashFlows.filter(x => x < 0));
  const distributed = sum(cashFlows.filter(x => x > 0));
  let balance = 0;
  const cumulative = cashFlows.map(v => (balance += v));
  const firstPayback = cumulative.findIndex((v, i) => i > 0 && v >= -1e-7);
  const sustainedPayback = cumulative.findIndex((v, i) => i > 0 && v >= -1e-7 && cumulative.slice(i).every(x => x >= -1e-7));
  const irr = annualizedMonthlyIRR(cashFlows);
  return {
    initialContribution: -Math.min(cashFlows[0], 0),
    additionalContributions: -sum(cashFlows.slice(1).filter(x => x < 0)),
    totalContributed: contributed, totalDistributed: distributed,
    netProfit: distributed - contributed,
    totalROI: contributed > 0 ? (distributed - contributed) / contributed : null,
    equityMultiple: contributed > 0 ? distributed / contributed : null,
    npv: npv(cashFlows, discount), annualizedMonthlyIRR: irr,
    irrStatus: irr === null ? 'Not reported: absent, unbracketed or potentially ambiguous root' : 'Annualized monthly-period IRR',
    firstPaybackMonth: firstPayback < 0 ? null : firstPayback,
    sustainedPaybackMonth: sustainedPayback < 0 ? null : sustainedPayback,
    cashFlows, cumulative
  };
}

function validate(s) {
  if (!s || s.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  integer(s.horizonMonths, 'horizonMonths', 1, 120);
  periodHours(s.startMonth, 1);
  for (const k of ['siteCapex', 'softCosts', 'openingReserve', 'monthlyFixedOpex', 'monthlyNetworkCost', 'monthlyDemandCharges', 'energyRatePerKwh', 'extraITPeakKw', 'exitSaleProceeds', 'exitDecommissionCost', 'exitOtherLiabilities']) number(s[k], k);
  number(s.pue, 'pue', 1, 5);
  ratio(s.extraITAverageFraction, 'extraITAverageFraction');
  number(s.annualOpexEscalation, 'annualOpexEscalation', 0, 1);
  number(s.annualDiscountRate, 'annualDiscountRate', 0, 2);
  integer(s.networkCommitmentMonths, 'networkCommitmentMonths', 0, 120);
  if (s.networkCommitmentMonths > s.horizonMonths) throw new Error('Extend horizon to cover network commitment; do not hide remaining obligations');
  if (!Array.isArray(s.rows) || !s.rows.length) throw new Error('At least one equipment row required');
  const ids = new Set();
  for (const r of s.rows) {
    if (!r.id || ids.has(r.id)) throw new Error('Rows require unique ids');
    ids.add(r.id);
    integer(r.systems, `${r.id}.systems`, 1, 10000);
    if (!['owned', 'customer'].includes(r.ownership)) throw new Error(`${r.id}.ownership invalid`);
    number(r.completeSystemCost, `${r.id}.completeSystemCost`);
    if (r.ownership === 'customer' && r.completeSystemCost !== 0) throw new Error('Customer-owned row must explicitly set SmartTec equipment purchase cost to zero');
    number(r.peakKwPerSystem, `${r.id}.peakKwPerSystem`, 0.0001);
    ratio(r.averagePowerFraction, `${r.id}.averagePowerFraction`);
    integer(r.operatingStartMonth, 'operatingStartMonth', 1, s.horizonMonths);
    integer(r.operatingEndMonth, 'operatingEndMonth', r.operatingStartMonth, s.horizonMonths);
    if (!Array.isArray(r.contracts)) throw new Error('contracts array required; empty means zero revenue');
    let end = 0;
    for (const c of [...r.contracts].sort((a,b) => a.startMonth - b.startMonth)) {
      integer(c.startMonth, 'contract.startMonth', r.operatingStartMonth, r.operatingEndMonth);
      integer(c.endMonth, 'contract.endMonth', c.startMonth, r.operatingEndMonth);
      if (c.startMonth <= end) throw new Error('Overlapping contracts would double-sell this equipment row');
      end = c.endMonth;
      if (!['gpu_hour', 'system_month', 'reserved_kw_month', 'million_tokens'].includes(c.billing)) throw new Error('Unknown billing unit');
      if (r.ownership === 'customer' && !['system_month', 'reserved_kw_month'].includes(c.billing)) throw new Error('Customer-owned hosting requires explicit hosting billing, not assumed GPU/token sales');
      number(c.rate, 'contract.rate');
      for (const k of ['paidOccupancy', 'collectionFraction', 'salesFeeFraction']) ratio(c[k], `contract.${k}`);
      // Rental prices can fall as newer hardware enters the market.
      number(c.annualRateEscalation, 'contract.annualRateEscalation', -1, 1);
      integer(c.collectionLagMonths, 'contract.collectionLagMonths', 0, s.horizonMonths);
      if (c.endMonth + c.collectionLagMonths > s.horizonMonths) throw new Error('Extend horizon to collect modeled receivables; terminal receivables are not silently written off');
      if (c.billing === 'gpu_hour') integer(r.gpusPerSystem, 'gpusPerSystem', 1, 1024);
      if (c.billing === 'reserved_kw_month') number(r.billableKwPerSystem, 'billableKwPerSystem', 0.0001);
      if (c.billing === 'million_tokens') number(c.measuredBillableTokensPerSecondPerSystem, 'measuredBillableTokensPerSecondPerSystem', 0.0001);
    }
  }
  if (!Array.isArray(s.capexEvents)) throw new Error('capexEvents array required');
  for (const e of s.capexEvents) { integer(e.month, 'capexEvent.month', 1, s.horizonMonths); number(e.cost, 'capexEvent.cost'); }
  if (!s.debt) throw new Error('debt object required, use explicit principal: 0 for unlevered');
  number(s.debt.principal, 'debt.principal'); number(s.debt.annualRate, 'debt.annualRate', 0, 1);
  integer(s.debt.termMonths, 'debt.termMonths', 1, 360);
  if (s.investorProRataFraction !== null) number(s.investorProRataFraction, 'investorProRataFraction', 0.000001, 1);
}

export function calculateScenario(s) {
  validate(s);
  const months = s.horizonMonths;
  const hardwareCapex = sum(s.rows.map(r => r.systems * r.completeSystemCost));
  const initialCapex = hardwareCapex + s.siteCapex + s.softCosts;
  if (s.debt.principal > initialCapex) throw new Error('Reference model debt cannot exceed initial capital costs');
  const requiredInitialFunding = initialCapex + s.openingReserve;
  const receipts = Array(months + 1).fill(0), bills = Array(months + 1).fill(0);
  const rowResults = s.rows.map(r => ({id:r.id, totalBilled:0, totalCollectedNetFees:0}));
  for (const [ri,r] of s.rows.entries()) {
    for (const c of r.contracts) for (let m=c.startMonth; m<=c.endMonth; m++) {
      const hours = periodHours(s.startMonth,m);
      const rate = c.rate * (1+c.annualRateEscalation) ** Math.floor((m-c.startMonth)/12);
      let units;
      if (c.billing === 'gpu_hour') units = r.systems*r.gpusPerSystem*hours;
      if (c.billing === 'system_month') units = r.systems;
      if (c.billing === 'reserved_kw_month') units = r.systems*r.billableKwPerSystem;
      if (c.billing === 'million_tokens') units = r.systems*c.measuredBillableTokensPerSecondPerSystem*3600*hours/1e6;
      const billed = units*rate*c.paidOccupancy;
      const collected = billed*c.collectionFraction*(1-c.salesFeeFraction);
      bills[m] += billed; receipts[m+c.collectionLagMonths] += collected;
      rowResults[ri].totalBilled += billed; rowResults[ri].totalCollectedNetFees += collected;
    }
  }
  const debtRate = s.debt.annualRate/12;
  const debtPayment = s.debt.principal === 0 ? 0 : debtRate === 0 ? s.debt.principal/s.debt.termMonths : s.debt.principal*debtRate/(1-(1+debtRate)**(-s.debt.termMonths));
  let debtBalance=s.debt.principal;
  const ledgers = {
    project:{cash:s.openingReserve, flows:[-requiredInitialFunding]},
    equity:{cash:s.openingReserve, flows:[-(requiredInitialFunding-s.debt.principal)]}
  };
  const schedule=[];
  for (let m=1;m<=months;m++) {
    const hours=periodHours(s.startMonth,m);
    const running=s.rows.filter(r=>m>=r.operatingStartMonth&&m<=r.operatingEndMonth);
    const peakITkw=s.extraITPeakKw+sum(running.map(r=>r.systems*r.peakKwPerSystem));
    const averageITkw=s.extraITPeakKw*s.extraITAverageFraction+sum(running.map(r=>r.systems*r.peakKwPerSystem*r.averagePowerFraction));
    const facilityKwh=averageITkw*s.pue*hours;
    const escalation=(1+s.annualOpexEscalation)**Math.floor((m-1)/12);
    const energyCost=facilityKwh*s.energyRatePerKwh*escalation;
    const nonEnergyCost=(s.monthlyFixedOpex+s.monthlyNetworkCost+s.monthlyDemandCharges)*escalation;
    const operatingCash=receipts[m]-energyCost-nonEnergyCost;
    const capex=sum(s.capexEvents.filter(e=>e.month===m).map(e=>e.cost));
    const interest=debtBalance*debtRate;
    const payment=debtBalance>1e-8?Math.min(debtPayment,debtBalance+interest):0;
    const principal=Math.max(0,payment-interest);
    debtBalance=Math.max(0,debtBalance-principal);
    const terminal=m===months;
    const exit=terminal?s.exitSaleProceeds-s.exitDecommissionCost-s.exitOtherLiabilities:0;
    const debtBalloon=terminal?debtBalance:0;
    const item={month:m,hours,billed:bills[m],collectedNetFees:receipts[m],peakITkw,averageITkw,facilityKwh,energyCost,nonEnergyCost,operatingCash,capex,interest,principal,debtPayment:payment,debtBalloon};
    for (const [name,l] of Object.entries(ledgers)) {
      const net=operatingCash-capex+exit-(name==='equity'?payment+debtBalloon:0);
      l.cash+=net;
      const call=l.cash<0?-l.cash:0;
      l.cash+=call;
      const distribution=terminal?l.cash:Math.max(0,l.cash-s.openingReserve);
      l.cash-=distribution;
      l.flows.push(distribution-call);
      item[name]={capitalCall:call,distribution,cashBalance:l.cash};
    }
    schedule.push(item);
  }
  const project=summarize(ledgers.project.flows,s.annualDiscountRate);
  const equity=summarize(ledgers.equity.flows,s.annualDiscountRate);
  const investor=s.investorProRataFraction===null?null:summarize(ledgers.equity.flows.map(v=>v*s.investorProRataFraction),s.annualDiscountRate);
  return {schemaVersion:1,modelVersion:'1.1.0',status:'Illustrative financial scenario; not an approved investment or capacity offer',hardwareCapex,initialCapex,requiredInitialFunding,project,equity,investor,rowResults,schedule,totalBilled:sum(bills),totalCollectedNetFees:sum(receipts),peakModeledITkw:Math.max(...schedule.map(m=>m.peakITkw))};
}

export function requiredRateForNPV(scenario, rowId, contractIndex=0, targetNpv=0) {
  // Hold every other assumption fixed; compute an indicative contract price floor.
  const s=structuredClone(scenario);
  const row=s.rows.find(r=>r.id===rowId);
  if (!row || !row.contracts[contractIndex]) throw new Error('Unknown contract');
  const c=row.contracts[contractIndex];
  if (c.paidOccupancy===0 || c.collectionFraction===0 || c.salesFeeFraction===1) return null;
  number(targetNpv,'targetNpv',-Number.MAX_SAFE_INTEGER);
  const score=rate=>{c.rate=rate;return calculateScenario(s).project.npv-targetNpv;};
  if (score(0)>=0) return 0;
  let lo=0,hi=Math.max(c.rate,1);
  while (score(hi)<0 && hi<1e9) hi*=2;
  if (score(hi)<0) return null;
  for (let i=0;i<80;i++) {const mid=(lo+hi)/2;if(score(mid)>=0)hi=mid;else lo=mid;}
  return hi;
}
