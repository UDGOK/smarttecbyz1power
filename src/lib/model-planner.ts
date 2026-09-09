/**
 * Sizing arithmetic for the model planner.
 *
 * Every figure here is computed from real metadata — exact parameter counts
 * from safetensors, exact layer, KV-head and head-dimension figures from each
 * model's own config.json — so the two dominant terms are arithmetic rather
 * than estimates:
 *
 *   weights  = parameters x bytes per parameter
 *   KV cache = 2 x layers x kv_heads x head_dim x tokens x bytes
 *
 * The 2 is keys and values. Both formulas are shown in the interface, because
 * a number a client cannot check is worth less than one they can.
 *
 * What is NOT exact is called out as an assumption everywhere it appears: the
 * runtime overhead allowance, the host-RAM ratio, the optimiser multiplier for
 * training, and the facility PUE. None of them is a commitment, and none of
 * them makes this a capacity offer — the facility's own limits are established
 * by engineering review, not by this page.
 */

import type { Accelerator, Precision, Workload } from '../data/accelerators';

export interface PlannerModel {
  id: string;
  name: string;
  hf: string;
  params: number;
  ctx: number | null;
  layers: number;
  kvHeads: number;
  headDim: number;
  hidden: number | null;
  experts: number | null;
  dtype: string | null;
  downloads: number;
}

export interface PlannerInput {
  model: PlannerModel;
  precision: Precision;
  workload: Workload;
  /** Tokens of context held per concurrent request. */
  contextTokens: number;
  /** Simultaneous requests whose cache must be resident at once. */
  concurrency: number;
}

export interface AcceleratorFit {
  accelerator: Accelerator;
  /** Null when the device does not follow the resident-weights model. */
  count: number | null;
  /** Aggregate device memory across `count` devices, in GB. */
  totalMemoryGb: number;
  /** Accelerator power only, in kW. */
  powerKw: number;
  /** True when one model copy spans more than one device. */
  sharded: boolean;
  /** True when sharding crosses a coherent-memory domain boundary. */
  crossesDomain: boolean;
  notes: string[];
}

export interface PlannerResult {
  /** Bytes for the weights, at the chosen precision. */
  weightsBytes: number;
  /** Bytes of KV cache for the whole concurrency, at the chosen context. */
  kvBytes: number;
  /** Bytes per token of cache — the figure the KV formula turns on. */
  kvBytesPerToken: number;
  /** Optimiser and gradient state for a training run. */
  trainingBytes: number;
  /** Stated allowance over the sum of the above. */
  overheadBytes: number;
  /** Everything that has to be resident in accelerator memory. */
  totalBytes: number;
  /** Host memory, at the stated ratio. */
  hostRamGb: number;
  /** Weights on disk at their native precision, plus working space. */
  storageGb: number;
  fits: AcceleratorFit[];
}

const GB = 1024 ** 3;

/** Runtime allowance: activations, fragmentation, CUDA context, framework. */
export const OVERHEAD_FRACTION = 0.15;
/** Host RAM as a multiple of resident accelerator memory. */
export const HOST_RAM_RATIO = 1.5;
/** Working space on disk, as a multiple of the weights at native precision. */
export const STORAGE_FACTOR = 3;
/** Host, network and storage draw alongside the accelerators, per server. */
export const HOST_KW_PER_NODE = 1.2;
/** Facility overhead. An assumed PUE — there is no operating history here. */
export const ASSUMED_PUE = 1.4;

/** Bytes of KV cache per token. Two for keys and values. */
export function kvPerToken(m: PlannerModel, bytesPerElement: number): number {
  return 2 * m.layers * m.kvHeads * m.headDim * bytesPerElement;
}

