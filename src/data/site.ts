/** Shared public record: owner corrections through 13 September 2026 supersede the earlier handoff. See docs/public-content-consistency-2026-09-13.md. */
export type Evidence =
  /** The owner supplied it. Publish with accurate scope and status. */
  | 'owner-reported'
  /** Arithmetic from stated inputs. Show units; it is not approved capacity. */
  | 'calculated'
  /** Public documentation supports it. Retain the source and review date. */
  | 'externally-checked'
  /** Future activity or a management target. Label it as such beside the claim. */
  | 'planned'
  /** Conflicting or missing. Use conservative wording; never fill in a number. */
  | 'unresolved';

/** The latest public project-record review. Individual target dates stay explicit. */
export const REVIEWED = '13 September 2026';

/** Public label for the current reviewed workbook revision. */
export const MODEL_EDITION = '14 September management target · v6.1.1 cost basis';

/** Owner-approved campus concept; it does not reprice the versioned investor model. */
export const campusConcept = {
  href: '/site/campus',
  allocationNote: 'Four systems in A and four in C are illustrated; final allocation and measured fit-out remain subject to design.',
  budgetBasis: `Published model ${MODEL_EDITION} retains an air-cooled, one-building financial baseline. The approved campus experience illustrates a proposed direct-liquid design across Buildings A and C; it requires updated equipment quotes, engineering and repricing before it is included financially.`,
} as const;

export const company = {
  name: 'SmartTec',
  parent: 'Z1Power',
  full: 'SmartTec by Z1Power',
  tagline: 'AI infrastructure, built in phases.',
  domain: 'smarttec.dev',
  /**
   * The handoff asks which entity owns the land, signs customer contracts and
   * would issue securities — and says not to publish "one company owns
   * everything" until that is documented.
   */
  entity: 'SmartTec.dev LLC',
  holdingCompany: 'SmartTec Holdings LLC',
} as const;

/** Legal acreage is authoritative; legacy zone areas remain planning inputs only. */
export const site = {
  name: 'Mead, Oklahoma',
  designation: 'Site 01',
  address: '8460 US Highway 70, Mead, OK 73449',
  county: 'Bryan County',

  /** Owner-supplied legal acreage. */
  acres: 39.39,
  /** What may be said in a headline. The exact figure is `acres`. */
  acresRounded: '39.39 acres',
  acresNote: 'Owner-supplied legal acreage; planning zones are not a separate legal parcel measurement.',
  legalDescription: 'SEC 33-6S-8E E2E2NW LESS .61ACS (958-895) FOR HWY',
  contractor: 'UDGOK',
  contractorUrl: 'https://udgok.com',
  constructionTarget: '24 September 2026 target',
  acresEvidence: 'owner-reported' as Evidence,

  ownership: 'BC LLC, management-reported landowner',
  ownershipNote: 'Management reports a signed 50-year site-use agreement for SmartTec with BC LLC, a related party. The agreement and title records remain subject to document review; land ownership is not attributed to SmartTec.',

  tracts: [
    {
      id: 1,
      acres: 13.5,
      label: 'Tract 1',
      use: 'Planned manufacturing development',
      state: 'Currently empty',
      evidence: 'owner-reported' as Evidence,
    },
    {
      id: 2,
      acres: 7.51,
      label: 'Tract 2',
      use: 'Existing buildings and house/office',
      state: 'Buildings A, B and C plus the house/office stand here',
      evidence: 'owner-reported' as Evidence,
    },
    {
      id: 3,
      acres: 18.2,
      label: 'Tract 3',
      use: 'Planned solar development',
      state: 'Undeveloped',
      evidence: 'owner-reported' as Evidence,
    },
  ],

  /**
   * Data-center candidate buildings, all on Tract 2.
   *
   * A, B and C — deliberately not mapped onto the old Building 1/2/3
   * identifiers, which described three identical 3,000 sq ft shells that do
   * not exist. These are gross existing building areas, not certified white
   * space and not sellable rack area, and none has an established fit-out or
   * commissioning status.
   *
   * Not to be confused with the owner's marks 1, 2 and 3 on the survey, which
   * are a different numbering: those are the real east, middle and west
   * buildings, and the owner confirmed on 9 September 2026 that they are A, B
   * and C in that order. The investor room's campus map uses that mapping. The
   * areas below rank in the same order as the traced footprints, which is why
   * the mapping is credible rather than merely asserted.
   */
  buildings: [
    { id: 'A', sqft: 1500, role: 'Data-center use' },
    { id: 'B', sqft: 2083, role: 'Battery, utilities and storage' },
    { id: 'C', sqft: 3535, role: 'Data-center use' },
  ],
  /** Calculated: A + B + C. Gross existing area. */
  buildingArea: 7118,
  dataCenterArea: 5035,
  utilityArea: 2083,
  buildingAreaLabel: '7,118 sq ft of existing building area',
  buildingStatus: 'Existing buildings; fit-out and commissioning ahead',

  /** Mixed use, and excluded from advertised data-center floor area. */
  houseOffice: {
    sqft: 6500,
    note: 'Separately identified mixed use; excluded from data-center floor area and tenant capacity',
    evidence: 'owner-reported' as Evidence,
  },

  /**
   * The planned factory. Two buildings, function allocation unconfirmed, and
   * no "under construction" label until work actually starts.
   */
  manufacturing: {
    buildings: 2,
    sqftEach: 30000,
    sqftTotal: 60000,
    scope: 'Inverter assembly and manufacturing, battery module and pack assembly, testing and service',
    startTarget: '24 September 2026 target',
    startTargetNote: 'Management target supplied 10 September 2026, with UDGOK as contractor; subject to construction readiness.',
    allocation: 'The allocation of inverter and battery assembly between the two buildings is not yet confirmed',
    evidence: 'planned' as Evidence,
  },

  /**
   * The compute target. A target requiring revalidation, not a launch date —
   * the qualifier is inside the value so no interpolation can drop it.
   */
  powerOn: 'After procurement and commissioning',
  powerOnNote: 'A customer service date will follow confirmed equipment delivery, cooling, utility commissioning and carrier acceptance. Earlier Q4 2026 targets require revalidation; model launch assumptions are not delivery commitments.',
  powerOnEvidence: 'planned' as Evidence,
} as const;

