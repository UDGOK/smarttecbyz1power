import {investmentReadiness as r} from '../investment-readiness.mjs';

const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const millions=value=>'$'+(value/1e6).toFixed(2)+'m';
const rate=value=>'$'+value.toFixed(2);
const full=r.cooling.cases.find(c=>c.id==='full-scope');
const lower=r.cooling.cases.find(c=>c.id==='lower-cost');
const metric=(label,value,note)=>({label,value:String(value),note});

// Owner-supplied names and roles. Consistency is tested against the site roster.
export const teamMembers=[
  {name:'Syed Hussain',role:'Chief Executive Officer'},
  {name:'Yasir Jahangir',role:'Chief Technology Officer'},
  {name:'Muhammad Siddiqui',role:'Chief Operating Officer'},
  {name:'Ryan',role:'Director of Operations'},
  {name:'Javed Iqbal, PhD',role:'Strategic Advisor'},
  {name:'Shahb Kazmi',role:'Senior Advisor'},
  {name:'Ali Askara',role:'Graphics and Media Relations'},
  {name:'Ken',role:'Legal'},
  {name:'Daniel',role:'Chief Financial Officer'}
];

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
    keypoints:['Build the first revenue.','Earn the next expansion.'],
    footnote:'Development-stage investment discussion. Procurement and commissioning remain ahead.'
  },
  {
    id:'thesis',kind:'metrics',visual:'campus',duration:20,
    eyebrow:'THE INVESTMENT THESIS',
    title:'Make power productive.',
    lede:'Combine reported local power access, complete GPU systems and a focused delivery plan. Customer payments and dependable service must turn that opportunity into a business.',
    metrics:[
      metric('Power strategy','Behind the meter','Solar, batteries and gas generation'),
      metric('Deployment','One building','Consolidated first-fleet plan')
    ],
    keypoints:['Match capacity to supported customer demand.','Price the complete installation before purchasing.','Expand against collected receipts and operating evidence.'],
    footnote:'The delivered power advantage and complete project return remain to be established.'
  },
  {
    id:'fleet',kind:'fleet',visual:'compute',duration:22,
    eyebrow:'THE PROPOSED FIRST FLEET',
    title:'A focused B300 deployment.',
    lede:`${r.hardware.systems} complete liquid-cooled ${r.hardware.supplier} systems bring the first fleet into one building. Hardware selection, delivery terms and acceptance must support the intended customer workloads.`,
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
    title:'Prove the delivered advantage.',
    lede:'Management reports an agreement for solar, batteries and gas generation. Firm capacity, availability and complete delivered cost must be matched to the customer service obligation.',
    metrics:[
      metric('Reported energy price','<'+(r.power.ownerReportedRateBelow*100).toFixed(0)+'¢/kWh','All-in scope remains unverified'),
      metric('Exclusive continuous capacity','To confirm','Team and engineering follow-up'),
      metric('Service availability','To confirm','Commissioning evidence required')
    ],
    keypoints:['Reconcile fuel, maintenance, losses, replacement and equipment obligations.','Validate power quality, outage operation and the available customer load.'],
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
    keypoints:['Confirm premises, improvements, termination and financing rights.','Apply the written profit definition before calculating the site payment.'],
    footnote:'Site access does not establish SmartTec ownership of the land or investor collateral.'
  },
  {
    id:'commercial',kind:'revenue',visual:'compute',duration:24,
    eyebrow:'FROM CAPACITY TO CUSTOMERS',
    title:'Paid demand makes the revenue case.',
    lede:'Illustrative billings show the scale of the opportunity. Contracted net receipts, realistic utilization and complete costs determine what can reach investors.',
    metrics:[
      metric('Illustrative annual gross',money(r.commercial.grossAnnualAtIllustrativePaidHours),'Uncontracted billing arithmetic'),
      metric('Proposed GPU-hour rate',rate(r.commercial.proposedGrossRatePerGPUHour),'Host receipts versus customer price unresolved'),
      metric('Paid hours per GPU/day',r.commercial.illustrativePaidHoursPerDay,'Illustration, not guaranteed occupancy'),
      metric('Signed customer contracts',r.commercial.signedCustomerContracts,'Active discussions; no paid pilot established')
    ],
    keypoints:[`${r.hardware.saleableGPUs} saleable GPUs × ${r.commercial.illustrativePaidHoursPerDay} paid hours × ${rate(r.commercial.proposedGrossRatePerGPUHour)} × ${r.commercial.daysPerYear} days.`,
      'Agree the paying entity, minimum payments, duration and acceptance.','Reconcile fees, collections and service credits before underwriting receipts.'],
    footnote:'Gross billings are neither collected cash nor profit. No binding minimum receipts are established.'
  },
  {
    id:'founder-capital',kind:'budget',visual:'campus',duration:22,
    eyebrow:'FOUNDER FUNDING INTENT',
    title:'Capital behind the first phase.',
    lede:'Management reports funds available for the initial deployment and willingness to personally cover additional project costs. Document the contributions alongside the complete installed budget.',
    metrics:[
      metric('Initial founder funds',millions(r.founderCapital.initialAvailable),'Owner-reported availability'),
      metric('GPU hardware',millions(r.hardware.totalCost),`${r.hardware.systems} complete systems at ${money(r.hardware.systemPrice)}`),
      metric('Additional costs','Founder overage','Willingness indicated; amount and timing unverified')
    ],
    keypoints:['Cooling and remaining site work require separate scope reconciliation.','Agree contribution form, timing and capital-release controls.'],
    footnote:'Funds and transfers have not been independently verified. Founder funding does not itself improve project returns.'
  },
  {
    id:'cooling',kind:'cooling',visual:'compute',duration:24,
    eyebrow:'PRICE COMPLETE COOLING',
    title:'Engineer the duty. Compare the cost.',
    lede:'All cooling is new. Compare complete installed options, including compatible liquid cooling and residual-air cooling, while retaining the required duty and service conditions.',
    metrics:[
      metric('Full-scope comparison',money(full.installedCoolingAllowance),'Analyst allowance, not minimum pricing'),
      metric('Lower-cost sensitivity',money(lower.installedCoolingAllowance),'Hypothetical equipment savings; no bid'),
      metric('Net duty per chiller',r.cooling.screeningDutyPerChillerKW+' kW','Screening target; engineering to confirm'),
      metric('Working building HVAC','None','No existing air-conditioning reuse credit')
    ],
    keypoints:['The lower-cost option reduces the chiller-pair allowance and defers separate dry coolers.','Compare new and warranted refurbished equipment with complete installation.','Reprice seasonal energy and reconcile maintenance coverage.'],
    footnote:'Both comparisons retain contingency and required residual-air cooling. Neither is an approved design or contractor quotation.'
  },
  {
    id:'funding-bridge',kind:'budget',visual:'fiber',duration:24,
    eyebrow:'THE PARTIAL FUNDING BRIDGE',
    title:'Complete the scope. Then the total.',
    lede:'Hardware and cooling comparisons establish a partial initial requirement. Remaining site work, operating reserves and later capital needs must complete the funding picture.',
    metrics:[
      metric('Full-scope partial funding',money(full.partialInitialFunding),'Before remaining site scope and adjustments'),
      metric('Lower-cost partial funding',money(lower.partialInitialFunding),'Before remaining site scope and adjustments'),
      metric('Full-scope founder overage',money(full.additionalFounderContribution),'Above initial reported founder funds'),
      metric('Lower-cost founder overage',money(lower.additionalFounderContribution),'Above initial reported founder funds')
    ],
    keypoints:[`Both retain ${money(r.budget.startupAllowance)} startup/acquisition and ${money(r.budget.openingReserve)} opening reserve.`,
      `Replace the earlier ${money(r.budget.oldCombinedSiteAllowance)} site allowance; do not add it again.`,
      'Reconcile taxes, freight, installation and service overlap before deductions.'],
    footnote:'Excludes unknown non-cooling site work, reserve revisions and later capital calls. These are not final funding totals.'
  },
  {
    id:'delivery',kind:'roadmap',visual:'campus',duration:22,
    eyebrow:'RELEASE CAPITAL AGAINST EVIDENCE',
    title:'Commission first. Expand from proof.',
    lede:'Align each purchase and delivery milestone with customer obligations, complete technical scope and operating readiness. Capital release should follow evidence that the next step can succeed.',
    metrics:[],
    keypoints:['Contract: establish paid demand, acceptance and complete installed pricing.','Commission: test power, cooling, network, failure recovery and customer workloads.','Operate: demonstrate collections, service performance and reserves before expansion.'],
    footnote:'Proposed release gates, not completed milestones. Supplier and customer terms must support staged commitments.'
  },
  {
    id:'team',kind:'team',visual:'campus',duration:24,
    eyebrow:'THE PEOPLE BEHIND SMARTTEC',
    title:'Accountability across every stage.',
    lede:'Leadership, operations and advisors connect commercial commitments with technical delivery, financial controls and the development of the business.',
    metrics:[],team:teamMembers,
    keypoints:['Assign a named lead to every commercial, technical and funding milestone.'],
    footnote:'Management supplied names and roles. Biographies, experience and detailed responsibilities remain to be verified.'
  },
  {
    id:'investment',kind:'metrics',visual:'fiber',duration:22,
    eyebrow:'DEFINE THE INVESTMENT',
    title:'Earn confidence through clear terms.',
    lede:'Complete the operating model and agree what an investor actually receives. Valuation, ownership, distributions, reserves and site rights must work together.',
    metrics:[
      metric('Updated project ROI',r.budget.updatedROI===null?'Not established':(r.budget.updatedROI*100).toFixed(1)+'%','Complete costs and commercial terms pending'),
      metric('Final outside raise',r.budget.finalRaise===null?'Not fixed':money(r.budget.finalRaise),'Founder willingness includes the overage'),
      metric('Investor cash rights','To agree','No preferred return or waterfall promised')
    ],
    keypoints:['Apply the BC LLC payment definition and complete operating-cost scope.','Test lower demand, delivery delays, repair costs and hardware replacement.','Agree reporting, reserve policy and approval rights before capital release.'],
    footnote:'Earlier model returns use superseded costs. No definitive current NPV, payback or investor return is asserted.'
  },
  {
    id:'next-steps',kind:'closing',visual:'compute',duration:20,
    eyebrow:'THE NEXT CONVERSATION',
    title:'Build the first revenue together.',
    lede:'Review the evidence, resolve the open terms and shape a deployment supported by customer payments and dependable service. The next step is a focused investment and technical discussion.',
    metrics:[
      metric('Your contact',pitchContact.name,pitchContact.role),
      metric('Email',pitchContact.email,pitchContact.phone)
    ],
    keypoints:['Customer commitments. Complete installed costs. Clear investor rights.'],
    footnote:'Private planning presentation. This experience does not accept an investment or guarantee a capacity reservation.'
  }
];
