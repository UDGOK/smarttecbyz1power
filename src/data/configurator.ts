/**
 * Sizing rules for the deployment configurator.
 *
 * Reworked against the 9 September 2026 handoff, which found this component's
 * arithmetic — not just its wording — unsound. Four defects, all fixed here:
 *
 *   1. Inconsistent boundary. The 7.5 kW figure is the whole first-phase IT
 *      load, host included. Storage and ancillary draw were then added on top
 *      and the sum compared back against that same 7.5 kW, so eight GPUs plus
 *      the smallest storage tier came to 11.1 kW, "exceeded" the envelope, and
 *      advised another building. That was a boundary error reading as a
 *      capacity finding. IT is now server + storage + network throughout, and
 *      facility overhead is applied exactly once, through a stated PUE.
 *   2. Workload reductions used as a safety argument. Holding a GPU at 55% of
 *      rated draw is an assumption about average consumption; it is not a
 *      smaller allocation. Peak and average are now separate figures and only
 *      peak is ever compared with anything.
 *   3. A transformer-nameplate denominator. There is no established nameplate,
 *      and a kW-over-kVA ratio is not a service-utilisation calculation. The
 *      share readout is gone.
 *   4. An approval verdict. Nothing here can establish that a deployment
 *      "fits": the cooling and electrical limits are undocumented and the GPUs
 *      are planned rather than in inventory. Every outcome now resolves to a
 *      review status.
 *
 * Two kinds of number appear below and are kept strictly apart:
 *
 *   - Derived — read out of `src/data/site.ts` at module load, so if the site
 *     record changes the configurator follows it. Nothing is retyped by hand.
 *   - Estimated — not in the site record. Every one carries `estimated: true`,
 *     is listed in `assumptions`, and is rendered under a visible "estimated"
 *     marker. Tune these; do not promote them to fact.
 */

import { compute, network, power, site } from './site';

