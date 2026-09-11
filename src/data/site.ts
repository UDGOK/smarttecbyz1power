/** Shared public record: owner corrections through 11 September 2026 supersede the earlier handoff. See docs/project-source-of-truth.md. */
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
export const REVIEWED = '11 September 2026';

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
  ownershipNote: 'Management confirms a signed 50-year site-use agreement for SmartTec. The agreement and title records remain subject to document review; land ownership is not attributed to SmartTec.',

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
      use: 'Planned solar and energy storage',
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
  powerOn: 'Q4 2026 target',
  powerOnNote: 'First service follows equipment installation, cooling, utility commissioning and carrier acceptance. The Q4 target is not an availability guarantee.',
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

  transformerNameplate: 'An on-site 3,000 A, 208 V, three-phase transformer is reported through OG&E. Final IT allocation follows electrical design and commissioning.',

  rate: 'a contracted rate and demand-charge schedule to be agreed before an offer',

  behindMeter: {
    sources: 'Solar, batteries and gas generators',
    agreement: 'Supply agreement reported by management',
    rate: 'Below $0.07/kWh, reported by management',
    note: 'Reserved continuous capacity, service date and complete fuel, maintenance, loss, replacement and equipment costs await confirmation. This is not a verified all-in tariff or a customer electricity offer.',
    evidence: 'owner-reported' as Evidence,
  },

  /**
   * The latest owner correction confirms that all eight proposed systems go
   * in one building with no working air conditioning. No old HVAC capacity
   * is credited. The exact building, equipment and mechanical yard are open.
   */
  hvac: 'All cooling is new for the proposed eight-system deployment in one building. Direct liquid cooling serves the servers; residual-air and room cooling require a separate costed provision.',
  hvacUnresolved: 'New and warranted refurbished plant are being compared. Rear-door versus conventional room cooling, optional economizer dry coolers, fluid temperatures, siting and redundancy require quotes and engineering acceptance.',
  hvacEvidence: 'unresolved' as Evidence,

  /** Storage. A power rating; the usable energy and status are not known. */
  storage: 'Z1Power LFP battery cabinets',
  storageRating: '2 MW reported',
  storageNote: 'Z1Power storage is planned alongside solar. Cabinet quantity, usable MWh and backup design will be sized to the approved load.',
  storageSiting: 'Concrete pads behind Building B are a candidate location only',
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
 * Planned solar and storage on Tract 3.
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
  status: 'Preliminary layout study',
  evidence: 'calculated' as Evidence,
  source: 'Berkeley Lab, Land Requirements for Utility-Scale PV (2022), pp. 7 and 13',
  sourceUrl: 'https://emp.lbl.gov/sites/default/files/emp-files/land_requirements_for_utility-scale_pv.pdf',
  scenarios: [
    { name: 'Lower / tracking', fraction: 0.6, arrayAcres: 10.92, density: 0.24, mwdc: 2.62, mwac: 2.02, modules: 4000 },
    { name: 'Working / fixed tilt', fraction: 0.7, arrayAcres: 12.74, density: 0.35, mwdc: 4.46, mwac: 3.43, modules: 6900 },
    { name: 'Higher / fixed tilt', fraction: 0.8, arrayAcres: 14.56, density: 0.35, mwdc: 5.1, mwac: 3.92, modules: 7800 },
  ],
  caveat: 'Final layout must account for panel dimensions, row spacing, roads, setbacks, drainage, topography, shading, easements, equipment and emergency access. The 650 W module rating is an illustrative input, not a selected product.',
  publicCopy: 'Tract 3 provides 18.20 acres for planned solar and energy-storage development. Preliminary screening indicates potential for a multi-megawatt solar installation, subject to site layout, electrical design, permitting and utility approval.',
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
  service: '100 Gbps asymmetrical',
  leadTime: '4–8 weeks',
  deliveryTarget: '8 October–5 November 2026 target window',
  leadTimeNote: 'Management estimate supplied 10 September 2026; subject to carrier installation and acceptance.',
  secondCircuit: 'A second 100 Gbps circuit can be evaluated',
  diversityNote: 'Two circuits from one carrier do not establish route diversity, independent upstream failure domains or an aggregate rate to a single customer.',
  status: 'Planned — subject to carrier confirmation',
  evidence: 'planned' as Evidence,

  cost: '$8,075 / month',
  costStatus: 'Unverified commercial input, not a confirmed quote',
  term: '60 months',
  /** $8,075 × 12 and × 60. Before any other contractual charges. */
  costAnnual: '$96,900',
  costFullTerm: '$484,500',
  costEvidence: 'calculated' as Evidence,

  profile: 'Committed bandwidth, circuit type, order status, delivery terms, IP arrangements, egress and service levels await carrier confirmation',

  /** The approved interim wording, verbatim. */
  publicCopy: 'Dobson fiber is planned, with a management delivery estimate of 4–8 weeks from 10 September 2026. The reported 100 Gbps option, final service levels and resilience design remain subject to carrier confirmation.',
} as const;

