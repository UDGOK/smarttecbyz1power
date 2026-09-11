import {calculateScenario} from './roi-engine.mjs';

// Planning allowances, NOT an approved budget, purchase order or customer forecast.
// All scenarios are reproducible in the existing monthly cash-flow calculator.
export const reviewedAt = '2026-09-10';
export const sources = [
  {title:'Runpod advertised Pod rental rates',url:'https://www.runpod.io/pricing',basis:'RTX PRO 6000 96GB $2.09, B200 $6.79, B300 $7.89 per GPU-hour. Retail asking prices; no SmartTec demand, platform admission or host payout is established.'},
  {title:'Lambda instance pricing',url:'https://lambda.ai/pricing',basis:'B200 $6.69 per GPU-hour on an eight-GPU instance. Used as the lower B200 starting benchmark; reserved pricing requires a quote.'},
  {title:'Exxact eight-GPU HGX B200 configurator',url:'https://configurator.exxactcorp.com/configure/TS4-169219634',basis:'Essential configuration displayed $403,298.50 and a 14,227 W estimate. Model rounds purchase allowance to $405,000 and uses 15 kW peak / 80% average as separate planning inputs.'},
  {title:'Exxact eight-GPU HGX B300 configurator',url:'https://configurator.exxactcorp.com/configure/TS4-104366747',basis:'Essential configuration displayed $580,199.40. Model rounds purchase allowance to $585,000. This is an HGX price reference, not a DGX quote or the selected SmartTec node.'},
  {title:'NVIDIA DGX B300 facility planning reference',url:'https://docs.nvidia.com/dgx-pdf/data-center-best-practices-with-dgx-b300-v1.pdf',basis:'AC reference: 15 kW estimated system power and 19.7 kW estimated peak. Used only as a conservative B300 modeling envelope; exact HGX power must be quoted and engineered.'},
  {title:'NVIDIA RTX PRO 6000 Blackwell Server Edition',url:'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/',basis:'96GB Server Edition. Four GPUs per modeled RTX node; $80,000 per complete node and 5 kW peak are retained unquoted planning allowances, not NVIDIA prices.'}
];

export const assumptions = [
  'USD, 60 months beginning October 2026; no revenue in months 1–3. All hardware and site costs funded at month zero. Paid occupancy includes vacancy and downtime; it is not GPU electrical utilization.',
  'Base case: 40% paid occupancy in months 4–6, 60% in 7–15, 70% in 16–60. GPU rental rates fall 10% each operating year (first reduction in month 16). 98% collection and 10% sales/platform fee allowance. These are underwriting assumptions, not contracts or verified host fees.',
  'Downside: 25% / 40% / 50% occupancy, starting GPU rates 20% lower and falling 20% annually; capital costs 15% higher, fixed operations 20% higher and energy $0.13/kWh. Favorable case: 60% / 80% / 90% occupancy, starting benchmark rates held flat for five years. Favorable terms are not contracted.',
  'Owned-server site allowance: ($150,000 + $2,500 × equipment peak kW) × 1.20, including a 20% construction contingency. Startup costs: $30,000 plus 10% of hardware for acquisition tax, freight and integration contingency. These allowances require scoped quotes.',
  'Monthly fixed operations: $9,000 shared staffing/support/security/insurance/software/property-cost allowance + $100 per system + 3% of hardware cost / 12 for maintenance. This is a lean shared-operations budget, not a staffed 24/7 roster. Vendor support beyond year three and all license costs need confirmation.',
  'Network remains $8,075/month for all 60 months, with 3% annual cost escalation. The prior 60-month carrier price is unverified. Demand-charge allowance is $1,000 + $20 × equipment peak kW per month; this is not an OG&E tariff calculation.',
  'Energy $0.10/kWh; PUE 1.4; RTX average power 70% of 5 kW, B200 80% of 15 kW, B300 15/19.7 of 19.7 kW. Supporting IT adds 2 kW peak / 1 kW average. Power remains independent of paid occupancy. All operating costs escalate 3% annually.',
  'Opening reserve covers six months of initial fixed, network, demand and average power costs using 730 hours/month for the reserve estimate only. Actual monthly billing and energy use calendar hours. Further modeled capital calls are reported separately.',
  'Month 37 includes 10% of original hardware cost for overhaul/spares, not a complete GPU replacement. No residual hardware/property sale value or debt. Five-year equipment serviceability is unproven; a full replacement stress is shown separately.',
  'Pre-tax project cash returns, not accounting net income or a promised investor yield. 15% annual project discount hurdle is an assumption. Income taxes, legal waterfalls and investor-level fees are not modeled; property, manufacturing, solar and battery revenue/value are excluded.',
  'Customer-owned alternative: hypothetical 100 kW reserved IT block, not certified site capacity; $480,000 site work, $40,000 startup, $10,000 monthly fixed operations, $3,000 monthly demand allowance, $20,000 month-37 site overhaul and $20,000 exit cost. Test rent $350/reserved-kW/month is an ALL-IN assumption including energy/network, not a market quote or pass-through contract; no GPU rental revenue is added. Base rent stays flat. Downside starts 20% lower, with the same cost/occupancy stresses. Customer funds its servers.'
];

