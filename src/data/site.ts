/**
 * Content model, kept separate from presentation.
 *
 * Rewritten against the designer handoff of 9 September 2026, which is the
 * authority for every figure below. That review replaced a set of claims the
 * site had been publishing without support — a 3 MVA service, three identical
 * 3,000 sq ft buildings, a 0.25% utilisation and twentyfold headroom
 * narrative, "no interconnection application required", symmetrical carrier
 * service, and rentable GPUs that have not been procured.
 *
 * Two rules govern everything here, both from the handoff:
 *
 *   1. One shared record generates every occurrence. A figure that appears in
 *      a headline, a scene label, an accessibility string and a meta
 *      description is one constant, so a correction cannot land in four places
 *      and miss a fifth.
 *   2. Status travels with the number. Owner-reported, calculated, planned and
 *      unresolved are different things, and the label is part of the value
 *      rather than a footnote somewhere else on the page.
 *
 * Anything still unconfirmed is marked `[PLACEHOLDER: …]` and renders with a
 * visible marker. Do not resolve one by inventing a figure.
 */

/**
 * How a fact is known. From the handoff's evidence table — these are its
 * words, and they decide how a value may be published.
 */
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

/** The date the handoff's figures were reviewed. */
export const REVIEWED = '9 September 2026';

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
  entity: '[PLACEHOLDER: legal contracting entity, and whether SmartTec is a division, subsidiary or separately owned entity associated with Z1Power]',
} as const;

/**
 * The campus.
 *
 * Three tracts. The acreage is the sum of the three owner-reported tract
 * sizes, so "approximately 40 acres" is rounded wording rather than a second
 * measurement — the 0.79-acre difference is unexplained and stays that way
 * until the recorded survey settles it.
 */
export const site = {
  name: 'Mead, Oklahoma',
  designation: 'Site 01',
  address: '8460 US Highway 70, Mead, OK 73449',
  county: 'Bryan County',

  /** Calculated: 13.50 + 7.51 + 18.20. */
  acres: 39.21,
  /** What may be said in a headline. The exact figure is `acres`. */
  acresRounded: 'approximately 40 acres',
  acresNote: 'Sum of three owner-reported tract sizes; reconcile with the recorded survey.',
  acresEvidence: 'calculated' as Evidence,

  ownership: 'Owner-reported as purchased',
  ownershipNote: '[PLACEHOLDER: owning entity, liens, and which assets are included in the reported value]',

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
   */
  buildings: [
    { id: 'A', sqft: 1500, role: 'Designated for data-center use' },
    { id: 'B', sqft: 2083, role: 'Designated for data-center use' },
    { id: 'C', sqft: 3535, role: 'Designated for data-center use; shared electrical distribution originates here' },
  ],
  /** Calculated: A + B + C. Gross existing area. */
  buildingArea: 7118,
  buildingAreaLabel: '7,118 sq ft of existing building area',
  buildingStatus: 'Fit-out and commissioning status not established',

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
    startTarget: 'approximately 23 September 2026',
    startTargetNote: 'Management target. Permit, financing and contractor readiness not independently verified.',
    allocation: '[PLACEHOLDER: which of the two buildings takes inverter assembly and which takes battery assembly]',
    evidence: 'planned' as Evidence,
  },

  /**
   * The compute target. A target requiring revalidation, not a launch date —
   * the qualifier is inside the value so no interpolation can drop it.
   */
  powerOn: 'Q4 2026 target',
  powerOnNote: 'Earlier target requiring revalidation. Procurement, building assignment, fit-out, network acceptance and first paid workload are separate milestones.',
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
  serviceOrigin: 'Distributed from Building C to Buildings A, B and C',
  serviceScope: 'One shared rating across the three buildings, not three separate supplies',
  serviceEvidence: 'owner-reported' as Evidence,

  /** sqrt(3) × 208 V × 3,000 A ÷ 1000. Apparent power only. */
  serviceApparent: '≈1.081 MVA apparent',
  serviceApparentNote: 'Arithmetic from the stated service current. Not a transformer nameplate and not available IT capacity.',
  serviceApparentEvidence: 'calculated' as Evidence,

  houseOfficeService: '200 A, separate',
  houseOfficeNote: '[PLACEHOLDER: voltage, phase, metering and upstream arrangement for the house/office service]',

  /** The approved wording for what capacity is actually on offer. */
  allocation: 'Usable IT capacity will be allocated following electrical, cooling and commissioning review',

  transformerNameplate: '[PLACEHOLDER: transformer nameplate rating, single-line diagram, feeder ratings, serving utility identity and allocation]',

  rate: '[PLACEHOLDER: contracted energy rate and demand charges]',

  /**
   * Cooling. The owner's statement lists 15 tons at C, 10 at B and a further
   * 10 at C, and also says all three buildings are cooled — which leaves
   * Building A unassigned. That contradiction is not silently corrected here.
   */
  hvac: 'Existing HVAC serves the data-center buildings. Building-specific cooling capacity and operating limits are being documented for the planned deployments.',
  hvacUnresolved: '[PLACEHOLDER: whether the third stated 10-ton unit is a second Building C unit or a mistaken label, and what serves Building A]',
  hvacEvidence: 'unresolved' as Evidence,

  /** Storage. A power rating; the usable energy and status are not known. */
  storage: 'Z1Power LFP battery cabinets',
  storageRating: '2 MW reported',
  storageNote: 'A power rating. Usable MWh, installed status and transfer architecture are unresolved.',
  storageSiting: 'Concrete pads behind Building B are a candidate location only',
  storageEvidence: 'unresolved' as Evidence,

  /**
   * Interconnection. The absolute "no application required" claim is gone.
   * Utility requirements are specific to the serving utility, which has not
   * been established for this property.
   */
  interconnection: 'Utility interconnection requirements have not been established for this property',
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
  leadTime: 'approximately 30 days',
  leadTimeNote: '[PLACEHOLDER: the event the provisioning estimate runs from]',
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

  profile: '[PLACEHOLDER: committed downstream and upstream rates, circuit type, order status, delivery conditions, term, IP/BGP arrangements, egress terms and service levels]',

  /** The approved interim wording, verbatim. */
  publicCopy: 'High-capacity Dobson connectivity is planned. Management reports a 100 Gbps service option with an approximately 30-day provisioning estimate and the option to evaluate a second 100 Gbps circuit. Final bandwidth profiles, delivery terms and resilience design are subject to carrier confirmation.',
} as const;