/**
 * Electrical.
 *
 * The site used to publish a 3 MVA transformer. That figure has no support.
 * What the owner reports is a shared 3,000 A, 208 V three-phase distribution
 * originating at Building C and serving A, B and C — one rating across the
 * three buildings, not three separate services.
 *
 * The apparent-power arithmetic below is exactly that, arithmetic. It is not
 * a transformer nameplate, it is not real power, and it is not an IT
 * allocation: continuous-load limits, utility allocation, feeder limits,
 * cooling, existing loads and redundancy all sit between it and a usable kW
 * figure. The handoff is explicit that applying a flat 80% factor to it and
 * calling the result engineered capacity is not permitted.
 */
export const power = {
  launchSource: 'Grid power first',
  launchNote: 'The initial deployment is planned to run on grid power. The utility tariff, demand charges, continuous allocation and commissioning must be confirmed for the approved IT and cooling load.',
  laterPhase: 'Solar and BESS are a separate later investment, to be installed in phases after launch as the hybrid design and economics are validated.',
  service: '3,000 A at 208 V, three-phase',
  voltage: '208 V three-phase',
  serviceOrigin: 'Shared campus electrical service',
  utility: 'OG&E',
  commissioningTarget: '8 October 2026 target',
  transformerStatus: 'Transformer on site; utility commissioning planned',
  serviceScope: 'One shared rating across the three buildings, not three separate supplies',
  serviceEvidence: 'owner-reported' as Evidence,

  /** sqrt(3) × 208 V × 3,000 A ÷ 1000. Apparent power only. */
  serviceApparent: '≈1.081 MVA apparent',
  serviceApparentNote: 'Arithmetic from the stated service current. Not a transformer nameplate and not available IT capacity.',
  serviceApparentEvidence: 'calculated' as Evidence,

  houseOfficeService: '200 A, separate',
  houseOfficeNote: 'Voltage, phase, metering and upstream supply are not yet verified',

  /** The approved wording for what capacity is actually on offer. */
  allocation: 'Usable IT capacity will be allocated following electrical, cooling and commissioning review',

  transformerNameplate: 'Management reports an on-site transformer and a shared 3,000 A, 208 V three-phase service. The transformer nameplate and final IT allocation require electrical verification and commissioning.',

  rate: 'a contracted rate and demand-charge schedule to be agreed before an offer',

  behindMeter: {
    sources: 'Later solar and battery storage; any gas generation requires a separate design',
    agreement: 'Earlier supply discussions do not establish the grid-first launch tariff',
    rate: 'Future delivered cost to be validated',
    note: 'The launch plan uses grid power. Future generation and storage require separate capital, a complete operating-cost case, utility approvals and commissioning; no future savings or backup duration are credited as established performance.',
    evidence: 'planned' as Evidence,
  },

  /** Current campus design intent; the earlier air-cooled financial basis remains versioned separately. */
  hvac: 'The campus concept uses direct liquid cooling for B300 systems in Buildings A and C, with a proposed chiller yard behind B. The owner specifies a closed-loop Daikin plant at 208V; the exact model and compatible operating conditions remain to be confirmed.',
  hvacUnresolved: 'The server SKU, CDU and facility-water circuits, residual room cooling, local-weather duty, voltage compatibility and complete installed cost require supplier quotes and engineering acceptance.',
  hvacEvidence: 'unresolved' as Evidence,

  /** Storage. A power rating; the usable energy and status are not known. */
  storage: 'Z1Power LFP battery cabinets',
  storageRating: 'Capacity subject to design',
  storageNote: 'Z1Power storage is planned as a later phase alongside solar. Cabinet quantity, usable MWh, usable kW and backup design will be sized to the approved load.',
  storageSiting: 'Future BESS is shown inside Building B; equipment selection and final siting require design confirmation',
  storageEvidence: 'unresolved' as Evidence,

  /**
   * Interconnection. The absolute "no application required" claim is gone.
   * Utility requirements are specific to the serving utility, which has not
   * been established for this property.
   */
  interconnection: 'Solar and storage interconnection will be coordinated with OG&E',
  interconnectionNote: 'Requirements are specific to the serving utility and to the scale of any generation installed.',
  interconnectionEvidence: 'unresolved' as Evidence,
} as const;

