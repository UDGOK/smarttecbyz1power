/**
 * Content model, kept separate from presentation.
 *
 * Every figure below is sourced from the existing SmartTec site record and
 * confirmed by the owner as authoritative. Anything not yet confirmed is
 * marked `placeholder: true` and rendered with a visible marker.
 */

export const company = {
  name: 'SmartTec',
  parent: 'Z1Power',
  full: 'SmartTec by Z1Power',
  tagline: 'AI data centers that start with the power.',
  domain: 'smarttec.z1power.com',
} as const;

export const site = {
  name: 'Mead, Oklahoma',
  designation: 'Site 01',
  address: '8460 US-70, Mead, OK 73449',
  county: 'Bryan County',
  acres: 30,
  ownership: 'Owned outright',
  buildings: [
    { id: 1, sqft: 3000, role: 'Phase 1A compute hall' },
    { id: 2, sqft: 3000, role: 'Phase 2 expansion shell' },
    { id: 3, sqft: 3000, role: 'Phase 3 expansion shell' },
  ],
  powerOn: 'Q4 2026',
} as const;

export const power = {
  transformer: '3 MVA',
  voltage: '208V three-phase',
  rate: '$0.08 / kWh',
  phase1aDraw: '~114 kW',
  phase1aUtilisation: '~4% of transformer capacity',
  headroom: '20× headroom before any utility upgrade',
  interconnectionQueue: 'None — behind-the-meter',
  industryQueue: '4–7 years',
  solarPlanned: '~500 kW on-site',
  storage: 'Z1Power LFP battery cabinets, at manufacturer cost',
} as const;

export const network = {
  provider: 'Dobson Telephone Company',
  speed: '100 Gbps symmetrical DIA',
  cost: '$8,075 / month',
  term: '60-month signed quote, installation waived',
} as const;

export const compute = {
  systems: '8 × NVIDIA HGX B200',
  gpus: 64,
  rentable: 60,
  load: '~114 kW IT load',
  cooling: 'Direct-to-chip liquid cooling',
  target: 'Q4 2026 power-on',
} as const;

/** The five worlds of the cinematic route, in scroll order. */
export const stages = [
  {
    id: 'land',
    index: 0,
    scene: 'land' as const,
    ground: '#0e2419',
    ruler: '-100 BP',
    kicker: 'Site 01 · Mead, Oklahoma',
    title: 'Thirty acres,\nalready ours.',
    lede: `${site.acres} acres on the US-70 corridor in ${site.county}, owned outright, with three buildings and a ${power.transformer} transformer already standing on it.`,
    chrome: 'light' as const,
    scrollVh: 250,
    hold: { label: 'Hold to continue', holdLabel: 'Keep holding', duration: 1.6 },
  },
  {
    id: 'wait',
    index: 1,
    scene: 'land' as const,
    ground: '#4d0806',
    ruler: '-75 BP',
    kicker: 'The industry problem',
    title: "Everyone else\nis in a queue.",
    lede: `The average interconnection queue runs ${power.industryQueue}. GPUs are not the constraint any more. Power is.`,
    chrome: 'light' as const,
    scrollVh: 250,
    hold: { label: 'Hold to skip the queue', holdLabel: 'Skipping', duration: 1.8 },
  },
  {
    id: 'power',
    index: 2,
    scene: 'power' as const,
    ground: '#1a1204',
    ruler: '-50 BP',
    kicker: 'Behind the meter',
    title: 'We never\njoined it.',
    lede: `${power.transformer} at ${power.voltage}, owned on site. ${power.solarPlanned} of solar and Z1Power LFP storage. No interconnection application, because none is required.`,
    chrome: 'light' as const,
    scrollVh: 300,
    hold: { label: 'Hold to energise', holdLabel: 'Energising', duration: 2.0 },
  },
  {
    id: 'machine',
    index: 3,
    scene: 'machine' as const,
    ground: '#070a0f',
    ruler: '-25 BP',
    kicker: 'Phase 1A',
    title: 'Sixty-four\nBlackwells.',
    lede: `${compute.systems}. ${compute.gpus} GPUs, ${compute.rentable} rentable. ${compute.load}, liquid cooled, drawing ${power.phase1aUtilisation}.`,
    chrome: 'light' as const,
    scrollVh: 300,
    hold: { label: 'Hold to power on', holdLabel: 'Powering on', duration: 2.2 },
  },
  {
    id: 'campus',
    index: 4,
    scene: 'campus' as const,
    ground: '#dfe5e1',
    ruler: '0 BP',
    kicker: `${site.powerOn}`,
    title: 'Live.',
    lede: 'Walk the campus. Size your deployment. Reserve capacity before Phase 1A fills.',
    chrome: 'dark' as const,
    scrollVh: 200,
    hold: null,
  },
] as const;

export type Stage = (typeof stages)[number];
export type SceneId = Stage['scene'];

/** Stage 2 is the land scene already crossed over to the queue palette. */
export const ENTRY_MIX: Record<string, number> = {
  land: 0, wait: 1, power: 0, machine: 0, campus: 0,
};