/**
 * Compute.
 *
 * Planned, not purchased and not operating. The exact product name matters:
 * RTX PRO 6000 Blackwell Server Edition. It has no NVLink, so eight cards are
 * eight separate 96 GB memories and never one pooled 768 GB space.
 */
export const compute = {
  gpuModel: 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
  servers: 2,
  gpusPerServer: 4,
  gpus: 8,
  vramPerGpu: '96 GB',
  systems: '2 planned servers · 4 × NVIDIA RTX PRO 6000 Blackwell Server Edition each',
  status: 'Planned — procurement and commissioning not complete',
  evidence: 'planned' as Evidence,

  /** No NVLink on this part, so no pooled memory. */
  memoryNote: '96 GB per GPU. These are separate memories; the part has no NVLink and eight cards do not form one 768 GB space.',
  memorySource: 'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/',

  workloads: 'Inference, computer vision, rendering and workload-specific fine-tuning',
  workloadNote: 'Training and larger models require benchmarking before any commitment.',

  building: '[PLACEHOLDER: which building takes the first installation]',
  platform: '[PLACEHOLDER: selected OEM server, CPU, RAM, local storage and networking]',

  /**
   * An estimate, and labelled as one everywhere it appears. It is not a
   * measured load, and it does not establish an approved allocation.
   */
  load: 'approximately 7.5 kW estimated IT load',
  loadNote: 'Estimated from board power and host overhead. Not measured, and not an approved facility allocation.',
  loadEvidence: 'calculated' as Evidence,

  /**
   * The handoff removes the claim that a roughly 4 kW server necessarily
   * requires liquid cooling. NVIDIA documents both air and liquid options.
   */
  cooling: '[PLACEHOLDER: cooling method, which follows the selected OEM configuration and facility review — NVIDIA documents both air and liquid options for this part]',

  target: 'Q4 2026 target',

  /** Future evaluations, each needing its own OEM design, benchmark and order. */
  futurePlatforms: 'B300, AMD and Cerebras are future platform evaluations, not interchangeable upgrades inside the RTX nodes',
} as const;

/** The three things actually on offer. */
export const offers = [
  {
    id: 'dedicated',
    name: 'Dedicated RTX compute',
    summary: 'Dedicated allocation on the planned RTX PRO 6000 Blackwell nodes.',
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
    ruler: '-100 BP',
    kicker: 'Site 01 · Mead, Oklahoma',
    title: 'Forty acres,\nthree tracts.',
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
    ruler: '-75 BP',
    kicker: 'The industry problem',
    title: 'Power is\nthe constraint.',
    lede: 'Across the industry, the gate on new AI capacity has moved from GPU supply to electrical service and the time it takes to secure it.',
    chrome: 'light' as const,
    scrollVh: 250,
    hold: { label: 'Hold to skip the queue', holdLabel: 'Skipping', duration: 1.8 },
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
    ruler: '-50 BP',
    kicker: 'On the ground',
    title: 'Service,\nalready standing.',
    lede: `Buildings A, B and C share owner-reported ${power.service} distribution originating at Building C. ${site.tracts[2].acres} acres are set aside for planned solar and storage. Usable IT capacity follows engineering review.`,
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
    ruler: '-25 BP',
    kicker: 'First phase · planned',
    title: 'Eight\nBlackwells.',
    lede: `${compute.servers} planned servers, ${compute.gpusPerServer} × ${compute.gpuModel} each. ${compute.vramPerGpu} per GPU. ${compute.load}. Procurement and commissioning are not complete.`,
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
    ruler: '0 BP',
    kicker: 'Conceptual campus diagram',
    /** Was "Live." — an unconditional operating state the site does not have. */
    title: 'Walk\nthe campus.',
    lede: 'Three tracts, three existing buildings, and land for what comes next. Size a deployment and we will confirm what the facility can actually take.',
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