/**
 * Planned solar on Tract 3; the campus concept places future BESS inside B.
 *
 * A screening extrapolation, not surveyed capacity and not utility-approved
 * generation. The density benchmarks come from Berkeley Lab's 2022 land-use
 * study, whose sample is larger utility-scale plants; the buildable fractions
 * and the 1.30 DC/AC ratio are assumptions rather than site measurements.
 *
 * These are alternative layouts. They do not add together.
 */
export const solar = {
  tractAcres: 18.2,
  range: 'approximately 2.6–5.1 MWdc',
  status: 'Later-phase preliminary layout study',
  evidence: 'calculated' as Evidence,
  source: 'Berkeley Lab, Land Requirements for Utility-Scale PV (2022), pp. 7 and 13',
  sourceUrl: 'https://emp.lbl.gov/sites/default/files/emp-files/land_requirements_for_utility-scale_pv.pdf',
  scenarios: [
    { name: 'Lower / tracking', fraction: 0.6, arrayAcres: 10.92, density: 0.24, mwdc: 2.62, mwac: 2.02, modules: 4000 },
    { name: 'Working / fixed tilt', fraction: 0.7, arrayAcres: 12.74, density: 0.35, mwdc: 4.46, mwac: 3.43, modules: 6900 },
    { name: 'Higher / fixed tilt', fraction: 0.8, arrayAcres: 14.56, density: 0.35, mwdc: 5.1, mwac: 3.92, modules: 7800 },
  ],
  caveat: 'Final layout must account for panel dimensions, row spacing, roads, setbacks, drainage, topography, shading, easements, equipment and emergency access. The 650 W module rating is an illustrative input, not a selected product.',
  publicCopy: 'Tract 3 is the planned area for later solar development, with future BESS shown inside Building B. The 18.20-acre tract planning estimate is not a buildable-area survey. Generation capacity will follow site layout, electrical design, permitting and utility approval.',
} as const;

/**
 * Connectivity.
 *
 * Asymmetrical, per the owner's latest statement — the site had been
 * publishing symmetrical DIA, and the handoff is explicit that this must not
 * be silently reconciled in the other direction. A quote, an accepted order
 * and a live circuit are three different things, and none has been evidenced.
 */
