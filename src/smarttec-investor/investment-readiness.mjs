// Shared current investor-page and presentation basis. Missing costs remain null.
// Owner statements and analyst allowances are not independently verified contracts.
const hardware = {
  supplier: 'Supermicro', systems: 8, gpusPerSystem: 8,
  installedGPUs: 64, saleableGPUs: 60, reserveGPUs: 4,
  systemPrice: 670000, totalCost: 5360000,
  coolingRequirement: 'Direct liquid cooling, owner-confirmed',
  scope: 'Eight B300 GPUs, dual Intel Xeon 6776P CPUs, NVSwitch fabric, networking, storage, NVIDIA software stack and support per complete system, owner-reported.',
  verification: 'Exact configuration and quotation are private and have not been reviewed. Support term, external cluster scope, taxes, freight, installation and delivery terms remain unverified.',
  reserveNote: 'Four financial reserve GPUs remain part of purchased equipment and cooling load; they do not establish full-node or facility redundancy.'
};
const founderCapital = {
  initialAvailable: 6000000, overageWillingness: true,
  status: 'Owner reports $6 million available and willingness to personally cover the overage.',
  verification: 'Availability, additional amount, timing, contribution form and transfer have not been independently verified. The $6 million is not a fixed funding ceiling.'
};
const budget = {
  startupAllowance: 566000, openingReserve: 264501,
  oldCombinedSiteAllowance: 652800,
  nonCoolingSiteWork: null, revisedOpeningReserve: null,
  laterCapitalCalls: null, completeInitialFunding: null,
  finalRaise: null, updatedROI: null, updatedNPV: null, updatedPaybackMonth: null,
  basis: 'Partial initial funding only. Retains the earlier startup/acquisition allowance and opening reserve pending scope reconciliation. Replace the old combined site allowance with cooling plus non-cooling work; do not add both unchanged.',
  exclusions: 'Unknown non-cooling site work, any reserve revision and later capital calls. Potential tax, freight, installation and support overlaps are not deducted without matching scope.'
};
const cases = [
  {
    id: 'full-scope', label: 'Full-scope cooling comparison', installedCoolingAllowance: 1083600,
    basis: 'Analyst benchmark including two chillers, two CDUs, separate dry coolers, four active rear doors and installation allowances; 20% contingency included. Not minimum pricing or a supplier bid.'
  },
  {
    id: 'lower-cost', label: 'Illustrative lower-cost cooling option', installedCoolingAllowance: 831600,
    basis: 'Hypothetical $100,000 chiller pair replaces the $240,000 pair and the $70,000 separate dry-cooler line is deferred; all other allowances unchanged and 20% contingency retained. Not a verified refurbished bid or approved design.'
  }
].map(c => ({
  ...c,
  partialInitialFunding: hardware.totalCost + budget.startupAllowance + budget.openingReserve + c.installedCoolingAllowance,
  additionalFounderContribution: Math.max(0, hardware.totalCost + budget.startupAllowance + budget.openingReserve + c.installedCoolingAllowance - founderCapital.initialAvailable)
}));