const hardware = {
  rtx:{profileId:'rtx-pro-6000-blackwell-server',model:'4 × RTX PRO 6000 Blackwell Server Edition — unquoted OEM allowance',gpus:4,cost:80000,peak:5,average:.7,rate:2.09},
  b200:{profileId:'hgx-b200-reference',model:'8 × HGX B200 — Exxact price reference, OEM scope pending',gpus:8,cost:405000,peak:15,average:.8,rate:6.69},
  b300:{profileId:'hgx-b300-reference',model:'8 × HGX B300 — Exxact price reference, separate power allowance',gpus:8,cost:585000,peak:19.7,average:15/19.7,rate:7.89}
};
export const options = [
  {id:'planned-mix',label:'2 RTX nodes + 1 eight-GPU B300 reference',counts:{rtx:2,b300:1},note:'Tests the intended first-phase mix using an explicitly hypothetical eight-GPU B300. Exact selected node remains unconfirmed.'},
  {id:'rtx-scale',label:'8 RTX nodes / 32 GPUs',counts:{rtx:8},note:'RTX expansion test; no purchase commitment or proven demand.'},
  {id:'b200-pilot',label:'2 RTX nodes + 1 eight-GPU B200 reference',counts:{rtx:2,b200:1},note:'Lower-cost alternative to the B300 reference; workload fit must be benchmarked.'},
  {id:'b200-scale',label:'2 RTX nodes + 2 eight-GPU B200 references',counts:{rtx:2,b200:2},note:'Scale test with eight RTX GPUs and sixteen B200 GPUs; not an approved expansion.'},
  {id:'b300-scale',label:'2 RTX nodes + 2 eight-GPU B300 references',counts:{rtx:2,b300:2},note:'Scale test with eight RTX GPUs and sixteen B300 GPUs; not an approved expansion.'},
  {id:'customer-hosting',label:'Customer-owned servers / 100 kW test block',counts:{},note:'Infrastructure-only alternative. Hosting rent must cover all included site, energy and network costs.'}
];