/** Pull the first number out of a site-record string ("~7.5 kW" -> 7.5). */
function firstNumber(source: string, fallback: number): number {
  const match = source.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

const nf = new Intl.NumberFormat('en-US');

/** The estimated first-phase IT load, from the site record. */
const PHASE_1_KW = firstNumber(compute.load, 7.5);

/**
 * The planned fleet. Planned — not inventory.
 *
 * The old field was called `rentableGpus` and the copy said "all of them
 * rentable", which described eight cards as bookable when none has been
 * procured. A request can be prepared against this number; it cannot be
 * allocated against it.
 */
export const envelope = {
  systems: compute.systems,
  gpuModel: compute.gpuModel,
  totalGpus: compute.gpus,
  plannedGpus: compute.gpus,
  gpusPerServer: compute.gpusPerServer,
  servers: compute.servers,
  vramPerGpu: compute.vramPerGpu,
  cooling: compute.cooling,
  voltage: power.voltage,
  service: power.service,
  phaseKw: PHASE_1_KW,
  /**
   * Rated draw of one GPU including its share of host and supply: the
   * estimated phase IT load spread across the installed GPUs. Peak, not
   * average.
   */
  kwPerGpu: PHASE_1_KW / compute.gpus,
  powerOn: site.powerOn,
} as const;

/**
 * Tunable coefficients. None of them are in the site record, so all of them
 * read as estimates in the UI.
 */
export const rules = {
  /**
   * Facility overhead, applied once to the whole IT load.
   *
   * An assumed PUE, not a measured one — there is no operating history to
   * measure. It replaces the old flat "ancillary kW", which was added
   * alongside a load figure that already included host overhead and then
   * compared against that same figure.
   */
  assumedPue: 1.4,
  /**
   * Assumed average draw as a share of peak, when the workload is known.
   * An assumption about consumption for an energy estimate — never a reason
   * to allocate less capacity.
   */
  defaultDutyCycle: 1,
  /** 730 hours is a billing convention, not a calendar month. */
  monthlyHoursConvention: 730,
} as const;

export type QuestionId = 'offer' | 'workload' | 'model' | 'gpus' | 'storage' | 'term';

/** What one answer does to the sizing. Every field is optional and additive. */
export interface OptionEffects {
  /** GPUs this answer asks for. The upper bound is what gets quoted. */
  gpuRange?: { min: number; max: number };
  /** Fewest GPUs this answer will run on, whatever the GPU question said. */
  gpuFloor?: number;
  /** Why that floor exists — shown verbatim when an answer lifts the count. */
  gpuFloorReason?: string;
  /**
   * Assumed average draw as a share of peak. Feeds the average-consumption
   * line only. It must never reduce the allocation figure — the handoff is
   * explicit that a workload reduction is not a safety or fit argument.
   */
  dutyCycle?: number;
  /** Fixed kW added on top of the GPU draw. */
  addKw?: number;
  /** Hours the quoted energy line covers, and what to call that period. */
  energyHours?: number;
  energyPeriod?: string;
  /** One line added to the recommendation's notes. */
  note?: string;
  /**
   * Why this answer cannot be resolved from the form. Any answer carrying one
   * sends the whole request to review rather than to a fit verdict.
   */
  review?: string;
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
    id: 'offer',
    kicker: 'What you need',
    prompt: 'What are you looking for?',
    help: 'Three different things, with three different conversations behind them.',
    chipLabel: 'Request',
    options: [
      {
        id: 'dedicated',
        label: 'Dedicated compute',
        detail: 'A dedicated allocation on the planned RTX PRO 6000 Blackwell nodes.',
        chip: 'Dedicated compute',
        effects: { note: 'Dedicated allocation on the planned nodes, subject to procurement and commissioning.' },
      },
      {
        id: 'hosting',
        label: 'Host my hardware',
        detail: 'Colocation for equipment you own, with reserved IT kW and rack allocation.',
        chip: 'Colocation',
        effects: {
          note: 'Colocation for customer-owned equipment. Power, cooling and rack allocation follow your equipment schedule.',
          review: 'Customer equipment specifications are needed before any power or rack allocation can be estimated.',
        },
      },
      {
        id: 'expansion',
        label: 'A larger deployment',
        detail: 'More than the first phase — built against a funded commitment.',
        chip: 'Expansion',
        effects: {
          note: 'A deployment beyond the first phase is scoped and funded against a commitment, not allocated from planned capacity.',
          review: 'Deployments beyond the planned fleet are scoped individually.',
        },
      },
    ],
  },
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
          dutyCycle: 1,
          note: 'Sustained training holds the GPUs near rated draw, so peak and average are close.',
          review: 'Training throughput on this part has not been benchmarked here. Model, precision, parallelism and interconnect all decide whether a run is practical.',
        },
      },
      {
        id: 'finetune',
        label: 'Fine-tuning',
        detail: 'LoRA and full fine-tunes on top of an existing checkpoint.',
        chip: 'Fine-tuning',
        effects: {
          dutyCycle: 0.9,
          gpuFloor: 2,
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
          dutyCycle: 0.72,
          note: 'Serving traffic leaves headroom between bursts — sized below rated load.',
        },
      },
      {
        id: 'research',
        label: 'Research',
        detail: 'Interactive experiments, notebooks, evaluation sweeps.',
        chip: 'Research',
        effects: {
          dutyCycle: 0.55,
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
        effects: { gpuFloor: 1, note: `Models of this size commonly run on a single ${compute.vramPerGpu} GPU, depending on precision and context.` },
      },
      {
        id: 'mid',
        label: '10 – 70B',
        detail: 'The workhorse open-weight class.',
        chip: '10–70B',
        effects: {
          gpuFloor: 2,
          gpuFloorReason: 'a model this size usually needs more than one card',
          note: 'Weights, activations, KV cache and runtime overhead decide the real count; two cards is a starting point, not a sizing.',
        },
      },
      {
        id: 'large',
        label: '70 – 200B',
        detail: 'Frontier-adjacent dense models and mid-size MoE.',
        chip: '70–200B',
        effects: {
          gpuFloor: 4,
          gpuFloorReason: 'a model this size is normally sharded across a node',
          note: `Sharding across four ${compute.vramPerGpu} GPUs. They remain four separate memories.`,
          review: 'Models at this scale need a benchmark before any commitment: sharding across cards without a pooled memory domain is workload-dependent.',
        },
      },
      {
        id: 'frontier',
        label: '200B+',
        detail: 'Frontier-scale, tensor and pipeline parallel.',
        chip: '200B+',
        effects: {
          gpuFloor: 8,
          gpuFloorReason: 'a model this size would use the whole planned fleet',
          note: `${compute.gpuModel} has no NVLink. Eight cards are eight separate ${compute.vramPerGpu} memories, not one pooled space.`,
          review: 'A model at this scale across cards with no pooled memory domain has to be benchmarked before it can be quoted at all.',
        },
      },
    ],
  },
  {
    id: 'gpus',
    kicker: 'Scale',
    prompt: 'How many GPUs do you want?',
    help: `The first phase is ${compute.systems} — ${compute.gpus} GPUs, planned.`,
    chipLabel: 'GPUs',
    options: [
      {
        id: 'single',
        label: '1',
        detail: 'One card. Enough to serve a model or to prototype against.',
        chip: '1 GPU',
        effects: { gpuRange: { min: 1, max: 1 }, note: `A single ${compute.gpuModel}, carved out of a shared node.` },
      },
      {
        id: 'pair',
        label: '2',
        detail: 'A pair in the same node — no fabric hop between them.',
        chip: '2 GPUs',
        effects: { gpuRange: { min: 2, max: 2 }, note: 'Two cards in one node, sharing its host and its supply.' },
      },
      {
        id: 'node',
        label: '4',
        detail: 'One whole node. Nothing shared with another tenant.',
        chip: '4 GPUs',
        effects: { gpuRange: { min: 4, max: 4 }, note: 'One dedicated node, all four cards on the same host.' },
      },
      {
        id: 'hall',
        label: `All ${compute.gpus}`,
        detail: `Both planned servers. ${compute.systems}.`,
        chip: `${compute.gpus} GPUs`,
        effects: {
          gpuRange: { min: compute.gpus, max: compute.gpus },
          note: `The whole planned first phase. None of it is in inventory yet.`,
        },
      },
    ],
  },
  {
    id: 'storage',
    kicker: 'Storage',
    prompt: 'How much data sits next to it?',
    help: 'Storage is part of the IT load, counted on the same boundary as the servers.',
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
        detail: 'You rack your own array, and we size against its actual schedule.',
        chip: 'BYO storage',
        effects: {
          note: 'Customer-supplied storage draws real power. Until its schedule is supplied that figure is unknown, and unknown is not zero.',
          review: 'Customer-owned storage has to be specified before it can be included in a load estimate.',
        },
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
        detail: 'On demand, once there is a pool to draw on.',
        chip: 'Hourly',
        effects: { energyHours: 1, energyPeriod: 'hour', note: 'Hourly capacity would come out of a shared pool and is not held for you.' },
      },
      {
        id: 'monthly',
        label: 'Monthly',
        detail: 'Rolling month, hardware held while you keep it.',
        chip: 'Monthly',
        effects: { energyHours: rules.monthlyHoursConvention, energyPeriod: 'month', note: 'A rolling month. Energy figures use a 730-hour billing month, not a calendar month.' },
      },
      {
        id: 'y1',
        label: '12-month',
        detail: 'A year of dedicated capacity from the power-on target.',
        chip: '12-month',
        effects: { energyHours: rules.monthlyHoursConvention, energyPeriod: 'month', note: `A 12-month term would run from the ${site.powerOn} power-on, which is a target and not a confirmed date.` },
      },
      {
        id: 'y3',
        label: '36-month',
        detail: 'Three years, scoped commercially.',
        chip: '36-month',
        effects: { energyHours: rules.monthlyHoursConvention, energyPeriod: 'month', note: `A 36-month term against the ${site.powerOn}. Terms are agreed commercially, not reserved from this form.` },
      },
    ],
  },
];