export const network = {
  provider: 'Dobson Telephone Company',
  handoff: 'Owner-reported Dobson handoff in Building B',
  handoffNote: 'The external provider route and internal campus fiber paths remain unverified. The reported handoff location does not establish an accepted or live service.',
  handoffEvidence: 'owner-reported' as Evidence,
  service: '100 Gbps asymmetrical option',
  leadTime: '4–8 weeks',
  deliveryTarget: '8 October–5 November 2026 target window',
  leadTimeNote: 'Management estimate supplied 10 September 2026; subject to carrier installation and acceptance.',
  secondCircuit: 'An additional circuit requires a separate carrier scope and commercial review',
  diversityNote: 'Two circuits from one carrier do not establish route diversity, independent upstream failure domains or an aggregate rate to a single customer.',
  status: 'Planned — subject to carrier confirmation',
  evidence: 'planned' as Evidence,

  /** Commercial allowances belong to the versioned investor model. An earlier
   * carrier option does not establish an accepted quote or the model's scope. */
  commercialStatus: 'Carrier scope, recurring charges, installation and minimum term require confirmation',

  profile: 'Committed bandwidth, upstream and downstream rates, circuit type, order status, installation, IP arrangements, egress and service levels await carrier confirmation. Internet service is distinct from the internal GPU fabric and server network interfaces.',

  /** The handoff location is owner-reported; carrier delivery and service remain separate. */
  publicCopy: 'The owner reports the Dobson handoff in Building B; the external route remains unverified. A fiber service option is under review. The management delivery estimate was 4–8 weeks from 10 September 2026 and requires carrier confirmation. The reported 100 Gbps asymmetrical option is not an ordered, commissioned or included service commitment.',
} as const;

const b300SystemCount = 8;
const b300GpusPerSystem = 8;
const b300InstalledGpus = b300SystemCount * b300GpusPerSystem;
const b300SaleableGpus = 60;
const b300ReserveGpus = b300InstalledGpus - b300SaleableGpus;

/** Current proposed deployment, separate from the legacy RTX estimator below. */
export const publicDeployment = {
  gpuModel: 'NVIDIA B300',
  supplier: 'Supermicro',
  systems: b300SystemCount,
  gpusPerSystem: b300GpusPerSystem,
  gpus: b300InstalledGpus,
  saleableGpus: b300SaleableGpus,
  reserveGpus: b300ReserveGpus,
  label: `${b300InstalledGpus} B300 GPUs · proposed`,
  systemLabel: `${b300SystemCount} complete Supermicro systems`,
  building: 'Buildings A and C in the proposed campus layout',
  buildingNote: campusConcept.allocationNote + ' Gross building area is not usable rack space; equipment, aisles, service access and electrical systems require a measured layout.',
  cooling: 'Direct liquid cooling proposed; exact Supermicro SKU, cooling design and installed scope pending',
  scope: 'Management describes complete systems with CPUs, NVSwitch fabric, networking, storage, software and support. Exact configuration, included cluster infrastructure and support terms remain subject to supplier verification.',
  reserveNote: 'The four-GPU reserve is a financial allocation within eight complete systems. It is not a complete standby server or a validated failover design.',
  status: 'Proposed — procurement and commissioning ahead',
  ownership: 'Planned SmartTec-owned and operated systems; not a purchased or commissioned fleet',
  demand: 'Management reports signed three-year marketplace access; no signed customer contracts or guaranteed minimum receipts have been established. Payment is only for rented GPU-hours.',
  evidence: 'owner-reported' as Evidence,
} as const;

/**
 * Legacy RTX sizing reference, not the current deployment.
 *
 * Planned, not purchased and not operating. The exact product name matters:
 * RTX PRO 6000 Blackwell Server Edition. It has no NVLink, so eight cards are
 * eight separate 96 GB memories and never one pooled 768 GB space.
 */
