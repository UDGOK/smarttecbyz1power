import {investmentReadiness as r} from '../investment-readiness.mjs';

const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const millions=value=>'$'+(value/1e6).toFixed(2)+'m';
const rate=value=>'$'+value.toFixed(2);
const full=r.cooling.cases.find(c=>c.id==='full-scope');
const lower=r.cooling.cases.find(c=>c.id==='lower-cost');
const metric=(label,value,note)=>({label,value:String(value),note});

// Both investor editions and the public team section use the same owner-supplied roster.
import roster from '../../data/team.json' with {type:'json'};
export const teamMembers=roster;

export const pitchContact={
  name:'Yasir Jahangir',role:'Chief Technology Officer',
  email:'yasir@smarttec.dev',phone:'918-520-3823',
  emailHref:'mailto:yasir@smarttec.dev',phoneHref:'tel:+19185203823'
};

export const chapters=[
  {
    id:'opening',kind:'hero',visual:'fiber',duration:18,
    eyebrow:'SMARTTEC / MEAD, OKLAHOMA',
    title:'Power. Compute. Disciplined growth.',
    lede:'A proposed liquid-cooled B300 deployment, supported by founder funding intent and a plan to commission capacity against paid demand.',
    metrics:[
      metric('B300 GPUs',r.hardware.installedGPUs,'Proposed first deployment'),
      metric('Complete systems',r.hardware.systems,r.hardware.supplier+' · owner-reported scope')
    ],
    keypoints:['Founder-backed first deployment.','Customer-led expansion strategy.'],
    footnote:'Development-stage investment discussion. Procurement and commissioning remain ahead.'
  },
  {
    id:'thesis',kind:'metrics',visual:'campus',duration:20,
    eyebrow:'THE INVESTMENT THESIS',
    title:'Local power. Dedicated AI compute.',
    lede:'SmartTec proposes dedicated AI compute in Mead, combining reported local power access, complete GPU systems and a staged delivery strategy. Customer commitments are central to the proposed deployment.',
    metrics:[
      metric('Power strategy','Behind the meter','Solar, batteries and gas generation'),
      metric('Deployment','One building','Consolidated first-fleet plan')
    ],
    keypoints:['Proposed capacity is linked to supported customer demand.','Complete installed pricing is a proposed purchase milestone.','Expansion is proposed against collections and operating performance.'],
    footnote:'The delivered power advantage and complete project return remain to be established.'
  },
  {
    id:'fleet',kind:'fleet',visual:'compute',duration:22,
    eyebrow:'THE PROPOSED FIRST FLEET',
    title:'A focused B300 deployment.',
    lede:`${r.hardware.systems} complete liquid-cooled ${r.hardware.supplier} systems bring the first fleet into one building. The proposed configuration targets customer workloads, with final delivery and acceptance terms still open.`,
    metrics:[
      metric('GPUs proposed',r.hardware.installedGPUs,`${r.hardware.systems} systems × ${r.hardware.gpusPerSystem} GPUs`),
      metric('Saleable GPUs',r.hardware.saleableGPUs,'Used in revenue arithmetic'),
      metric('Financial reserves',r.hardware.reserveGPUs,'Purchased equipment still requires cooling'),
      metric('Per complete system',money(r.hardware.systemPrice),'Owner-reported price')
    ],
    keypoints:['Reported scope includes CPUs, NVSwitch, networking, storage, NVIDIA software and support.','Exact configuration, external cluster scope and support term remain unreviewed.'],
    footnote:'Financial reserve GPUs do not establish full-node redundancy or commissioned inventory.'
  },
  {
    id:'power',kind:'power',visual:'fiber',duration:22,
    eyebrow:'THE POWER STRATEGY',
    title:'Behind-the-meter power for AI compute.',
    lede:'Management reports a supply agreement combining solar, batteries and gas generation at below 7 cents per kWh. Exclusive capacity, service availability and the all-in cost scope remain unconfirmed.',
    metrics:[
      metric('Reported energy price','<'+(r.power.ownerReportedRateBelow*100).toFixed(0)+'¢/kWh','All-in scope remains unverified'),
      metric('Exclusive continuous capacity','Unconfirmed','Firm supply allocation not yet established'),
      metric('Service availability','Unconfirmed','Operating date and commissioning not established')
    ],
    keypoints:['Fuel, maintenance, losses, replacement and equipment obligations remain unresolved.','Usable customer load, power quality and outage operation await validation.'],
    footnote:'A reported supply agreement is not certified usable power or a guaranteed cost advantage.'
  },
  {
    id:'site-rights',kind:'site',visual:'campus',duration:22,
    eyebrow:'LONG-TERM SITE ACCESS',
    title:'A home for the operation.',
    lede:'Management identifies BC LLC, associated with the CEO, as the landholder. Existing buildings and a reported signed site-use agreement provide the proposed operating location.',
    metrics:[
      metric('Reported agreement',r.property.siteAgreementYears+' years','Both signatures owner-confirmed'),
      metric('Annual BC LLC payment',(r.property.annualPaymentFraction*100).toFixed(0)+'%','Of profit after expenses; definition unreviewed'),
      metric('Property debt','Reported paid off','Title and other obligations unreviewed')
    ],
    keypoints:['Premises, improvements, termination and financing rights remain unreviewed.','The site payment depends on the agreement’s unreviewed profit definition.'],
    footnote:'Site access does not establish SmartTec ownership of the land or investor collateral.'
  },
  {
    id:'commercial',kind:'revenue',visual:'compute',duration:24,
    eyebrow:'FROM CAPACITY TO CUSTOMERS',
    title:'The GPU rental revenue model.',
    lede:'The proposed GPU-hour rate and illustrative utilization show the gross billing opportunity. Customer discussions are active; signed contracts and minimum receipts remain unestablished.',
    metrics:[
      metric('Illustrative annual gross',money(r.commercial.grossAnnualAtIllustrativePaidHours),'Uncontracted billing arithmetic'),
      metric('Proposed GPU-hour rate',rate(r.commercial.proposedGrossRatePerGPUHour),'Host receipts versus customer price unresolved'),
      metric('Paid hours per GPU/day',r.commercial.illustrativePaidHoursPerDay,'Illustration, not guaranteed occupancy'),
      metric('Signed customer contracts',r.commercial.signedCustomerContracts,'Active discussions; no paid pilot established')
    ],
    keypoints:[`${r.hardware.saleableGPUs} saleable GPUs × ${r.commercial.illustrativePaidHoursPerDay} paid hours × ${rate(r.commercial.proposedGrossRatePerGPUHour)} × ${r.commercial.daysPerYear} days.`,
      'Payment responsibility, minimum receipts, duration and acceptance remain open.','Fees, collections and service credits affect net receipts.'],
    footnote:'Gross billings are neither collected cash nor profit. No binding minimum receipts are established.'
  },
  {
    id:'founder-capital',kind:'budget',visual:'campus',duration:22,
    eyebrow:'FOUNDER FUNDING INTENT',
    title:'Founder funding for the first phase.',
    lede:'Management reports funds available for the initial deployment and willingness to personally cover additional project costs. The proposed hardware, cooling and remaining site work define the initial capital requirement.',
    metrics:[
      metric('Initial founder funds',millions(r.founderCapital.initialAvailable),'Owner-reported availability'),
      metric('GPU hardware',millions(r.hardware.totalCost),`${r.hardware.systems} complete systems at ${money(r.hardware.systemPrice)}`),
      metric('Additional costs','Founder overage','Willingness indicated; amount and timing unverified')
    ],
    keypoints:['Cooling and remaining site work require separate scope reconciliation.','Contribution form, timing and capital-release controls have not been independently reviewed.'],
    footnote:'Funds and transfers have not been independently verified. Founder funding does not itself improve project returns.'
  },
  {
    id:'cooling',kind:'cooling',visual:'compute',duration:24,
    eyebrow:'THE COOLING STRATEGY',
    title:'Liquid cooling, with complete installed scope.',
    lede:'The first deployment requires new cooling throughout. Two preliminary cost scenarios include compatible liquid cooling, residual-air cooling and installation allowances; engineering and contractor pricing remain open.',
    metrics:[
      metric('Full-scope comparison',money(full.installedCoolingAllowance),'Analyst allowance, not minimum pricing'),
      metric('Lower-cost sensitivity',money(lower.installedCoolingAllowance),'Hypothetical equipment savings; no bid'),
      metric('Net duty per chiller',r.cooling.screeningDutyPerChillerKW+' kW','Screening target; engineering to confirm'),
      metric('Working building HVAC','None','No existing air-conditioning reuse credit')
    ],
    keypoints:['The lower-cost option reduces the chiller-pair allowance and defers separate dry coolers.','New and warranted refurbished equipment are options under assessment.','Seasonal energy and maintenance coverage remain unresolved operating inputs.'],
    footnote:'Both comparisons retain contingency and required residual-air cooling. Neither is an approved design or contractor quotation.'
  },
  {
    id:'funding-bridge',kind:'budget',visual:'fiber',duration:24,
    eyebrow:'THE PARTIAL FUNDING BRIDGE',
    title:'Two scenarios for partial initial funding.',
    lede:'The cooling scenarios produce two partial initial funding requirements, including hardware, retained startup costs and an opening reserve. Remaining site work, reserve revisions and later capital needs are excluded.',
    metrics:[
      metric('Full-scope partial funding',money(full.partialInitialFunding),'Before remaining site scope and adjustments'),
      metric('Lower-cost partial funding',money(lower.partialInitialFunding),'Before remaining site scope and adjustments'),
      metric('Full-scope founder overage',money(full.additionalFounderContribution),'Above initial reported founder funds'),
      metric('Lower-cost founder overage',money(lower.additionalFounderContribution),'Above initial reported founder funds')
    ],
    keypoints:[`Both retain ${money(r.budget.startupAllowance)} startup/acquisition and ${money(r.budget.openingReserve)} opening reserve.`,
      `These comparisons replace the earlier ${money(r.budget.oldCombinedSiteAllowance)} combined site allowance.`,
      'Taxes, freight, installation and service overlaps remain unreconciled.'],
    footnote:'Excludes unknown non-cooling site work, reserve revisions and later capital calls. These are not final funding totals.'
  },
  {
    id:'delivery',kind:'roadmap',visual:'campus',duration:22,
    eyebrow:'THE PROPOSED DELIVERY STRATEGY',
    title:'A staged path to customer service.',
    lede:'The proposed delivery framework links capital releases to commercial agreements, complete engineering scope and service acceptance. Expansion is proposed after collections and operating performance demonstrate readiness.',
    metrics:[],
    keypoints:['Commercial milestone: paid demand, acceptance terms and complete installed pricing.','Commissioning milestone: tested power, cooling, network, recovery and workloads.','Operating milestone: collections, service performance and reserve coverage.'],
    footnote:'Proposed release gates, not completed milestones. Supplier and customer terms must support staged commitments.'
  },
  {
    id:'team',kind:'team',visual:'campus',duration:24,
    eyebrow:'THE PEOPLE BEHIND SMARTTEC',
    title:'Accountability across every stage.',
    lede:'Leadership, operations and advisors connect commercial commitments with technical delivery, financial controls and the development of the business.',
    metrics:[],team:teamMembers,
    keypoints:['Proposed execution responsibilities span customer agreements, technical delivery and financial oversight.'],
    footnote:'Names, roles and contacts supplied by management. Experience, commitment levels and detailed responsibilities have not been independently verified.'
  },
  {
    id:'investment',kind:'metrics',visual:'fiber',duration:22,
    eyebrow:'INVESTOR PARTICIPATION',
    title:'The investment framework.',
    lede:'The proposed framework covers capital contributions, ownership, distributions and approval rights. Outside participation and economic terms remain open; current project returns are not yet established.',
    metrics:[
      metric('Updated project ROI',r.budget.updatedROI===null?'Not established':(r.budget.updatedROI*100).toFixed(1)+'%','Complete costs and commercial terms pending'),
      metric('Final outside raise',r.budget.finalRaise===null?'Not fixed':money(r.budget.finalRaise),'Founder willingness includes the overage'),
      metric('Investor cash rights','Open terms','No preferred return or waterfall promised')
    ],
    keypoints:['The return model depends on complete costs and the BC LLC payment definition.','Planned sensitivities cover demand, delays, repair costs and hardware replacement.','Reporting, reserve policy and approval rights are proposed terms for discussion.'],
    footnote:'Earlier model returns use superseded costs. No definitive current NPV, payback or investor return is asserted.'
  },
  {
    id:'next-steps',kind:'closing',visual:'compute',duration:20,
    eyebrow:'AN INVITATION TO DISCUSS',
    title:'SmartTec’s first deployment. Your next conversation.',
    lede:'SmartTec invites prospective investors to discuss its founder-backed B300 proposal, customer pipeline and participation structure. The discussion brings together commercial terms, complete installed costs and investor rights.',
    metrics:[
      metric('Your contact',pitchContact.name,pitchContact.role),
      metric('Email',pitchContact.email,pitchContact.phone)
    ],
    keypoints:['Customer commitments. Complete installed costs. Clear investor rights.'],
    footnote:'Private investor discussion. This experience does not accept an investment or guarantee a capacity reservation.'
  }
];
