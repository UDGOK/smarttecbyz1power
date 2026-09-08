/**
 * Sizing rules for the deployment configurator.
 *
 * Every rule the recommendation is built from lives here as typed data, so it
 * can be tuned without opening `src/lib/configurator.ts`. Two kinds of number
 * appear below and they are kept strictly apart:
 *
 *   - Derived — read out of `src/data/site.ts` at module load, so if the site
 *     record changes the configurator follows it. Nothing is retyped by hand.
 *   - Estimated — not in the site record. Every one carries `estimated: true`,
 *     is listed in `assumptions`, and is rendered in the UI under a visible
 *     "estimated" marker. Tune these; do not promote them to fact.
 */

import { compute, power, site } from './site';

/** Pull the first number out of a site-record string ("~114 kW" -> 114). */
function firstNumber(source: string, fallback: number): number {
  const match = source.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

const nf = new Intl.NumberFormat('en-US');

const PHASE_1A_KW = firstNumber(power.phase1aDraw, 114);          // '~114 kW'
const TRANSFORMER_KVA = firstNumber(power.transformer, 3) * 1000; // '3 MVA'
const ENERGY_RATE = firstNumber(power.rate, 0.08);                // '$0.08 / kWh'

/** The fixed envelope of Phase 1A. Read-only; all of it comes from site.ts. */
export const envelope = {
  systems: compute.systems,
  totalGpus: compute.gpus,
  rentableGpus: compute.rentable,
  cooling: compute.cooling,
  transformerLabel: power.transformer,
  transformerKva: TRANSFORMER_KVA,
  voltage: power.voltage,
  phase1aKw: PHASE_1A_KW,
  phase1aUtilisation: power.phase1aUtilisation,
  headroom: power.headroom,
  energyRate: ENERGY_RATE,
  energyRateLabel: power.rate,
  /** Rated draw of one GPU: the Phase 1A load spread across the installed GPUs. */
  kwPerGpu: PHASE_1A_KW / compute.gpus,
  powerOn: site.powerOn,
  hall: site.buildings[0],
  expansion: [site.buildings[1], site.buildings[2]],
} as const;

/**
 * Tunable coefficients. These are the dials a non-engineer should reach for
 * first; none of them are in the site record, so all of them read as estimates
 * in the UI.
 */
export const rules = {
  /** Cooling loop, switching and control draw on top of the GPUs. ESTIMATE. */
  ancillaryKw: 3,
  /** Applied when the workload question is unanswered. */
  defaultDrawFactor: 1,
  /** Hours in the quoted energy period when the term question is unanswered. */
  defaultEnergyHours: 730,
  defaultEnergyPeriod: 'month',
  /** Above this share of the rentable GPUs the fit reads as "fills Phase 1A". */
  tightGpuShare: 0.75,
  /** Above this share of the Phase 1A load the fit reads as "fills Phase 1A". */
  tightKwShare: 0.9,
} as const;

export type QuestionId = 'workload' | 'model' | 'gpus' | 'storage' | 'term';

/** What one answer does to the sizing. Every field is optional and additive. */
export interface OptionEffects {
  /** GPUs this answer asks for. The upper bound is what gets quoted. */
  gpuRange?: { min: number; max: number };
  /** Fewest GPUs this answer will run on, whatever the GPU question said. */
  gpuFloor?: number;
  /** Why that floor exists — shown verbatim when an answer lifts the count. */
  gpuFloorReason?: string;
  /** Multiplier on rated per-GPU draw: how hard this keeps the silicon working. */
  drawFactor?: number;
  /** Fixed kW added on top of the GPU draw. */
  addKw?: number;
  /** Hours the quoted energy line covers, and what to call that period. */
  energyHours?: number;
  energyPeriod?: string;
  /** One line added to the recommendation's notes. */
  note?: string;
}

export interface ConfiguratorOption {
  id: string;
  /** Card headline. */
  label: string;
  /** One supporting line under the headline. */
  detail: string;
  /** Short form used on the answered-summary chip. */
  chip: string;
  effects: OptionEffects;
}

export interface ConfiguratorQuestion {
  id: QuestionId;
  /** Mono micro-label above the prompt. */
  kicker: string;
  prompt: string;
  help: string;
  /** Label on the answered-summary chip. */
  chipLabel: string;
  options: ConfiguratorOption[];
}

export const questions: ConfiguratorQuestion[] = [
  {
    id: 'workload',
    kicker: 'Workload',
    prompt: 'What are you running?',
    help: 'This sets how hard the silicon is held against its rated draw.',
    chipLabel: 'Workload',
    options: [
      {
        id: 'training',
        label: 'Training',
        detail: 'Pre-training runs, days to weeks, all-reduce across every node.',
        chip: 'Training',
        effects: {
          drawFactor: 1,
          gpuFloor: 8,
          gpuFloorReason: 'a training run wants a whole HGX node',
          note: 'Sustained training holds the GPUs near rated draw — sized at full load.',
        },
      },
      {
        id: 'finetune',
        label: 'Fine-tuning',
        detail: 'LoRA and full fine-tunes on top of an existing checkpoint.',
        chip: 'Fine-tuning',
        effects: {
          drawFactor: 0.9,
          gpuFloor: 4,
          gpuFloorReason: 'a fine-tune wants at least half a node',
          note: 'Fine-tuning runs hot but bursty — sized just under rated load.',
        },
      },
      {
        id: 'inference',
        label: 'Inference',
        detail: 'Serving a model to production traffic, latency bound.',
        chip: 'Inference',
        effects: {
          drawFactor: 0.72,
          note: 'Serving traffic leaves headroom between bursts — sized below rated load.',
        },
      },
      {
        id: 'research',
        label: 'Research',
        detail: 'Interactive experiments, notebooks, evaluation sweeps.',
        chip: 'Research',
        effects: {
          drawFactor: 0.55,
          note: 'Interactive work idles between sessions — sized at roughly half load.',
        },
      },
    ],
  },
  {
    id: 'model',
    kicker: 'Model size',
    prompt: 'How large is the model?',
    help: 'Weights and cache have to sit somewhere. Bigger models set a floor on the GPU count.',
    chipLabel: 'Model',
    options: [
      {
        id: 'small',
        label: 'Under 10B',
        detail: 'Small language models, embeddings, classifiers, vision heads.',
        chip: '<10B',
        effects: { gpuFloor: 1, note: 'Under 10B parameters fits comfortably on a single GPU.' },
      },
      {
        id: 'mid',
        label: '10 – 70B',
        detail: 'The workhorse open-weight class.',
        chip: '10–70B',
        effects: {
          gpuFloor: 2,
          gpuFloorReason: 'a 10–70B model wants at least two GPUs',
          note: 'A 10–70B model wants two GPUs or more once cache is accounted for.',
        },
      },
      {
        id: 'large',
        label: '70 – 200B',
        detail: 'Frontier-adjacent dense models and mid-size MoE.',
        chip: '70–200B',
        effects: {
          gpuFloor: 4,
          gpuFloorReason: 'a 70–200B model wants half a node to hold weights and cache',
          note: 'A 70–200B model is sharded across at least half an HGX node.',
        },
      },
      {
        id: 'frontier',
        label: '200B+',
        detail: 'Frontier-scale, tensor and pipeline parallel.',
        chip: '200B+',
        effects: {
          gpuFloor: 8,
          gpuFloorReason: 'a 200B+ model wants a full HGX node',
          note: 'A 200B+ model is sized across a full node so the NVLink domain stays intact.',
        },
      },
    ],
  },
  {
    id: 'gpus',
    kicker: 'Scale',
    prompt: 'How many GPUs do you want?',
    help: `Phase 1A is ${compute.systems} — ${compute.gpus} GPUs, ${compute.rentable} of them rentable.`,
    chipLabel: 'GPUs',
    options: [
      {
        id: 'small',
        label: '1 – 4',
        detail: 'A slice of one system. Enough to serve or to prototype.',
        chip: '1–4 GPUs',
        effects: { gpuRange: { min: 1, max: 4 }, note: 'A partial node, carved out of a shared system.' },
      },
      {
        id: 'node',
        label: '8',
        detail: 'One whole HGX B200 — a full NVLink domain, nothing shared.',
        chip: '8 GPUs',
        effects: { gpuRange: { min: 8, max: 8 }, note: 'One dedicated HGX B200, all eight GPUs on one NVLink fabric.' },
      },
      {
        id: 'cluster',
        label: '16 – 32',
        detail: 'Two to four systems, fabric-joined.',
        chip: '16–32 GPUs',
        effects: { gpuRange: { min: 16, max: 32 }, note: 'A multi-node cluster, quoted at the top of the range.' },
      },
      {
        id: 'hall',
        label: `Full ${compute.rentable}`,
        detail: `Every rentable GPU in Phase 1A. ${compute.systems}, ${compute.gpus} installed.`,
        chip: `${compute.rentable} GPUs`,
        effects: {
          gpuRange: { min: compute.rentable, max: compute.rentable },
          note: `All ${compute.rentable} rentable GPUs — the whole of Phase 1A, with ${compute.gpus - compute.rentable} held back as spares.`,
        },
      },
    ],
  },
  {
    id: 'storage',
    kicker: 'Storage',
    prompt: 'How much data sits next to it?',
    help: 'Storage draws power in the same hall and comes off the same envelope.',
    chipLabel: 'Storage',
    options: [
      {
        id: 'small',
        label: 'Under 10 TB',
        detail: 'Checkpoints and a working set. Local NVMe.',
        chip: '<10 TB',
        effects: { addKw: 0.6, note: 'Under 10 TB rides on node-local NVMe — near-zero extra draw.' },
      },
      {
        id: 'mid',
        label: '10 – 100 TB',
        detail: 'A shared dataset volume on a dedicated array.',
        chip: '10–100 TB',
        effects: { addKw: 2, note: 'A 10–100 TB array adds a couple of kW of its own.' },
      },
      {
        id: 'large',
        label: '100 TB+',
        detail: 'Full corpora held hot, in-hall.',
        chip: '100 TB+',
        effects: { addKw: 6, note: 'Holding 100 TB+ hot in-hall is the largest non-GPU load in the estimate.' },
      },
      {
        id: 'byo',
        label: 'Bring your own',
        detail: 'You rack your own array, and we allow for it separately.',
        chip: 'BYO storage',
        effects: { addKw: 0, note: 'Customer-supplied storage is excluded from this estimate — send us its nameplate draw.' },
      },
    ],
  },
  {
    id: 'term',
    kicker: 'Term',
    prompt: 'How long do you need it?',
    help: `Energy is billed at ${power.rate}. The term sets what the quoted energy line covers.`,
    chipLabel: 'Term',
    options: [
      {
        id: 'hourly',
        label: 'Hourly',
        detail: 'On demand, off the shared pool, no commitment.',
        chip: 'Hourly',
        effects: { energyHours: 1, energyPeriod: 'hour', note: 'Hourly capacity comes out of the shared pool and is not held for you.' },
      },
      {
        id: 'monthly',
        label: 'Monthly',
        detail: 'Rolling month, hardware reserved while you hold it.',
        chip: 'Monthly',
        effects: { energyHours: 730, energyPeriod: 'month', note: 'A rolling month holds the same physical GPUs for as long as you keep it.' },
      },
      {
        id: 'y1',
        label: '12-month',
        detail: 'A year of dedicated capacity from power-on.',
        chip: '12-month',
        effects: { energyHours: 730, energyPeriod: 'month', note: `A 12-month term is dedicated from ${site.powerOn} power-on.` },
      },
      {
        id: 'y3',
        label: '36-month',
        detail: 'Three years. The longest term Phase 1A is quoted on.',
        chip: '36-month',
        effects: { energyHours: 730, energyPeriod: 'month', note: `A 36-month term reserves the footprint outright from ${site.powerOn}.` },
      },
    ],
  },
];

export type FitLevel = 'phase-1a' | 'phase-1a-tight' | 'expansion';

export interface FitCopy {
  /** Short verdict for the running readout. */
  label: string;
  /** Headline on the result panel. */
  headline: string;
  detail: string;
}

export const fitLevels: Record<FitLevel, FitCopy> = {
  'phase-1a': {
    label: 'Fits Phase 1A',
    headline: 'It fits Phase 1A.',
    detail: `Building ${envelope.hall.id} — ${nf.format(envelope.hall.sqft)} sqft, ${envelope.systems}, direct-to-chip liquid cooled — absorbs this inside the ${power.phase1aDraw} Phase 1A load, and the ${envelope.transformerLabel} transformer barely notices.`,
  },
  'phase-1a-tight': {
    label: 'Fills Phase 1A',
    headline: 'This is most of Phase 1A.',
    detail: `A deployment this size takes the bulk of the ${envelope.rentableGpus} rentable GPUs and the ${power.phase1aDraw} that go with them. Buildings ${envelope.expansion.map((b) => b.id).join(' and ')} — ${nf.format(envelope.expansion[0].sqft)} sqft each — are the next block, so reserve before Phase 1A fills.`,
  },
  expansion: {
    label: 'Needs Buildings 2/3',
    headline: 'This runs past Phase 1A.',
    detail: `Beyond ${envelope.rentableGpus} rentable GPUs or the ${power.phase1aDraw} Phase 1A load, the deployment stages into Building ${envelope.expansion.map((b) => b.id).join(' or ')} — ${nf.format(envelope.expansion[0].sqft)} sqft shells already standing, behind the same ${envelope.transformerLabel} service with ${power.headroom.toLowerCase()}.`,
  },
};

export interface Assumption {
  id: string;
  label: string;
  value: string;
  /** Where the number came from, in plain words. */
  source: string;
  estimated: boolean;
}

/** Rendered under the result as "how this was worked out". */
export const assumptions: Assumption[] = [
  {
    id: 'per-gpu',
    label: 'Draw per GPU',
    value: `${envelope.kwPerGpu.toFixed(2)} kW`,
    source: `${power.phase1aDraw} Phase 1A load ÷ ${envelope.totalGpus} installed GPUs`,
    estimated: false,
  },
  {
    id: 'envelope',
    label: 'Phase 1A envelope',
    value: `${envelope.rentableGpus} GPUs · ${power.phase1aDraw}`,
    source: `${envelope.systems}, ${envelope.rentableGpus} rentable, ${envelope.cooling.toLowerCase()}`,
    estimated: false,
  },
  {
    id: 'transformer',
    label: 'Transformer',
    value: `${envelope.transformerLabel} at ${envelope.voltage}`,
    source: `Share is taken against ${nf.format(envelope.transformerKva)} kVA nameplate, the same basis as the site record's ${power.phase1aUtilisation}`,
    estimated: false,
  },
  {
    id: 'energy',
    label: 'Energy rate',
    value: envelope.energyRateLabel,
    source: 'Site record. Power only — GPU rental, network and support are quoted separately',
    estimated: false,
  },
  {
    id: 'draw-factor',
    label: 'Workload draw factors',
    value: '55% – 100% of rated',
    source: 'How hard each workload class holds the silicon. Not in the site record',
    estimated: true,
  },
  {
    id: 'storage',
    label: 'Storage draw',
    value: '0 – 6 kW',
    source: 'Array draw by capacity tier. Not in the site record',
    estimated: true,
  },
  {
    id: 'ancillary',
    label: 'Ancillary draw',
    value: `${rules.ancillaryKw} kW`,
    source: 'Cooling loop, switching and controls. Not in the site record',
    estimated: true,
  },
];