export const compute = {
  gpuModel: 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
  servers: 2,
  b300Servers: 1,
  phaseSystems: '2 RTX nodes + 1 B300 node',
  phaseNote: `Earlier starter concept: two four-GPU RTX nodes and one B300 node. The current proposal is ${publicDeployment.gpus} B300 GPUs in ${publicDeployment.systems} Supermicro systems; this RTX example remains only for comparative sizing.`,
  gpusPerServer: 4,
  gpus: 8,
  vramPerGpu: '96 GB',
  systems: 'Earlier example: 2 servers · 4 × NVIDIA RTX PRO 6000 Blackwell Server Edition each',
  status: 'Legacy RTX sizing reference — not the current B300 deployment',
  evidence: 'planned' as Evidence,

  /** No NVLink on this part, so no pooled memory. */
  memoryNote: '96 GB per GPU. These are separate memories; the part has no NVLink and eight cards do not form one 768 GB space.',
  memorySource: 'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/',

  workloads: 'Inference, computer vision, rendering and workload-specific fine-tuning',
  workloadNote: 'Training and larger models require benchmarking before any commitment.',

  building: 'Data-center Buildings A and C',
  platform: 'The supported OEM configuration, CPU, memory, local storage and network specification are not yet selected',

  /**
   * An estimate, and labelled as one everywhere it appears. It is not a
   * measured load, and it does not establish an approved allocation.
   */
  load: 'approximately 7.5 kW estimated RTX-only IT load',
  loadNote: 'Estimate for two RTX nodes only. Excludes B300, customer-owned racks and facility loads; not a total first-phase power budget.',
  loadEvidence: 'calculated' as Evidence,

  /**
   * The handoff removes the claim that a roughly 4 kW server necessarily
   * requires liquid cooling. NVIDIA documents both air and liquid options.
   */
  cooling: 'Cooling will follow the selected OEM configuration and facility review; the GPU supports air or liquid options',

  target: 'Historical comparison only; no procurement or service date',

  /** Future evaluations, each needing its own OEM design, benchmark and order. */
  futurePlatforms: 'The current proposal uses B300 systems. RTX, AMD and Cerebras require separate workload and procurement cases.',
} as const;

/** Planned services. Inquiry categories do not establish commissioned capacity. */
export const offers = [
  {
    id: 'inference',
    name: 'Shared inference capacity',
    summary: 'Planned inference on SmartTec-owned GPU nodes shared by multiple customers. Scheduling, tenant controls, supported models and performance targets will be validated before service.',
  },
  {
    id: 'dedicated',
    name: 'Dedicated GPU servers',
    summary: 'Planned SmartTec-owned GPU servers for one tenant per node. The proposal will define isolation, GPU allocation, software access and support.',
  },
  {
    id: 'hosting',
    name: 'Colocation',
    summary: 'Planned space, power, cooling and connectivity for servers you own, subject to a separate equipment and facility allocation review.',
  },
] as const;

/**
 * Regional access.
 *
 * Preliminary road routes checked on 9 September 2026 with OSRM, without live
 * traffic, from an interpolated address point rather than a surveyed
 * entrance. They exist to keep the site from overstating proximity — they are
 * not entrance-to-entrance travel promises, and the earlier "one hour from
 * Dallas", "20–30 minutes to Texas Instruments" and "5–7 miles to Choctaw"
 * estimates are all contradicted by them.
 */
export const region = {
  origin: { lat: 33.998121, lon: -96.475238 },
  originNote: 'US Census Geocoder address-range interpolation, not a surveyed gate or boundary',
  checked: '9 September 2026',
  method: 'Preliminary OSRM road routing, no live traffic',
  destinations: [
    { name: 'Choctaw Casino & Resort — Durant', address: '4216 S. Highway 69/75', miles: 8.8, minutes: 12 },
    { name: 'Johnson Creek access, Lake Texoma', address: '215 Johnson Creek Road, Mead', miles: 5.8, minutes: 8 },
    { name: 'TxDOT Denison Travel Information Center', address: '6801 US 69/75', miles: 18.1, minutes: 23 },
    { name: 'Texas Instruments, Sherman', address: '6412 S. US 75', miles: 41.1, minutes: 46 },
    { name: 'Dallas City Hall', address: '1500 Marilla Street', miles: 96.0, minutes: 104 },
  ],
  publicCopy: 'Located on US Highway 70 in Mead, Oklahoma, the campus provides regional access to Durant, Lake Texoma and North Texas.',
  caveat: 'Estimates only. Proximity to a named company implies no customer, supplier or partnership relationship.',
} as const;