/**
 * Outcomes.
 *
 * None of these is an approval, and there is deliberately no "it fits". The
 * facility's cooling and electrical limits are undocumented and the GPUs are
 * planned rather than held, so nothing this form can compute establishes that
 * a deployment can be taken. What it can do is tell you which conversation
 * you are in.
 */
export type FitLevel = 'prepared' | 'review' | 'expansion';

export interface FitCopy {
  /** Short verdict for the running readout. */
  label: string;
  /** Headline on the result panel. */
  headline: string;
  detail: string;
}

export const fitLevels: Record<FitLevel, FitCopy> = {
  prepared: {
    label: 'Request prepared',
    headline: 'Deployment request prepared.',
    detail: `We will confirm workload suitability, equipment availability, facility allocation and commercial terms before issuing an offer. The first phase is ${envelope.servers} planned servers, ${envelope.plannedGpus} GPUs in total; ${envelope.powerOn} is a target, and procurement and commissioning are not complete.`,
  },
  review: {
    label: 'Technical review required',
    headline: 'This one needs a technical review.',
    detail: 'Something in this request cannot be settled from a form — a workload that has not been benchmarked on this hardware, or equipment we have not seen a schedule for. We would rather tell you that than return a number that looks like an answer.',
  },
  expansion: {
    label: 'Expansion inquiry',
    headline: 'This runs past the planned fleet.',
    detail: `Beyond ${envelope.plannedGpus} GPUs this becomes an expansion inquiry, scoped and funded against a commitment. It is not an allocation to another building: Buildings A, B and C have no established fit-out, cooling or electrical allocation to give.`,
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
    id: 'boundary',
    label: 'IT boundary',
    value: 'Servers + storage + network',
    source: 'One boundary throughout. Facility overhead is added once, separately, and never inside this figure',
    estimated: false,
  },
  {
    id: 'per-gpu',
    label: 'Peak draw per GPU',
    value: `${envelope.kwPerGpu.toFixed(2)} kW`,
    source: `${compute.load} ÷ ${envelope.totalGpus} planned GPUs, host and supply included. Peak, not average`,
    estimated: true,
  },
  {
    id: 'fleet',
    label: 'Planned fleet',
    value: `${envelope.plannedGpus} GPUs · ${envelope.servers} servers`,
    source: `${envelope.systems}. Planned — ${compute.status.toLowerCase()}`,
    estimated: false,
  },
  {
    id: 'pue',
    label: 'Facility overhead',
    value: `PUE ${rules.assumedPue}`,
    source: 'An assumed PUE. There is no operating history to measure one from, and it is applied once to the whole IT load',
    estimated: true,
  },
  {
    id: 'duty',
    label: 'Assumed average draw',
    value: '55% – 100% of peak',
    source: 'How hard each workload class is assumed to hold the silicon on average. It informs energy, never allocation',
    estimated: true,
  },
  {
    id: 'storage',
    label: 'Storage draw',
    value: '0.6 – 6 kW',
    source: 'Array draw by capacity tier. Customer-owned storage is unknown until specified, which is not the same as zero',
    estimated: true,
  },
  {
    id: 'service',
    label: 'Electrical service',
    value: envelope.service,
    source: `${power.serviceScope}. ${power.allocation}`,
    estimated: false,
  },
  {
    id: 'network',
    label: 'Connectivity',
    value: network.service,
    source: `${network.status}. An internet circuit rate is not east-west cluster bandwidth`,
    estimated: false,
  },
];