function revenueSegments(rate,kind,billing) {
  const occupancy=kind==='downside'?[.25,.4,.5]:kind==='favorable'?[.6,.8,.9]:[.4,.6,.7];
  const decay=billing==='reserved_kw_month'?0:kind==='downside'?-.2:kind==='favorable'?0:-.1;
  const startingRate=rate*(kind==='downside'?.8:1);
  return [[4,6,0,occupancy[0]],[7,15,0,occupancy[1]],[16,27,1,occupancy[2]],[28,39,2,occupancy[2]],[40,51,3,occupancy[2]],[52,60,4,occupancy[2]]].map(([startMonth,endMonth,year,paidOccupancy])=>({startMonth,endMonth,billing,rate:startingRate*(1+decay)**year,paidOccupancy,collectionFraction:.98,salesFeeFraction:.1,annualRateEscalation:0,collectionLagMonths:0}));
}
export function makeScenario(id,kind='base') {
  const option=options.find(x=>x.id===id);
  if(!option||!['base','downside','favorable'].includes(kind))throw new Error('Unknown underwriting option or case');
  const rows=Object.entries(option.counts).map(([key,systems])=>{
    const h=hardware[key];
    return {id:key,profileId:h.profileId,model:h.model,ownership:'owned',systems,gpusPerSystem:h.gpus,completeSystemCost:h.cost,peakKwPerSystem:h.peak,averagePowerFraction:h.average,operatingStartMonth:4,operatingEndMonth:60,contracts:revenueSegments(h.rate,kind,'gpu_hour')};
  });
  const host=id==='customer-hosting';
  if(host)rows.push({id:'hosting',profileId:'customer-owned-hosting',model:'Customer-supplied systems — 100 kW hypothetical IT block',ownership:'customer',systems:10,gpusPerSystem:0,completeSystemCost:0,peakKwPerSystem:10,billableKwPerSystem:10,averagePowerFraction:.8,operatingStartMonth:4,operatingEndMonth:60,contracts:revenueSegments(350,kind,'reserved_kw_month')});
  const capex=rows.reduce((s,r)=>s+r.systems*r.completeSystemCost,0);
  const peak=rows.reduce((s,r)=>s+r.systems*r.peakKwPerSystem,0);
  const average=1+rows.reduce((s,r)=>s+r.systems*r.peakKwPerSystem*r.averagePowerFraction,0);
  const s={schemaVersion:1,startMonth:'2026-10',horizonMonths:60,
    siteCapex:(150000+2500*peak)*1.2,softCosts:host?40000:30000+.1*capex,openingReserve:0,
    monthlyFixedOpex:host?10000:9000+100*rows.reduce((s,r)=>s+r.systems,0)+capex*.03/12,
    monthlyNetworkCost:8075,networkCommitmentMonths:60,monthlyDemandCharges:1000+20*peak,
    energyRatePerKwh:.1,pue:1.4,extraITPeakKw:2,extraITAverageFraction:.5,annualOpexEscalation:.03,annualDiscountRate:.15,
    exitSaleProceeds:0,exitDecommissionCost:20000,exitOtherLiabilities:0,investorProRataFraction:null,
    debt:{principal:0,annualRate:0,termMonths:60},capexEvents:[{month:37,cost:host?20000:capex*.1}],rows};
  if(kind==='downside'){
    s.rows.forEach(r=>r.completeSystemCost*=1.15);s.siteCapex*=1.15;s.softCosts*=1.15;s.capexEvents.forEach(e=>e.cost*=1.15);
    s.monthlyFixedOpex*=1.2;s.energyRatePerKwh=.13;
  }
  s.openingReserve=Math.ceil(6*(s.monthlyFixedOpex+s.monthlyNetworkCost+s.monthlyDemandCharges+average*s.pue*s.energyRatePerKwh*730));
  s.underwriting={reviewedAt,option:id,case:kind,status:'Unquoted planning sensitivity; not a forecast or approved purchase',assumptions,sources};
  return s;
}

// Reprice every segment together, preserving its occupancy and annual decay.
// A first-segment-only price floor would misleadingly force all recovery into 3 months.
export function requiredRevenueMultiplier(scenario) {
  const score=factor=>{const s=structuredClone(scenario);s.rows.forEach(r=>r.contracts.forEach(c=>c.rate*=factor));return calculateScenario(s).project.npv;};
  if(score(0)>=0)return 0;
  let lo=0,hi=1;
  while(score(hi)<0&&hi<1024)hi*=2;
  if(score(hi)<0)return null;
  for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(score(mid)>=0)hi=mid;else lo=mid;}
  return hi;
}
export function summarizeOption(id,kind='base') {
  const scenario=makeScenario(id,kind),r=calculateScenario(scenario);
  const replacement=structuredClone(scenario);
  replacement.capexEvents=[{month:37,cost:r.hardwareCapex||20000}];
  const stress=calculateScenario(replacement);
  return {scenario,initialFunding:r.requiredInitialFunding,totalFunding:r.project.totalContributed,additionalFunding:r.project.additionalContributions,
    netProfit:r.project.netProfit,npv:r.project.npv,irr:r.project.annualizedMonthlyIRR,payback:r.project.sustainedPaybackMonth,
    revenue:r.totalCollectedNetFees,operatingCash:r.schedule.reduce((s,m)=>s+m.operatingCash,0),peakITkw:r.peakModeledITkw,
    revenueMultiplier:requiredRevenueMultiplier(scenario),fullReplacementNPV:stress.project.npv};
}