/** The five worlds of the cinematic route, in scroll order. */
export const stages = [
  {
    id: 'land',
    /** How this world breaks apart on the way out. */
    exit: 'shatter' as const,
    // Dawn over water: generous bloom on the caustics, gentle fringing.
    post: { bloomStrength: 0.72, bloomThreshold: 0.8, bloomRadius: 0.6, aberration: 0.0035, vignette: 0.42 },
    index: 0,
    scene: 'land' as const,
    ground: '#0e2419',
    ruler: '01 / SITE',
    kicker: 'Site 01 · Mead, Oklahoma',
    title: '39.39 acres.\nOne connected plan.',
    lede: `${site.acresRounded} on the US-70 corridor in ${site.county}, across three tracts: manufacturing, the existing buildings, and land for planned solar.`,
    chrome: 'light' as const,
    scrollVh: 250,
    hold: { label: 'Hold to continue', holdLabel: 'Keep holding', duration: 1.6 },
  },
  {
    id: 'wait',
    /** How this world breaks apart on the way out. */
    exit: 'tunnel' as const,
    // Pressure: hotter bloom, harder fringing, heavier corners.
    post: { bloomStrength: 1.15, bloomThreshold: 0.58, bloomRadius: 0.5, aberration: 0.008, vignette: 0.5 },
    index: 1,
    scene: 'wait' as const,
    ground: '#4d0806',
    ruler: '02 / PLAN',
    kicker: 'The delivery plan',
    title: 'Built in\nclear phases.',
    lede: 'UDGOK construction is targeted for 24 September 2026, OG&E commissioning for 8 October, and Dobson fiber for October–early November. First service follows installation and acceptance.',
    chrome: 'light' as const,
    scrollVh: 250,
    hold: { label: 'Hold to continue', holdLabel: 'Skipping', duration: 1.8 },
  },
  {
    id: 'power',
    /** How this world breaks apart on the way out. */
    exit: 'wipe' as const,
    // A low sun and lit charge strips are the whole subject — let them burn.
    post: { bloomStrength: 1.35, bloomThreshold: 0.52, bloomRadius: 0.7, aberration: 0.005, vignette: 0.42 },
    index: 2,
    scene: 'power' as const,
    ground: '#1a1204',
    ruler: '03 / POWER',
    kicker: 'Grid first · hybrid in phases',
    title: 'Grid first.\nHybrid next.',
    lede: `The initial deployment is planned on ${power.utility} grid power, with shared service and commissioning to validate. Solar and BESS follow as a separate investment. The energy scene illustrates the future hybrid concept.`,
    chrome: 'light' as const,
    scrollVh: 300,
    hold: { label: 'Hold to energise', holdLabel: 'Energising', duration: 2.0 },
  },
  {
    id: 'machine',
    /** How this world breaks apart on the way out. */
    exit: 'tunnel' as const,
    // Emissive LEDs in a dark hall: tight, cold bloom, minimal haze.
    post: { bloomStrength: 1.05, bloomThreshold: 0.62, bloomRadius: 0.38, aberration: 0.0045, vignette: 0.44 },
    index: 3,
    scene: 'machine' as const,
    ground: '#070a0f',
    ruler: '04 / COMPUTE',
    kicker: 'First phase · planned',
    title: `${publicDeployment.gpus} B300 GPUs.\nOne focused start.`,
    lede: `${publicDeployment.systemLabel}, proposed across Buildings A and C with direct liquid cooling. The four-plus-four arrangement is illustrative; final allocation, equipment and costs require validation. Procurement follows customer commitments and engineering acceptance.`,
    chrome: 'light' as const,
    scrollVh: 300,
    hold: { label: 'Hold to power on', holdLabel: 'Powering on', duration: 2.2 },
  },
  {
    id: 'campus',
    /** How this world breaks apart on the way out. */
    exit: 'wipe' as const,
    // Daylight. Restraint — bloom here would only look like fog.
    post: { bloomStrength: 0.45, bloomThreshold: 0.86, bloomRadius: 0.45, aberration: 0.0015, vignette: 0.22 },
    index: 4,
    scene: 'campus' as const,
    ground: '#dfe5e1',
    ruler: '05 / CAMPUS',
    kicker: 'The Blender campus study',
    /** Was "Live." — an unconditional operating state the site does not have. */
    title: 'Walk\nthe campus.',
    lede: 'A and C for compute. B for energy and network support. Explore the proposed campus, from liquid-cooled racks to inverter manufacturing and future solar.',
    chrome: 'dark' as const,
    scrollVh: 200,
    hold: null,
  },
] as const;

export type Stage = (typeof stages)[number];
export type SceneId = Stage['scene'];

/** Every stage now owns its world, so each is entered at rest. */
export const ENTRY_MIX: Record<string, number> = {
  land: 0, wait: 0, power: 0, machine: 0, campus: 0,
};
