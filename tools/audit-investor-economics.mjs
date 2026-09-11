import {writeFile} from 'node:fs/promises';
import {options,summarizeOption,assumptions,sources,reviewedAt} from '../src/smarttec-investor/underwriting.mjs';
import {calculateScenario,requiredRateForNPV} from '../src/smarttec-investor/roi-engine.mjs';
import original from '../src/smarttec-investor/data/illustrative-scenario.json' with {type:'json'};
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const pct=n=>n===null?'Not reported':(100*n).toFixed(1)+'%';
const all=options.map(option=>({...option,cases:Object.fromEntries(['base','downside','favorable'].map(kind=>[kind,summarizeOption(option.id,kind)]))}));
const old=calculateScenario(original);
const lines=[
 '# SmartTec investor economics review',
 `Reviewed ${reviewedAt}. Reproduce with: node tools/audit-investor-economics.mjs. Generated from the same inputs and monthly engine as the private investor page.`,
 '## Investment conclusion',
 '**Profitability is not established. Do not expand solely to make the pitch more exciting.** None of the six base cases reaches zero project NPV at the assumed 15% annual hurdle. A B200 expansion is a candidate for customer and supplier negotiations, not an approved purchase. It passes only under the favorable assumptions below, and fails the full hardware replacement stress. These are pre-tax project cash flows, not a promised investor return.',
 'The intended first phase remains two four-GPU RTX PRO 6000 Blackwell Server Edition nodes plus one B300 node whose actual OEM configuration has not been selected. The eight-GPU B300 used here is an explicit reference option, not a new statement that this configuration is ordered or supported by the site.',
 '## Earlier example: reconciliation',
 `The existing RTX-only illustration requires ${usd(old.requiredInitialFunding)} initially, bills ${usd(old.totalBilled)}, collects ${usd(old.totalCollectedNetFees)} after collection losses/fees, and loses ${usd(-old.project.netProfit)} after capital costs over 60 months. Project NPV is ${usd(old.project.npv)}; capital is never recovered. B300 is excluded.`,
 `Its $9,000/system/month is approximately $3.08/GPU-hour on a 730-hour, four-GPU basis before occupancy. That exceeds the $2.09 RTX PRO 6000 advertised Pod benchmark. Holding the original assumptions fixed, the required system price for zero NPV at 15% is $${requiredRateForNPV(original,original.rows[0].id).toFixed(2)}/month.`,
 'The $8,075/month network assumption alone is $96,900/year or $484,500 over 60 months before escalation. With only eight RTX GPUs at $2.09/hour, 80% occupancy, 98% collection and 2% fees, a normalized 730-hour month yields about $9,377 before network, power, staffing or capital recovery. Confirm the carrier scope and commercial terms; a lower price must not be invented.',
 '## Alternatives with complete cost allowances',
 '| Option | Case | Initial funding | Later calls | Net cash profit/loss | NPV at 15% | Project IRR | Payback |',
 '|---|---|---:|---:|---:|---:|---:|---|',
 ...all.flatMap(o=>Object.entries(o.cases).map(([kind,r])=>`| ${o.label} | ${kind} | ${usd(r.initialFunding)} | ${usd(r.additionalFunding)} | ${usd(r.netProfit)} | ${usd(r.npv)} | ${pct(r.irr)} | ${r.payback===null?'Not within 60 months':'Month '+r.payback} |`)),
 'Initial funding is not always the entire raise: add later capital calls. These alternatives are mutually exclusive upfront deployments; do not sum their revenues or capital budgets.',
 '## What the favorable B200 case actually requires',
 'Two RTX nodes plus two eight-GPU B200 systems: eight RTX GPUs and sixteen B200 GPUs. Three months without revenue, then 60% paid occupancy for months 4–6, 80% for months 7–15, and 90% thereafter. Prices stay at $2.09/RTX GPU-hour and $6.69/B200 GPU-hour through month 60. Collection is 98%, selling fees 10%, and the cost allowances below still apply. No such customer contracts are verified. Five-year flat pricing on aging hardware is a demanding condition, not a likely outcome inferred from current spot prices.',
 `That case requires ${usd(all.find(o=>o.id==='b200-scale').cases.favorable.initialFunding)}, returns an annualized project IRR of ${pct(all.find(o=>o.id==='b200-scale').cases.favorable.irr)}, and recovers capital in month 44. Its NPV cushion is only ${usd(all.find(o=>o.id==='b200-scale').cases.favorable.npv)}. Replacing the 10% overhaul with a full original-cost hardware replacement at month 37 makes NPV ${usd(all.find(o=>o.id==='b200-scale').cases.favorable.fullReplacementNPV)}. This margin is too fragile to present as a verified investment return.`,
 '## Revenue hurdles and hardware life',
 '| Base option | Required multiplier of ALL rates | Base operating cash before capital costs | IT peak incl. support | Full replacement stress NPV |',
 '|---|---:|---:|---:|---:|',
 ...all.map(o=>`| ${o.label} | ${o.cases.base.revenueMultiplier.toFixed(3)}× | ${usd(o.cases.base.operatingCash)} | ${o.cases.base.peakITkw.toFixed(1)} kW | ${o.id==='customer-hosting'?'No SmartTec GPU purchase':usd(o.cases.base.fullReplacementNPV)} |`),
 'The multiplier preserves the full entered occupancy and annual price path; it does not front-load all capital recovery into the introductory revenue segment. It solves project NPV = 0, not simple operating break-even. It is not evidence of customer willingness to pay.',
 `Customer-owned hosting at the hypothetical 100 kW block needs about $${(350*all.find(o=>o.id==='customer-hosting').cases.base.revenueMultiplier).toFixed(2)}/reserved-kW/month ALL-IN under the base assumptions to meet the hurdle. This includes power and network and is not comparable to a competitor rent figure that excludes electricity. The model does not establish that a tenant will accept this price.`,
 'A full replacement stress changes only the month-37 capital event, replacing the 10% allowance with 100% of original hardware acquisition cost (not adding both). No trade-in value, new GPU revenue uplift or replacement downtime is assumed. Actual replacement may also need tax/freight, installation and downtime; this is a sensitivity, not a complete replacement quote.',
 '## Full assumption ledger',
 ...assumptions.map(a=>'- '+a),
 '## Electrical and operational limits',
 'A 3,000 A, 208 V three-phase service corresponds to about 1,081 kVA by sqrt(3) × 208 × 3,000 / 1,000. That arithmetic does not establish 1,081 kW of usable continuous IT power. Shared transformer capacity, power factor, protective devices, continuous-loading limits, commissioning, branch distribution, cooling and redundancy need an engineer-approved design. No modeled GPU count is capacity-certified.',
 'The B300 reference deliberately separates an HGX purchase benchmark from a DGX AC planning power envelope. They are different complete systems. Confirm exact voltage, circuits, transient load, airflow/fluid requirements, fabric and storage before procurement. Multi-GPU HBM memory is not automatically one usable pool, and peak marketing throughput is not billable application throughput.',
 '## How the competitor pitch changes the story',
 'The user-supplied 21-page AIB Data Centers investor presentation (August 2026) is comparison material, not independently verified diligence. Its useful structural lessons are: separate secured utility power from IT load and development pipeline; distinguish land control, utility agreements and actual revenue; show the team; state lease/tenant status; and tie expansion to customer commitments.',
 'Pages 3 and 10 describe customer-owned GPUs and illustrative long-term leases with energy pass-through. This differs materially from SmartTec purchasing GPUs and selling hourly compute. Those leases are not evidence that SmartTec can obtain equivalent terms. Page 10 explicitly says its lease is under negotiation; the contracted 65 MW elsewhere concerns power, not proof of an executed tenant lease.',
 'The appendix reports about $2.9 million Q2 revenue and $3.5 million Q2 net loss; the $4.7 million operating cash outflow is for SIX MONTHS, not Q2 alone (page 16 footnote). The pitch therefore does not demonstrate current profitability. Do not copy its future EBITDA, public-company valuation multiples or per-MW market capitalization onto SmartTec.',
 'Page 20 uses approximately $1.5 million stabilized EBITDA per secured MW and approximately $872 million across 570 MW. The rounded displayed inputs multiply to $855 million, so its projection requires a more detailed reconciliation before reuse. Its site-level EBITDA/multiple is not a cash-flow or equity-return model for SmartTec. The competitor PDF is not republished with the site.',
 '## Required next commercial evidence',
 '1. Complete OEM bill of materials, installed price, taxes/freight, delivery date, support term, fabric/storage and software licensing. Compare B200 and B300 on measured customer throughput per dollar and per kWh.',
 '2. Installed electrical/cooling/network scope and utility tariff including demand and riders. Reconcile the unverified carrier commitment. Obtain uptime, redundancy, security and staffing costs that match the SLA.',
 '3. Named customer credit assessment and minimum paid commitments, actual price/term, ramp, cancellation and service credits. Current public rental rates do not establish five-year pricing or demand.',
 '4. Use of funds, reserve/capital-call policy, investment entity property rights, investment terms, investor fees/taxes and distribution waterfall. The owner-reported $2 million property value is excluded from ROI and is not assumed collateral.',
 '5. Re-run all cases with signed evidence. Release procurement funding only when the customer, supplier and engineering cases align. A smaller paid demonstration or customer-owned hosting commitment can validate demand before hardware scale.',
 '## Formula and verification scope',
 'Revenue = systems × GPUs/system × actual calendar hours × paid occupancy × rate × collection × (1 − sales fees). Hosting substitutes contracted kW for GPU-hours. Revenue starts only in the entered segments; renewal rates and price decay are explicit. PUE applies once to average IT energy, independently of occupancy.',
 'Net project cash profit = collected receipts − operating cash costs − initial hardware/site/startup costs − later capex − net exit liabilities. Opening reserve is funding, then returned only if it survives; it is not profit. Total contributions include capital calls. NPV discounts monthly cash flows at (1 + annual rate)^(month/12). IRR is annualized from the monthly cash series; ambiguous roots are not reported.',
 'Automated tests independently reconstruct all 18 scenarios from calendar dates and cash conservation, test negative rental-rate changes, verify the multi-segment price hurdle and preserve private API authentication/CSRF. Financial code correctness does not verify quotations, occupancy, taxes, future hardware life or actual investor terms.',
 '## Primary source ledger',
 ...sources.map(s=>`- [${s.title}](${s.url}) — ${s.basis} Retrieved ${reviewedAt}.`),
 ''
];
await writeFile('docs/investor-economics-audit.md',lines.join('\n'));
// Full inputs and compact results; each case can be imported into the private calculator.
await writeFile('docs/investor-economics-scenarios.json',JSON.stringify({reviewedAt,modelVersion:'1.1.0',options:all},null,2)+'\n');
console.log('Wrote docs/investor-economics-audit.md and docs/investor-economics-scenarios.json');