/** Current proposed deployment, separate from the legacy RTX estimator below. */
export const publicDeployment = {
  gpuModel: 'NVIDIA B300',
  supplier: 'Supermicro',
  systems: 8,
  gpusPerSystem: 8,
  gpus: 64,
  saleableGpus: 60,
  reserveGpus: 4,
  label: '64 B300 GPUs · proposed',
  systemLabel: '8 complete Supermicro systems',
  building: 'One building; A or C allocation pending',
  cooling: 'Direct liquid cooling required; all cooling is new',
  scope: 'Management describes complete systems with CPUs, NVSwitch fabric, networking, storage, software and support. Exact configuration, included cluster infrastructure and support terms remain subject to supplier verification.',
  reserveNote: 'The four-GPU reserve is a financial allocation within eight complete systems. It is not a complete standby server or a validated failover design.',
  status: 'Proposed — procurement and commissioning ahead',
  demand: 'Active customer discussions; no signed customer contracts or guaranteed minimum receipts have been established.',
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
  phaseNote: 'Earlier starter concept: two four-GPU RTX nodes and one B300 node. The current proposal is 64 B300 GPUs in eight Supermicro systems; this RTX example remains only for comparative sizing.',
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

  target: 'Q4 2026 target',

  /** Future evaluations, each needing its own OEM design, benchmark and order. */
  futurePlatforms: 'The current proposal uses B300 systems. RTX, AMD and Cerebras require separate workload and procurement cases.',
} as const;

/** The three things actually on offer. */
export const offers = [
  {
    id: 'dedicated',
    name: 'Dedicated B300 compute',
    summary: 'Proposed B300 capacity, with allocations assessed against workload and service requirements.',
  },
  {
    id: 'hosting',
    name: 'Customer-owned hosting',
    summary: 'Colocation for hardware you own, with reserved IT kW and rack allocation.',
  },
  {
    id: 'expansion',
    name: 'Customer-funded expansion',
    summary: 'Larger deployments built against a funded commitment.',
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
  checked: REVIEWED,
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
    lede: `${site.acresRounded} on the US-70 corridor in ${site.county}, across three tracts: manufacturing, the existing buildings, and land for planned solar and storage.`,
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
    kicker: 'On the ground',
    title: 'Power strategy.\nReadiness next.',
    lede: `Management reports a solar, battery and gas supply agreement, alongside a shared ${power.service} service awaiting OG&E commissioning. Reserved capacity and complete energy costs are still being confirmed.`,
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
    title: '64 B300 GPUs.\nOne focused start.',
    lede: `${publicDeployment.systemLabel}, proposed together in one building with new direct liquid cooling. Procurement follows customer commitments, complete costs and engineering acceptance. The scene is an illustrative hall, not inventory.`,
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
    kicker: 'Conceptual campus diagram',
    /** Was "Live." — an unconditional operating state the site does not have. */
    title: 'Walk\nthe campus.',
    lede: 'A and C for data centers. B for batteries and utilities. Manufacturing, solar and storage complete the campus plan. Explore the site, meet our team, or bring us your workload.',
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