export function plan(input: PlannerInput): PlannerResult {
  const { model, precision, workload, contextTokens, concurrency } = input;

  const weightsBytes = model.params * precision.bytes;

  /**
   * The cache is held at BF16 in most serving stacks regardless of the weight
   * precision, so quantising weights does not shrink it. Assuming otherwise is
   * a common way to under-size a serving deployment.
   */
  const kvBytesPerToken = kvPerToken(model, 2);
  const kvBytes = kvBytesPerToken * contextTokens * concurrency;

  const trainingBytes = weightsBytes * workload.trainingOverhead;
  const subtotal = weightsBytes + kvBytes + trainingBytes;
  const overheadBytes = subtotal * OVERHEAD_FRACTION;
  const totalBytes = subtotal + overheadBytes;

  const totalGb = totalBytes / GB;
  const hostRamGb = totalGb * HOST_RAM_RATIO;
  // Disk holds the published weights at their native precision, whatever
  // precision they are later loaded at.
  const storageGb = (model.params * 2 / GB) * STORAGE_FACTOR;

  return {
    weightsBytes,
    kvBytes,
    kvBytesPerToken,
    trainingBytes,
    overheadBytes,
    totalBytes,
    hostRamGb,
    storageGb,
    fits: [],
  };
}

export function fitTo(
  result: PlannerResult,
  accelerator: Accelerator,
  model: PlannerModel,
): AcceleratorFit {
  const notes: string[] = [];

  if (accelerator.outsideModel) {
    return {
      accelerator,
      count: null,
      totalMemoryGb: 0,
      powerKw: 0,
      sharded: false,
      crossesDomain: false,
      notes: [accelerator.outsideModel],
    };
  }

  const needGb = result.totalBytes / GB;
  const count = Math.max(1, Math.ceil(needGb / accelerator.memoryGb));
  const sharded = count > 1;
  const crossesDomain = count > accelerator.domainSize;

  if (sharded && accelerator.domainSize === 1) {
    notes.push(
      `${accelerator.short} has no coherent memory domain, so ${count} cards are ${count} separate `
      + `${accelerator.memoryGb} GB memories. A model this size is sharded across PCIe, which is a `
      + 'real throughput cost and needs a benchmark before anyone commits to it.',
    );
  } else if (crossesDomain) {
    notes.push(
      `${count} devices exceeds the ${accelerator.domainSize}-device ${accelerator.interconnect.split('—')[0].trim()} `
      + 'domain, so at least one model copy spans a node boundary. Scale-out fabric design decides whether that works.',
    );
  }

  if (accelerator.rackOf) {
    const rackKw = (accelerator.rackOf * accelerator.tdpW) / 1000;
    notes.push(
      `The unit here is a rack, not a card. ${count} of the ${accelerator.rackOf} GPUs in one `
      + `${accelerator.short} carries this model — but the rack is what you buy and what you power, `
      + `and it draws on the order of ${Math.round(rackKw)} kW of accelerator load before facility `
      + 'overhead. That is a facility decision before it is a hardware one.',
    );
  }

  if (model.experts) {
    notes.push(
      `Mixture of experts: all ${model.experts} experts stay resident even though only some are active per `
      + 'token, so memory follows the total parameter count while throughput follows the active count.',
    );
  }

  const nodes = Math.max(1, Math.ceil(count / Math.max(1, accelerator.domainSize === 1 ? 4 : accelerator.domainSize)));
  const powerKw = (count * accelerator.tdpW + nodes * HOST_KW_PER_NODE * 1000) / 1000;

  return {
    accelerator,
    count,
    totalMemoryGb: count * accelerator.memoryGb,
    powerKw,
    sharded,
    crossesDomain,
    notes,
  };
}

export const fmtBytes = (b: number): string => {
  const gb = b / GB;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 10) return `${gb.toFixed(0)} GB`;
  return `${gb.toFixed(1)} GB`;
};

export const fmtParams = (p: number): string =>
  p >= 1e12 ? `${(p / 1e12).toFixed(2)}T` : `${(p / 1e9).toFixed(1)}B`;
