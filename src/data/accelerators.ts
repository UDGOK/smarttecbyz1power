/**
 * Accelerator reference data for the model planner.
 *
 * Vendor-published figures, recorded with the date they were checked. They are
 * reference specifications for sizing arithmetic — not an inventory, not a
 * price list, and not a statement that any of this hardware is available here.
 *
 * `status` carries that distinction and the UI never drops it. Exactly one of
 * these is planned for this site; the rest are platform evaluations, and the
 * handoff is explicit that each would need its own OEM design, benchmark and
 * funded customer order. They are not interchangeable upgrades inside the RTX
 * nodes.
 */

export type AcceleratorStatus = 'planned' | 'evaluation';

export interface Accelerator {
  id: string;
  vendor: string;
  name: string;
  short: string;
  /** Usable device memory per accelerator, in GB. */
  memoryGb: number;
  memoryType: string;
  /** Vendor-published maximum board power, in watts. */
  tdpW: number;
  /** How many devices share one memory-coherent domain. 1 = none. */
  domainSize: number;
  interconnect: string;
  status: AcceleratorStatus;
  statusNote: string;
  /**
   * Set when the device does not follow the "weights resident in device
   * memory" model the arithmetic assumes, so the planner declines to compute
   * a count rather than producing a wrong one.
   */
  outsideModel?: string;
  source: string;
}

/** The date the figures below were taken from vendor documentation. */
export const ACCELERATORS_CHECKED = '9 September 2026';

export const accelerators: Accelerator[] = [
  {
    id: 'rtx-pro-6000',
    vendor: 'NVIDIA',
    name: 'RTX PRO 6000 Blackwell Server Edition',
    short: 'RTX PRO 6000',
    memoryGb: 96,
    memoryType: 'GDDR7',
    tdpW: 600,
    // No NVLink on this part. Eight cards are eight separate memories, and a
    // model larger than 96 GB is sharded over PCIe rather than pooled.
    domainSize: 1,
    interconnect: 'PCIe Gen5 — no NVLink',
    status: 'planned',
    statusNote: 'The part planned for the first phase here. Procurement and commissioning are not complete.',
    source: 'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/',
  },
  {
    id: 'b200',
    vendor: 'NVIDIA',
    name: 'HGX B200',
    short: 'B200',
    memoryGb: 180,
    memoryType: 'HBM3e',
    tdpW: 1000,
    domainSize: 8,
    interconnect: 'NVLink — 8-GPU coherent domain',
    status: 'evaluation',
    statusNote: 'Future platform evaluation. Not planned, not ordered, and not a drop-in for the RTX nodes.',
    source: 'https://www.nvidia.com/en-us/data-center/hgx/',
  },
  {
    id: 'b300',
    vendor: 'NVIDIA',
    name: 'HGX B300 — Blackwell Ultra',
    short: 'B300',
    memoryGb: 288,
    memoryType: 'HBM3e',
    tdpW: 1400,
    domainSize: 8,
    interconnect: 'NVLink — 8-GPU coherent domain',
    status: 'evaluation',
    statusNote: 'Future platform evaluation. Not planned, not ordered, and not a drop-in for the RTX nodes.',
    source: 'https://www.nvidia.com/en-us/data-center/hgx/',
  },
  {
    id: 'mi355x',
    vendor: 'AMD',
    name: 'Instinct MI355X',
    short: 'MI355X',
    memoryGb: 288,
    memoryType: 'HBM3e',
    tdpW: 1400,
    domainSize: 8,
    interconnect: 'Infinity Fabric — 8-GPU node',
    status: 'evaluation',
    statusNote: 'Future platform evaluation. A different software stack as well as different hardware.',
    source: 'https://www.amd.com/en/products/accelerators/instinct/mi350.html',
  },
  {
    id: 'cerebras-cs3',
    vendor: 'Cerebras',
    name: 'CS-3 — WSE-3',
    short: 'CS-3',
    memoryGb: 44,
    memoryType: 'On-wafer SRAM, with weights streamed from external MemoryX',
    tdpW: 23000,
    domainSize: 1,
    interconnect: 'SwarmX',
    status: 'evaluation',
    statusNote: 'Future platform evaluation, and a wafer-scale system rather than a rack of cards.',
    // Weights are not resident in device memory on this architecture, so
    // dividing a model's size by 44 GB would produce a number that means
    // nothing. Better to say so than to print it.
    outsideModel:
      'Weights are held in external MemoryX and streamed to the wafer, so device memory does not set the model size the way it does on a GPU. Sizing a CS-3 is a vendor exercise, and this planner will not invent a system count for it.',
    source: 'https://www.cerebras.ai/system',
  },
];

/** Precision options, and what one parameter costs in each. */
export interface Precision {
  id: string;
  label: string;
  bytes: number;
  note: string;
}

export const precisions: Precision[] = [
  { id: 'bf16', label: 'BF16 / FP16', bytes: 2, note: 'Native precision for most published weights. The safe default.' },
  { id: 'fp8', label: 'FP8', bytes: 1, note: 'Halves the weights. Quality impact is model-specific and needs a benchmark.' },
  { id: 'int4', label: 'INT4', bytes: 0.5, note: 'Quarter the weights. Quality impact is significant and always needs a benchmark.' },
];

/** What the deployment is for, and what that adds on top of the weights. */
export interface Workload {
  id: string;
  label: string;
  detail: string;
  /**
   * Multiplier on weight memory for optimiser state, gradients and master
   * weights. 0 for inference, which holds weights and cache only.
   */
  trainingOverhead: number;
  note: string;
}

export const workloads: Workload[] = [
  {
    id: 'inference',
    label: 'Inference / serving',
    detail: 'Weights resident, KV cache per concurrent request.',
    trainingOverhead: 0,
    note: 'Weights plus KV cache plus runtime overhead.',
  },
  {
    id: 'lora',
    label: 'LoRA fine-tuning',
    detail: 'Frozen base weights, small trainable adapters.',
    trainingOverhead: 0.2,
    note: 'Base weights stay frozen; the adapters, their gradients and activations are the addition. The 20% allowance is an estimate and varies with rank and batch size.',
  },
  {
    id: 'full',
    label: 'Full fine-tuning',
    detail: 'All weights trainable, with optimiser state.',
    trainingOverhead: 6,
    note: 'Adam-class optimisers hold master weights, momentum and variance in FP32 — conventionally about 12 bytes per parameter on top of the weights. That is where the 6x on a BF16 base comes from, before activations and before any sharding scheme reduces it.',
  },
];