export const investmentReadiness = {
  schemaVersion: 1, reviewedAt: '2026-09-11', status: 'incomplete',
  headline: 'Founder-backed capacity, subject to complete costs and paid demand.',
  decision: 'No definitive updated return, complete funding requirement or final raise is established. Complete contractor scope, operating costs, commercial terms and the BC LLC payment definition must be reconciled before underwriting the investment.',
  hardware, founderCapital, budget,
  commercial: {
    proposedGrossRatePerGPUHour: 6.5, illustrativePaidHoursPerDay: 20, daysPerYear: 365,
    grossAnnualAtIllustrativePaidHours: hardware.saleableGPUs * 6.5 * 20 * 365,
    signedCustomerContracts: 0, paidPilots: 0, establishedMinimumReceipts: null,
    status: 'Active customer discussions, with no signed customer contract or paid pilot established.',
    basis: 'Gross arithmetic at 20 paid hours per saleable GPU per day, not contracted revenue or a forecast. Host payout versus end-customer pricing, platform fees, collection treatment, utilization and minimum-payment terms remain unresolved.'
  },
  property: {
    ownerReportedLandholder: 'BC LLC', paidOffOwnerReported: true, existingBuildingsOwnerReported: true,
    siteAgreementYears: 50, signedOwnerConfirmed: true,
    annualPaymentFraction: 0.01,
    paymentBasis: 'Owner describes an annual payment of 1% of profit remaining after expenses.',
    verification: 'Signed status is owner-confirmed; the document and title have not been reviewed. Exact accounting definition, premises, related-party rights and other obligations remain unresolved. No property ownership by SmartTec or investor collateral is inferred.',
    modeledPayment: null
  },
  power: {
    reportedSources: ['solar', 'batteries', 'gas generators'],
    ownerReportedRateBelow: 0.07, reservedContinuousKW: null, serviceDate: null, verifiedAllInRate: null,
    basis: 'Owner reports an agreement below 7 cents/kWh. The team must confirm exclusive continuous capacity, availability and complete fuel, maintenance, loss, replacement and equipment obligations.'
  },
  cooling: {
    status: 'Preliminary comparison; contractor pricing and design acceptance required',
    oneBuildingOwnerConfirmed: true, existingWorkingAirConditioning: false,
    refurbishedEquipmentPermitted: true, cases,
    screeningDutyPerChillerKW: 225,
    screeningBasis: 'Eight systems at an assumed 20 kW, 20 kW ancillary air load, 5 kW pump heat and 20% headroom: 222 kW, rounded to 225 kW net duty per chiller. OEM and engineering confirmation required; no PSU-nameplate or PUE multiplier is used.',
    annualServiceAllowance: 25000, incrementalAnnualServiceCost: null, annualCoolingElectricityCost: null,
    energyBasis: 'The earlier PUE 1.4 already includes cooling and other facility overhead. Reconcile seasonal cooling electricity and service coverage instead of adding a second full energy or maintenance allowance.',
    existingHVACBasis: 'The selected building has no working air conditioning. New residual-air and ancillary cooling must be priced even if rear-door equipment is changed.',
    missingInputs: ['Complete installed contractor quotes', 'Non-cooling site scope', 'Seasonal energy and demand costs', 'Maintenance/support coverage', 'Revised reserve and later capital needs']
  },
  historicalModel: {
    status: 'superseded-cost-basis', reviewedAt: '2026-09-10',
    label: 'Historical comparison using the earlier site and operating allowances',
    basis: 'The earlier $652,800 combined site allowance, 28.7% five-year ROI and month-49 payback are historical sensitivities, not current underwriting. They exclude the newly scoped cooling comparison, unresolved non-cooling costs and the unmodeled BC LLC payment. Do not apply their price thresholds to the updated plan.'
  },
  sources: [
    {title: 'Management interview, 11 September 2026', kind: 'owner-report', basis: 'Current hardware scope, founder funding willingness, BC LLC agreement, customer status, one-building deployment and absence of working air conditioning.'},
    {title: 'SmartTec preliminary cooling scope and cost reconciliation', kind: 'analyst-allowance', basis: 'Corrected full-scope benchmark and lower-cost sensitivity; prices are not contractor bids.'},
    {title: 'Supermicro liquid-cooled Blackwell portfolio', kind: 'manufacturer-context', url: 'https://www.supermicro.com/en/pressreleases/supermicro-expands-nvidia-blackwell-portfolio-new-4u-and-2-ou-ocp-liquid-cooled', basis: 'Manufacturer context, not verification of the private selected system.'},
    {title: 'Vast.ai hosting overview', kind: 'marketplace-context', url: 'https://docs.vast.ai/host/hosting-overview', basis: 'Marketplace access does not establish a minimum-payment commitment to SmartTec.'},
    {title: 'Vast.ai host payouts', kind: 'marketplace-context', url: 'https://docs.vast.ai/host/payment', basis: 'Actual payment terms must be established for SmartTec; no guaranteed occupancy or receipts are inferred.'}
  ]
};
