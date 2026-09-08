/**
 * Audio bus — sound design generated at runtime. No files, no libraries.
 *
 * Two jobs, both taken from the reference:
 *  1. per-stage ambience that cross-fades while a crossing is in progress, and
 *  2. one-shot FX whose playback rate is scaled so a hold sound always lands
 *     exactly when the progress ring completes.
 *
 * The beds are built the way room tone is actually built, not the way a synth
 * patch is: several layers of pink and brown noise through bandpass and
 * lowpass filters whose cutoffs and Qs drift on slow, mutually prime LFOs; a
 * sine well under 60 Hz for weight; sparse, randomly timed, stereo-panned
 * events — a relay, a contactor, a fan spinning up, a packet on the fibre —
 * because a bed with nothing happening in it reads as a test tone however
 * well it is filtered; and a ConvolverNode per stage with a procedurally
 * generated impulse response, which is the single thing that turns a set of
 * layers into a place.
 *
 * Nothing raw is ever heard. Anything pitched is either a stack of sines
 * behind a lowpass or noise through a high-Q bandpass — a resonant filter
 * sings a note without the harmonic ladder that makes a bare sawtooth buzz.
 *
 * Cost control: the two noise buffers and the three impulse responses are
 * generated once and shared by every voice; layers decorrelate themselves by
 * reading the same buffer at different playback rates rather than by owning
 * their own copy. Nothing is allocated per frame — `setLevel` touches exactly
 * one AudioParam, and only when the value has actually moved.
 *
 * `src` remains the escape hatch: set it on any track and a real file is
 * fetched, decoded and cached, and plays instead, with no change at the call
 * sites and no change to `getDuration`'s meaning.
 */

type BedId = 'land' | 'wait' | 'power' | 'machine' | 'campus';
type FxId = 'click' | 'whoosh' | 'energise' | 'power-on' | 'xp-topup' | 'hold';
type SpaceId = 'open' | 'room' | 'hall';

export interface TrackOptions {
  /** Escape hatch: a real audio file, which wins over the generated voice. */
  src?: string;
  type: 'ambient' | 'fx';
  loop?: boolean;
  volume?: number;
  /** Which generated ambience to build. */
  bed?: BedId;
  /** Which generated one-shot to build. */
  fx?: FxId;
  /** Length of a one-shot in seconds at rate 1 — what a hold is fitted to. */
  duration?: number;
  /** Multiplier applied to playback rate when driven by a hold. */
  holdRateScale?: number;
}

const REGISTRY: Record<string, TrackOptions> = {
  // 40 acres of prairie at first light: wind, ground, almost nothing.
  'stage-land-ambient':    { type: 'ambient', loop: true, volume: 0.5, bed: 'land' },
  // The interconnection queue: pressure, a hard room, time not passing.
  'stage-wait-ambient':    { type: 'ambient', loop: true, volume: 0.5, bed: 'wait' },
  // Behind the meter: array, bank, a 3 MVA transformer breathing at 120 Hz.
  'stage-power-ambient':   { type: 'ambient', loop: true, volume: 0.5, bed: 'power' },
  // Phase 1A: 64 GPUs, fan walls, coolant, packets on the fibre.
  'stage-machine-ambient': { type: 'ambient', loop: true, volume: 0.5, bed: 'machine' },
  // Daylight, outdoors, finished. The plant is audible but far away.
  'stage-campus-ambient':  { type: 'ambient', loop: true, volume: 0.5, bed: 'campus' },

  'hold-button': { type: 'fx', volume: 0.34, holdRateScale: 1, duration: 1.2, fx: 'hold' },
  'click':       { type: 'fx', volume: 0.42, duration: 0.09, fx: 'click' },
  'whoosh':      { type: 'fx', volume: 0.50, duration: 1.10, fx: 'whoosh' },
  'energise':    { type: 'fx', volume: 0.40, duration: 1.00, fx: 'energise' },
  'power-on':    { type: 'fx', volume: 0.38, duration: 1.40, fx: 'power-on' },
  'xp-topup':    { type: 'fx', volume: 0.42, duration: 0.55, fx: 'xp-topup' },
};

/** Everything downstream of this is conservative on purpose. */
const MASTER_LEVEL = 0.6;
const NOISE_SECONDS = 4;

// ---------------------------------------------------------------------------
// Shared assets
// ---------------------------------------------------------------------------

export interface AudioAssets {
  /** Stereo, decorrelated per channel, seamlessly looping. */
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Impulse responses, built on first use of the space that needs them. */
  spaces: Map<SpaceId, AudioBuffer>;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/**
 * Fold `fade` samples of overrun back onto the head with an equal-power
 * crossfade. Without this the loop point of any filtered noise buffer is a
 * step discontinuity, i.e. a click, once every four seconds forever.
 */
function seamless(data: Float32Array, tail: Float32Array, fade: number): void {
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    data[i] = data[i] * Math.sin(x * Math.PI * 0.5) + tail[i] * Math.cos(x * Math.PI * 0.5);
  }
}

function normalise(data: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max <= 0) return;
  const k = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= k;
}

/** Paul Kellett's 7-pole approximation: flat 1/f from ~20 Hz up. */
function pinkBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.25);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const tail = new Float32Array(fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len + fade; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const y = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      if (i < len) d[i] = y; else tail[i - len] = y;
    }
    seamless(d, tail, fade);
    normalise(d, 0.9);
  }
  return buf;
}

/** Integrated white with a leak and a DC block: 1/f^2, all weight, no top. */
function brownBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.25);
  const buf = ctx.createBuffer(2, len, sr);
  const leak = 1 - 12 / sr;      // ~12 Hz one-pole, stops the walk running away
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const tail = new Float32Array(fade);
    let b = 0, dc = 0;
    for (let i = 0; i < len + fade; i++) {
      b = leak * b + (Math.random() * 2 - 1) * 0.045;
      dc += (b - dc) * 0.0004;   // and a matching highpass so there is no DC
      const y = (b - dc) * 3.2;
      if (i < len) d[i] = y; else tail[i - len] = y;
    }
    seamless(d, tail, fade);
    normalise(d, 0.9);
  }
  return buf;
}

interface SpaceSpec {
  seconds: number;
  /** exp(-decay t) — the RT60 in disguise. */
  decay: number;
  /** How fast the top of the tail is absorbed. Big rooms and racks: fast. */
  damp: number;
  predelay: number;
  /** Discrete early reflections. Hard rooms have many, open ground has none. */
  taps: number;
}

const SPACES: Record<SpaceId, SpaceSpec> = {
  // 40 acres of open ground: no walls, just distance and air.
  open: { seconds: 3.0, decay: 1.9, damp: 2.9, predelay: 0.030, taps: 0 },
  // The queue: painted block, a hard ceiling, nothing soft in it.
  room: { seconds: 1.8, decay: 3.1, damp: 0.85, predelay: 0.009, taps: 10 },
  // A hall full of racks — mid-size, and everything above 2 kHz is eaten.
  hall: { seconds: 1.3, decay: 4.2, damp: 3.6, predelay: 0.014, taps: 4 },
};

function makeSpace(ctx: BaseAudioContext, s: SpaceSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * s.seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // A few samples of inter-channel offset is most of what makes a reverb
    // sound wide rather than centred.
    const pre = Math.floor(sr * s.predelay) + (ch === 0 ? 0 : 23);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // The one-pole gets slower as the tail ages, so the top decays first.
      const a = 0.85 * Math.exp(-s.damp * t) + 0.03;
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-s.decay * t);
    }
    for (let k = 0; k < s.taps; k++) {
      const at = pre + Math.floor(sr * (0.006 + k * 0.0115 + (ch ? 0.0017 : 0)));
      if (at < len) d[at] += (k % 2 ? -1 : 1) * 0.55 * Math.exp(-1.4 * k * 0.2);
    }
    normalise(d, 1);
  }
  return buf;
}

function spaceFor(ctx: BaseAudioContext, assets: AudioAssets, id: SpaceId): AudioBuffer {
  let b = assets.spaces.get(id);
  if (!b) { b = makeSpace(ctx, SPACES[id]); assets.spaces.set(id, b); }
  return b;
}

export function createAssets(ctx: BaseAudioContext): AudioAssets {
  return {
    pink: pinkBuffer(ctx, NOISE_SECONDS),
    brown: brownBuffer(ctx, NOISE_SECONDS),
    spaces: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Voice construction
// ---------------------------------------------------------------------------

export interface Voice {
  /** Connect this to the track gain. */
  out: GainNode;
  nodes: AudioScheduledSourceNode[];
  /** Fire one sparse event at `at`. Ambience only. */
  event?: (at: number) => void;
  /** Seconds between events, [min, max]. */
  spacing?: [number, number];
  /** Seconds after which a one-shot has finished and can be torn down. */
  life?: number;
}

interface Rig {
  ctx: BaseAudioContext;
  assets: AudioAssets;
  at: number;
  out: GainNode;
  /** Layers land here; a pre-fader trim the whole bed can breathe on. */
  dry: GainNode;
  /** Anything connected here is heard through the room. */
  send: GainNode;
  nodes: AudioScheduledSourceNode[];
}

function rig(ctx: BaseAudioContext, assets: AudioAssets, at: number, space: SpaceId, wet: number): Rig {
  const out = ctx.createGain();
  const dry = ctx.createGain();
  dry.connect(out);
  const send = ctx.createGain();
  send.gain.value = wet;
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = spaceFor(ctx, assets, space);
  send.connect(conv);
  conv.connect(out);
  return { ctx, assets, at, out, dry, send, nodes: [] };
}

/** A slow sine on an AudioParam. Rates are jittered so nothing ever aligns. */
function drift(r: Rig, param: AudioParam, centre: number, depth: number, rate: number): void {
  param.value = centre;
  const osc = r.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = rate * rand(0.82, 1.22);
  const g = r.ctx.createGain();
  g.gain.value = depth;
  osc.connect(g);
  g.connect(param);
  osc.start(r.at);
  r.nodes.push(osc);
}

interface LayerSpec {
  src?: 'pink' | 'brown';
  /** Reading the shared buffer at another rate is free decorrelation. */
  rate?: number;
  type?: BiquadFilterType;
  freq: number;
  q?: number;
  /** An optional second filter in series — usually a lowpass over a bandpass. */
  then?: { type: BiquadFilterType; freq: number; q?: number };
  gain: number;
  pan?: number;
  /** Slow movement of the cutoff. This is what stops a filter sounding fixed. */
  sweep?: { depth: number; rate: number };
  /** Slow movement of the level. */
  breathe?: { depth: number; rate: number };
  wet?: boolean;
}

function noiseLayer(r: Rig, o: LayerSpec): GainNode {
  const src = r.ctx.createBufferSource();
  src.buffer = o.src === 'brown' ? r.assets.brown : r.assets.pink;
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;

  const filter = r.ctx.createBiquadFilter();
  filter.type = o.type ?? 'lowpass';
  filter.Q.value = o.q ?? 0.7;
  if (o.sweep) drift(r, filter.frequency, o.freq, o.sweep.depth, o.sweep.rate);
  else filter.frequency.value = o.freq;

  const g = r.ctx.createGain();
  g.gain.value = o.gain;
  if (o.breathe) drift(r, g.gain, o.gain, o.gain * o.breathe.depth, o.breathe.rate);

  src.connect(filter);
  let tail: AudioNode = filter;
  if (o.then) {
    const f2 = r.ctx.createBiquadFilter();
    f2.type = o.then.type;
    f2.frequency.value = o.then.freq;
    f2.Q.value = o.then.q ?? 0.7;
    filter.connect(f2);
    tail = f2;
  }
  tail.connect(g);

  let end: AudioNode = g;
  if (o.pan) {
    const p = r.ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    end = p;
  }
  end.connect(r.dry);
  if (o.wet) end.connect(r.send);

  src.start(r.at);
  r.nodes.push(src);
  return g;
}

/** Weight. A sine this low is felt, never heard as a pitch, and never buzzes. */
function subLayer(r: Rig, freq: number, gain: number, breatheRate = 0.031): void {
  const osc = r.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = r.ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, r.at);
  g.gain.linearRampToValueAtTime(gain, r.at + 0.6);
  drift(r, g.gain, gain, gain * 0.35, breatheRate);
  osc.connect(g);
  g.connect(r.dry);
  osc.start(r.at);
  r.nodes.push(osc);
}

interface StackSpec {
  /** [frequency, relative level] — sines only, behind a lowpass. */
  partials: Array<[number, number]>;
  cutoff: number;
  q?: number;
  gain: number;
  pan?: number;
  detune?: number;
  /** Give every partial its own slow swell so the stack never sits still. */
  shimmer?: number;
  sweep?: { depth: number; rate: number };
  wet?: boolean;
}

function toneStack(r: Rig, o: StackSpec): void {
  const lp = r.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = o.q ?? 0.6;
  if (o.sweep) drift(r, lp.frequency, o.cutoff, o.sweep.depth, o.sweep.rate);
  else lp.frequency.value = o.cutoff;

  const g = r.ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, r.at);
  g.gain.linearRampToValueAtTime(o.gain, r.at + 1.2);
  lp.connect(g);

  let end: AudioNode = g;
  if (o.pan) {
    const p = r.ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    end = p;
  }
  end.connect(r.dry);
  if (o.wet) end.connect(r.send);

  for (const [freq, level] of o.partials) {
    const osc = r.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    if (o.detune) osc.detune.value = rand(-o.detune, o.detune);
    const pg = r.ctx.createGain();
    pg.gain.value = level;
    if (o.shimmer) drift(r, pg.gain, level, level * o.shimmer, rand(0.013, 0.047));
    osc.connect(pg);
    pg.connect(lp);
    osc.start(r.at);
    r.nodes.push(osc);
  }
}

// ---------------------------------------------------------------------------
// Sparse events — the things that make a bed a place
// ---------------------------------------------------------------------------

interface Hit {
  dry: GainNode;
  send: GainNode;
  ctx: BaseAudioContext;
  assets: AudioAssets;
}

function hitOut(h: Hit, pan: number, wet: number): GainNode {
  const g = h.ctx.createGain();
  g.gain.value = 0.0001;
  const p = h.ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(h.dry);
  const extra: AudioNode[] = [p];
  if (wet > 0) {
    const w = h.ctx.createGain();
    w.gain.value = wet;
    p.connect(w);
    w.connect(h.send);
    extra.push(w);
  }
  // The panner and send gain outlive the source that feeds them, and nothing
  // was disconnecting them — one sparse event every few seconds adds up to a
  // thousand permanently connected nodes over an hour of listening. They ride
  // along on the gain so `killHit` can take the whole chain down together.
  (g as HitGain).__extra = extra;
  return g;
}

interface HitGain extends GainNode { __extra?: AudioNode[] }

/** Disconnect an event's output and everything hitOut hung off it. */
function killHit(g: GainNode): void {
  g.disconnect();
  for (const n of (g as HitGain).__extra ?? []) n.disconnect();
  (g as HitGain).__extra = undefined;
}

/** Envelope every event the same way: never a value set, always a ramp. */
function shape(g: GainNode, at: number, level: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

/** A filtered noise transient: relay, contactor, tick, click. */
function tick(h: Hit, at: number, o: {
  freq: number; q: number; level: number; decay: number; pan: number; wet?: number; brown?: boolean;
}): void {
  const src = h.ctx.createBufferSource();
  src.buffer = o.brown ? h.assets.brown : h.assets.pink;
  src.loop = true;
  src.playbackRate.value = rand(0.9, 1.1);
  const f = h.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = o.freq;
  f.Q.value = o.q;
  const g = hitOut(h, o.pan, o.wet ?? 0.35);
  shape(g, at, o.level, 0.003, o.decay);
  src.connect(f);
  f.connect(g);
  src.start(at, rand(0, 3));
  src.stop(at + o.decay + 0.08);
  src.onended = () => { src.disconnect(); f.disconnect(); killHit(g); };
}

/** A pitch-dropping sine: transformer thunk, distant door, contactor weight. */
function thunk(h: Hit, at: number, o: {
  from: number; to: number; level: number; decay: number; pan: number; wet?: number;
}): void {
  const osc = h.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(o.from, at);
  osc.frequency.exponentialRampToValueAtTime(o.to, at + o.decay * 0.6);
  const g = hitOut(h, o.pan, o.wet ?? 0.3);
  shape(g, at, o.level, 0.008, o.decay);
  osc.connect(g);
  osc.start(at);
  osc.stop(at + o.decay + 0.1);
  osc.onended = () => { osc.disconnect(); killHit(g); };
}

/** A sine bell with a couple of partials: a ping, a bloom, a credit. */
function bell(h: Hit, at: number, o: {
  freq: number; ratios?: number[]; level: number; decay: number; pan: number; wet?: number;
}): void {
  const g = hitOut(h, o.pan, o.wet ?? 0.5);
  shape(g, at, o.level, 0.006, o.decay);
  const lp = h.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  lp.connect(g);
  const ratios = o.ratios ?? [1, 1.5];
  ratios.forEach((ratio, i) => {
    const osc = h.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = o.freq * ratio;
    const pg = h.ctx.createGain();
    pg.gain.value = 1 / (1 + i * 2.2);
    osc.connect(pg);
    pg.connect(lp);
    osc.start(at);
    osc.stop(at + o.decay + 0.12);
    osc.onended = () => { osc.disconnect(); pg.disconnect(); killHit(g); };
  });
}

/** A resonant sweep on noise: gust, chirp, packet, spin-up. */
function sweep(h: Hit, at: number, o: {
  from: number; to: number; q: number; level: number; dur: number; pan: number;
  attack?: number; wet?: number; brown?: boolean;
}): void {
  const src = h.ctx.createBufferSource();
  src.buffer = o.brown ? h.assets.brown : h.assets.pink;
  src.loop = true;
  src.playbackRate.value = rand(0.85, 1.15);
  const f = h.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = o.q;
  f.frequency.setValueAtTime(o.from, at);
  f.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
  const g = hitOut(h, o.pan, o.wet ?? 0.4);
  const attack = o.attack ?? o.dur * 0.35;
  shape(g, at, o.level, attack, o.dur - attack + 0.2);
  src.connect(f);
  f.connect(g);
  src.start(at, rand(0, 3));
  src.stop(at + o.dur + 0.35);
  src.onended = () => { src.disconnect(); f.disconnect(); killHit(g); };
}

// ---------------------------------------------------------------------------
// The five beds
// ---------------------------------------------------------------------------

export function buildBed(ctx: BaseAudioContext, assets: AudioAssets, id: BedId, at: number): Voice {
  switch (id) {
    // -- land: open ground, first light. Wind and distance, and little else.
    case 'land': {
      const r = rig(ctx, assets, at, 'open', 0.55);
      noiseLayer(r, { rate: 0.78, freq: 330, q: 0.4, gain: 0.10, sweep: { depth: 150, rate: 0.041 }, breathe: { depth: 0.45, rate: 0.027 }, wet: true });
      noiseLayer(r, { rate: 1.17, type: 'bandpass', freq: 760, q: 0.8, gain: 0.065, pan: -0.45, sweep: { depth: 280, rate: 0.033 }, breathe: { depth: 0.6, rate: 0.023 }, wet: true });
      noiseLayer(r, { rate: 0.93, type: 'bandpass', freq: 2000, q: 0.6, gain: 0.013, pan: 0.5, sweep: { depth: 500, rate: 0.019 }, breathe: { depth: 0.7, rate: 0.017 }, wet: true });
      subLayer(r, 38.5, 0.05, 0.029);
      // A dawn pedal, an octave and a fifth, so far behind the wind that it
      // reads as light rather than as a note.
      toneStack(r, { partials: [[55, 1], [82.5, 0.5], [110, 0.18]], cutoff: 250, gain: 0.026, detune: 5, shimmer: 0.55, sweep: { depth: 80, rate: 0.021 }, wet: true });

      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      return {
        out: r.out, nodes: r.nodes, spacing: [11, 23],
        event: (t) => {
          const roll = Math.random();
          if (roll < 0.6) sweep(h, t, { from: 420, to: 1500, q: 1.1, level: 0.055, dur: rand(3, 5), pan: rand(-0.8, 0.8), wet: 0.5 });
          else if (roll < 0.85) sweep(h, t, { from: 1200, to: 380, q: 1.4, level: 0.04, dur: rand(2.5, 4), pan: rand(-0.8, 0.8), wet: 0.5 });
          // A pole transformer somewhere over the section line.
          else bell(h, t, { freq: 73.4, ratios: [1, 2, 3.01], level: 0.02, decay: 2.6, pan: rand(-0.5, 0.5), wet: 0.8 });
        },
      };
    }

    // -- wait: the queue. A hard room, a low pressure, and a semitone rub
    //    that never resolves. Nothing here moves forward.
    case 'wait': {
      const r = rig(ctx, assets, at, 'room', 0.34);
      // The whole bed breathes at 0.11 Hz — nine seconds a cycle, slow enough
      // to feel like the room is holding its breath rather than pulsing.
      drift(r, r.dry.gain, 0.85, 0.2, 0.11);
      noiseLayer(r, { src: 'brown', rate: 0.71, freq: 130, q: 0.9, gain: 0.10 });
      noiseLayer(r, { rate: 1.03, type: 'bandpass', freq: 205, q: 3.2, gain: 0.32, sweep: { depth: 35, rate: 0.047 }, wet: true });
      // Two high-Q bandpasses a semitone apart: the room sings D3 and E-flat3
      // at once, out of noise, with no oscillator anywhere near it.
      noiseLayer(r, { rate: 1.31, type: 'bandpass', freq: 146.8, q: 13, gain: 0.60, pan: -0.35, breathe: { depth: 0.3, rate: 0.037 }, wet: true });
      noiseLayer(r, { rate: 0.83, type: 'bandpass', freq: 155.6, q: 15, gain: 0.42, pan: 0.4, breathe: { depth: 0.4, rate: 0.029 }, wet: true });
      noiseLayer(r, { rate: 1.21, type: 'bandpass', freq: 1750, q: 0.8, gain: 0.028, pan: 0.25, breathe: { depth: 0.6, rate: 0.043 }, wet: true });
      // 41.0 against 41.55: a half-hertz beat under the floor.
      subLayer(r, 41.0, 0.048, 0.023);
      subLayer(r, 41.55, 0.04, 0.019);

      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      return {
        out: r.out, nodes: r.nodes, spacing: [6, 13],
        event: (t) => {
          const roll = Math.random();
          if (roll < 0.34) {
            // A relay somewhere down the corridor: contact, then weight.
            tick(h, t, { freq: 1100, q: 1.6, level: 0.05, decay: 0.05, pan: rand(-0.7, 0.7), wet: 0.6 });
            thunk(h, t + 0.012, { from: 84, to: 56, level: 0.075, decay: 0.32, pan: rand(-0.4, 0.4), wet: 0.5 });
          } else if (roll < 0.72) {
            // The tick of a clock that is not counting anything.
            tick(h, t, { freq: 720, q: 5, level: 0.03, decay: 0.13, pan: rand(-0.6, 0.6), wet: 0.55 });
          } else {
            // A door two rooms away.
            thunk(h, t, { from: 62, to: 44, level: 0.06, decay: 0.85, pan: rand(-0.3, 0.3), wet: 0.9 });
          }
        },
      };
    }

    // -- power: the yard. A 3 MVA transformer is a 120 Hz body, not a hum —
    //    two stacks a fraction of a hertz apart, panned wide, so it phases
    //    against itself the way a real core does.
    case 'power': {
      const r = rig(ctx, assets, at, 'hall', 0.26);
      const core: Array<[number, number]> = [[60, 0.34], [120, 1], [180, 0.17], [240, 0.07], [360, 0.025]];
      toneStack(r, { partials: core, cutoff: 520, gain: 0.042, pan: -0.5, shimmer: 0.18, sweep: { depth: 90, rate: 0.037 }, wet: true });
      toneStack(r, { partials: core.map(([f, g]) => [f * 1.0013, g] as [number, number]), cutoff: 500, gain: 0.038, pan: 0.5, shimmer: 0.2, sweep: { depth: 80, rate: 0.029 }, wet: true });
      noiseLayer(r, { rate: 1.09, type: 'bandpass', freq: 600, q: 0.7, gain: 0.075, sweep: { depth: 180, rate: 0.043 }, breathe: { depth: 0.4, rate: 0.031 }, wet: true });
      noiseLayer(r, { rate: 0.88, freq: 1300, q: 0.4, gain: 0.04, pan: -0.35, sweep: { depth: 300, rate: 0.023 } });
      // Switchgear sizzle. Tiny on purpose — this is the one band that can
      // turn a bed harsh, so it sits 40 dB under the transformer.
      noiseLayer(r, { rate: 1.4, type: 'bandpass', freq: 4200, q: 0.6, gain: 0.007, pan: 0.55, breathe: { depth: 0.85, rate: 0.09 }, wet: true });
      subLayer(r, 40, 0.055, 0.027);

      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      return {
        out: r.out, nodes: r.nodes, spacing: [4.5, 11],
        event: (t) => {
          const roll = Math.random();
          if (roll < 0.3) {
            // A contactor closing: the click is the armature, the thunk is
            // the core, the ring is 120 Hz still in the iron afterwards.
            tick(h, t, { freq: 1400, q: 1.2, level: 0.055, decay: 0.035, pan: rand(-0.6, 0.6), wet: 0.4 });
            thunk(h, t + 0.02, { from: 96, to: 52, level: 0.09, decay: 0.45, pan: rand(-0.35, 0.35), wet: 0.45 });
            bell(h, t + 0.03, { freq: 120, ratios: [1, 2], level: 0.02, decay: 0.7, pan: 0, wet: 0.6 });
          } else if (roll < 0.62) {
            // A quantum landing in a cabinet.
            bell(h, t, { freq: rand(1, 1.5) < 1.25 ? 523.25 : 784, ratios: [1, 2.02, 3.03], level: 0.022, decay: 0.75, pan: rand(-0.8, 0.8), wet: 0.7 });
          } else if (roll < 0.84) {
            // An inverter taking up load.
            sweep(h, t, { from: 380, to: 900, q: 4, level: 0.03, dur: 0.5, pan: rand(-0.7, 0.7), attack: 0.12, wet: 0.5 });
          } else {
            tick(h, t, { freq: 640, q: 3, level: 0.028, decay: 0.09, pan: rand(-0.7, 0.7), wet: 0.4 });
          }
        },
      };
    }

    // -- machine: Phase 1A. Two fan walls beating against each other, a
    //    coolant loop under the floor, packets on the fibre.
    case 'machine': {
      const r = rig(ctx, assets, at, 'hall', 0.2);
      noiseLayer(r, { rate: 1.0, freq: 1450, q: 0.5, gain: 0.115, pan: -0.3, sweep: { depth: 250, rate: 0.05 }, breathe: { depth: 0.18, rate: 0.037 } });
      noiseLayer(r, { rate: 1.19, freq: 1150, q: 0.5, gain: 0.095, pan: 0.35, sweep: { depth: 200, rate: 0.043 }, breathe: { depth: 0.2, rate: 0.029 } });
      // Blade tone: two banks five hertz apart, which is the flutter you hear
      // standing between two rows.
      noiseLayer(r, { rate: 0.9, type: 'bandpass', freq: 232, q: 5.5, gain: 0.16, pan: -0.25, wet: true });
      noiseLayer(r, { rate: 1.27, type: 'bandpass', freq: 237, q: 6, gain: 0.13, pan: 0.3, wet: true });
      // Direct-to-chip: the loop is below the floor, so it is all weight.
      noiseLayer(r, { src: 'brown', rate: 0.63, freq: 95, q: 0.8, gain: 0.10 });
      noiseLayer(r, { rate: 1.03, type: 'bandpass', freq: 330, q: 9, gain: 0.055, pan: 0.15, breathe: { depth: 0.35, rate: 0.9 }, wet: true });
      // A hint of coil whine, filtered to a band rather than left as a tone.
      noiseLayer(r, { rate: 1.5, type: 'bandpass', freq: 1150, q: 7, gain: 0.017, pan: -0.5, breathe: { depth: 0.5, rate: 0.061 }, wet: true });
      subLayer(r, 45, 0.055, 0.033);

      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      return {
        out: r.out, nodes: r.nodes, spacing: [2.2, 6.5],
        event: (t) => {
          const roll = Math.random();
          if (roll < 0.46) {
            // A packet on the fibre — short, quiet, and gone.
            sweep(h, t, { from: rand(1400, 1700), to: rand(2100, 2600), q: 9, level: 0.022, dur: 0.05, pan: rand(-0.9, 0.9), attack: 0.008, wet: 0.35 });
          } else if (roll < 0.62) {
            // Two or three of them at once, the way traffic actually arrives.
            for (let i = 0; i < 3; i++) {
              sweep(h, t + i * rand(0.03, 0.09), { from: rand(1300, 1900), to: rand(1900, 2500), q: 10, level: 0.014, dur: 0.04, pan: rand(-0.9, 0.9), attack: 0.006, wet: 0.3 });
            }
          } else if (roll < 0.78) {
            tick(h, t, { freq: rand(800, 1600), q: 4, level: 0.02, decay: 0.05, pan: rand(-0.8, 0.8), wet: 0.3 });
          } else if (roll < 0.92) {
            // A fan bank taking a step up as a rack heats.
            sweep(h, t, { from: 420, to: 1700, q: 0.9, level: 0.05, dur: 2.4, pan: rand(-0.6, 0.6), attack: 1.6, wet: 0.25 });
          } else {
            // A surge in the coolant loop.
            sweep(h, t, { from: 180, to: 90, q: 0.8, level: 0.075, dur: 1.6, pan: rand(-0.3, 0.3), attack: 0.7, wet: 0.2, brown: true });
          }
        },
      };
    }

    // -- campus: daylight, outdoors, finished. The pad is the resolution;
    //    the plant is still there, but it is a long way off now.
    case 'campus': {
      const r = rig(ctx, assets, at, 'open', 0.5);
      noiseLayer(r, { rate: 0.95, freq: 880, q: 0.4, gain: 0.085, sweep: { depth: 260, rate: 0.037 }, breathe: { depth: 0.4, rate: 0.023 }, wet: true });
      noiseLayer(r, { rate: 1.23, type: 'bandpass', freq: 1600, q: 0.7, gain: 0.03, pan: 0.45, sweep: { depth: 420, rate: 0.029 }, breathe: { depth: 0.6, rate: 0.019 }, wet: true });
      noiseLayer(r, { rate: 0.72, type: 'bandpass', freq: 420, q: 1.1, gain: 0.05, pan: -0.4, sweep: { depth: 120, rate: 0.031 }, wet: true });
      // The transformer from stage three, three hundred metres away.
      toneStack(r, { partials: [[60, 0.4], [120, 1], [180, 0.2]], cutoff: 220, gain: 0.013, shimmer: 0.3, wet: true });
      // G–D–G–D: a fifth stacked twice, all sine, all behind a lowpass, every
      // partial breathing on its own clock. Open, and not going anywhere.
      toneStack(r, {
        partials: [[98, 1], [146.83, 0.72], [196, 0.5], [293.66, 0.28], [392, 0.13], [587.33, 0.05]],
        cutoff: 760, gain: 0.04, detune: 6, shimmer: 0.7, sweep: { depth: 220, rate: 0.017 }, wet: true,
      });
      subLayer(r, 36.7, 0.045, 0.021);

      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      return {
        out: r.out, nodes: r.nodes, spacing: [8, 18],
        event: (t) => {
          const roll = Math.random();
          if (roll < 0.4) bell(h, t, { freq: 293.66, ratios: [1, 1.5, 2, 3], level: 0.016, decay: 2.6, pan: rand(-0.6, 0.6), wet: 0.9 });
          else if (roll < 0.75) sweep(h, t, { from: 500, to: 1400, q: 1, level: 0.035, dur: rand(2.5, 4.5), pan: rand(-0.8, 0.8), wet: 0.55 });
          else thunk(h, t, { from: 70, to: 48, level: 0.03, decay: 0.9, pan: rand(-0.4, 0.4), wet: 1 });
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------

export function buildFx(ctx: BaseAudioContext, assets: AudioAssets, id: FxId, at: number, rate: number): Voice {
  switch (id) {
    // A UI click: a transient, not a note. Six milliseconds of band-limited
    // noise with a sine blip under it.
    case 'click': {
      const r = rig(ctx, assets, at, 'hall', 0.18);
      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      tick(h, at, { freq: 1900, q: 1.1, level: 0.55, decay: 0.035, pan: 0, wet: 0.3 });
      bell(h, at, { freq: 660, ratios: [1], level: 0.22, decay: 0.06, pan: 0, wet: 0.25 });
      thunk(h, at, { from: 150, to: 96, level: 0.16, decay: 0.07, pan: 0, wet: 0.1 });
      return { out: r.out, nodes: r.nodes, life: 0.4 };
    }

    // The crossing. Noise through a bandpass that opens and shuts, with the
    // floor dropping out from under it.
    case 'whoosh': {
      const dur = 0.95 / rate;
      const r = rig(ctx, assets, at, 'open', 0.4);
      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      sweep(h, at, { from: 260, to: 2400, q: 1.2, level: 0.5, dur: dur * 0.55, pan: -0.35, attack: dur * 0.32, wet: 0.6 });
      sweep(h, at + dur * 0.4, { from: 2000, to: 380, q: 1.1, level: 0.4, dur: dur * 0.6, pan: 0.35, attack: dur * 0.1, wet: 0.6 });
      thunk(h, at, { from: 120, to: 38, level: 0.4, decay: dur, pan: 0, wet: 0.3 });
      return { out: r.out, nodes: r.nodes, life: dur * 1.6 + 0.6 };
    }

    // Energising: a resonant riser with a bloom on the end of it. The rise is
    // a filter climbing over noise, not an oscillator climbing in pitch.
    case 'energise': {
      const dur = 0.85 / rate;
      const r = rig(ctx, assets, at, 'hall', 0.35);
      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      sweep(h, at, { from: 150, to: 1500, q: 7, level: 1.0, dur, pan: -0.35, attack: dur * 0.7, wet: 0.5 });
      sweep(h, at, { from: 300, to: 3000, q: 9, level: 0.45, dur, pan: 0.4, attack: dur * 0.8, wet: 0.5 });
      thunk(h, at, { from: 55, to: 110, level: 0.3, decay: dur * 1.1, pan: 0, wet: 0.2 });
      bell(h, at + dur * 0.94, { freq: 440, ratios: [1, 1.5, 2], level: 0.2, decay: 0.9, pan: 0, wet: 0.8 });
      return { out: r.out, nodes: r.nodes, life: dur + 1.4 };
    }

    // Power on: a breaker closing into a 3 MVA core. Armature, weight, and
    // then the iron ringing at 120 Hz as it takes the load.
    case 'power-on': {
      const dur = 1.2 / rate;
      const r = rig(ctx, assets, at, 'hall', 0.3);
      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      tick(h, at, { freq: 900, q: 1, level: 0.4, decay: 0.05, pan: 0, wet: 0.35 });
      thunk(h, at + 0.015, { from: 88, to: 42, level: 0.55, decay: 0.4, pan: 0, wet: 0.35 });
      // The ring swells rather than snapping in — that is the load arriving.
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(0.0001, at);
      ring.gain.linearRampToValueAtTime(0.2, at + dur * 0.35);
      ring.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.connect(ring);
      ring.connect(r.dry);
      ring.connect(r.send);
      for (const [f, g] of [[60, 0.4], [120, 1], [180, 0.22]] as Array<[number, number]>) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const pg = ctx.createGain();
        pg.gain.value = g;
        osc.connect(pg);
        pg.connect(lp);
        osc.start(at);
        osc.stop(at + dur + 0.45);
        r.nodes.push(osc);
      }
      return { out: r.out, nodes: r.nodes, life: dur + 0.8 };
    }

    // Credit applied: two sines a fifth apart, and nothing else.
    case 'xp-topup': {
      const r = rig(ctx, assets, at, 'hall', 0.3);
      const h: Hit = { ctx, assets, dry: r.dry, send: r.send };
      bell(h, at, { freq: 880, ratios: [1, 1.5], level: 0.3, decay: 0.3, pan: -0.15, wet: 0.5 });
      bell(h, at + 0.075, { freq: 1320, ratios: [1, 1.5], level: 0.16, decay: 0.36, pan: 0.25, wet: 0.5 });
      return { out: r.out, nodes: r.nodes, life: 0.9 };
    }

    // The hold. A resonant sweep with a tremolo that speeds up as it climbs,
    // so the tension is in the movement rather than in the pitch. It is built
    // to be cut off at any point: nothing about it resolves on its own.
    case 'hold': {
      const dur = 1.2 / rate;
      const r = rig(ctx, assets, at, 'hall', 0.3);

      // The tremolo sits across the whole riser, not just under it: a unity
      // gain with an LFO added on top, the LFO's own frequency ramping 3 Hz
      // to 11 Hz and its depth opening up as the ring fills.
      const trem = ctx.createGain();
      trem.gain.value = 1;
      trem.connect(r.dry);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3, at);
      lfo.frequency.exponentialRampToValueAtTime(11, at + dur);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0.02, at);
      depth.gain.linearRampToValueAtTime(0.28, at + dur);
      lfo.connect(depth);
      depth.connect(trem.gain);
      lfo.start(at);
      lfo.stop(at + dur + 0.3);
      r.nodes.push(lfo);

      // A Q of 9 on noise passes a very narrow band, so these levels buy back
      // what the filter throws away — they are not loud, they are recovered.
      const h: Hit = { ctx, assets, dry: trem, send: r.send };
      sweep(h, at, { from: 190, to: 1250, q: 9, level: 1.1, dur, pan: -0.35, attack: dur * 0.85, wet: 0.45 });
      sweep(h, at, { from: 285, to: 1875, q: 13, level: 0.5, dur, pan: 0.4, attack: dur * 0.9, wet: 0.45 });

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(44, at);
      sub.frequency.exponentialRampToValueAtTime(88, at + dur);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.0001, at);
      subGain.gain.linearRampToValueAtTime(0.11, at + dur * 0.9);
      subGain.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
      sub.connect(subGain);
      subGain.connect(trem);
      sub.start(at);
      sub.stop(at + dur + 0.3);
      r.nodes.push(sub);

      return { out: r.out, nodes: r.nodes, life: dur + 0.6 };
    }
  }
}

// ---------------------------------------------------------------------------
// Master chain
// ---------------------------------------------------------------------------

/**
 * Everything → level → guard → limiter → out. The compressor is there so no
 * accumulation of beds and events can ever get harsh, not to make anything
 * louder: the threshold sits above where the material is normally driven and
 * only catches an FX landing on top of two beds mid-crossing.
 *
 * Exported so the graph that is measured offline is the graph that ships.
 */
export function createMasterChain(ctx: BaseAudioContext): { input: GainNode; output: AudioNode } {
  const input = ctx.createGain();
  input.gain.value = MASTER_LEVEL;
  const guard = ctx.createBiquadFilter();
  guard.type = 'highpass';
  guard.frequency.value = 18;        // no infrasound eating headroom
  guard.Q.value = 0.5;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;
  input.connect(guard);
  guard.connect(limiter);
  return { input, output: limiter };
}

// ---------------------------------------------------------------------------
// The bus
// ---------------------------------------------------------------------------

interface LiveTrack {
  nodes: AudioScheduledSourceNode[];
  gain: GainNode;
  out: GainNode;
  level: number;
  timer: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private assets: AudioAssets | null = null;
  private live = new Map<string, LiveTrack>();
  private muted = true;
  private samples = new Map<string, AudioBuffer>();
  private pending = new Map<string, number>();

  /** Browsers require a gesture before audio may start. */
  unlock(): void {
    if (this.ctx) {
      // Only claim to be live once the context actually is. Setting muted
      // false against a suspended context makes the bus queue every source
      // against a frozen currentTime, and they all fire at once on resume.
      void this.ctx.resume().then(() => { this.muted = this.ctx?.state !== 'running'; });
      this.muted = this.ctx.state !== 'running';
      return;
    }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const chain = createMasterChain(ctx);
    chain.output.connect(ctx.destination);
    this.master = chain.input;
    this.muted = ctx.state !== 'running';
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => { this.muted = ctx.state !== 'running'; });
    }

    // The noise buffers cost around ten milliseconds to generate. Doing it on
    // idle keeps that off the gesture that unlocked us, and `ready()` forces
    // it if a sound is asked for first.
    const warm = (): void => { this.ready(); };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) ric(warm); else window.setTimeout(warm, 60);
  }

  private ready(): AudioAssets | null {
    if (!this.ctx) return null;
    if (!this.assets) this.assets = createAssets(this.ctx);
    return this.assets;
  }

  getTrackOption<K extends keyof TrackOptions>(id: string, key: K): TrackOptions[K] | undefined {
    return REGISTRY[id]?.[key];
  }

  /** A real file's length wins once it is decoded; otherwise the declared one. */
  getDuration(id: string): number | null {
    const buf = this.samples.get(id);
    if (buf) return buf.duration;
    return REGISTRY[id]?.duration ?? null;
  }

  play(id: string, opts: { fadeIn?: number; volume?: number; rate?: number } = {}): void {
    const track = REGISTRY[id];
    if (!track || this.muted || !this.ctx || !this.master) return;
    if (track.loop && this.live.has(id)) return;

    const ctx = this.ctx;
    const volume = clamp(opts.volume ?? track.volume ?? 0.5, 0, 1);
    // A hold can hand us any rate at all; a one-shot stretched to a minute is
    // a stuck sound, so the range is clamped to something musical.
    const rate = clamp(opts.rate ?? 1, 0.25, 6);

    if (track.src) { this.playSample(id, track, volume, opts.fadeIn ?? 0.4, rate); return; }

    const assets = this.ready();
    if (!assets) return;

    // Start a hair in the future: every source and every ramp in a voice is
    // scheduled against this, so nothing is ever set abruptly at `currentTime`.
    const at = ctx.currentTime + 0.02;
    const voice = track.bed
      ? buildBed(ctx, assets, track.bed, at)
      : track.fx ? buildFx(ctx, assets, track.fx, at, rate) : null;
    if (!voice) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    const fade = Math.max(0.005, opts.fadeIn ?? (track.type === 'ambient' ? 0.4 : 0.01));
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), at + fade);
    voice.out.connect(gain);
    gain.connect(this.master);

    const live: LiveTrack = { nodes: voice.nodes, gain, out: voice.out, level: volume, timer: 0 };
    this.live.set(id, live);

    if (voice.life !== undefined) {
      // One-shots tear themselves down. Sources are stopped on a schedule,
      // never by yanking the graph out from under them.
      const end = at + voice.life;
      for (const n of voice.nodes) { try { n.stop(end); } catch { /* already scheduled */ } }
      window.setTimeout(() => {
        if (this.live.get(id) === live) this.live.delete(id);
        gain.disconnect();
        voice.out.disconnect();
      }, (voice.life + 0.4) * 1000);
    } else {
      this.arm(id, live, voice);
    }
  }

  /** Sparse events: a timer per live bed, re-armed with a fresh random gap. */
  private arm(id: string, live: LiveTrack, voice: Voice): void {
    const spacing = voice.spacing;
    const fire = voice.event;
    if (!spacing || !fire) return;
    const next = (first: boolean): void => {
      const gap = first ? rand(1.5, spacing[1] * 0.6) : rand(spacing[0], spacing[1]);
      live.timer = window.setTimeout(() => {
        if (this.live.get(id) !== live || !this.ctx) return;
        fire(this.ctx.currentTime + 0.03);
        next(false);
      }, gap * 1000);
    };
    next(true);
  }

  /**
   * Used by hold-driven cross-fades — called every frame for two tracks at
   * once. One AudioParam touched, and only when the value has actually moved;
   * `setTargetAtTime` glides from wherever the parameter currently is, so it
   * cannot step, click or zipper however often it is called.
   */
  setLevel(id: string, { volume }: { volume: number }): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    const v = Math.max(0.0001, clamp(volume, 0, 1));
    if (Math.abs(v - t.level) < 0.002) return;
    t.level = v;
    t.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.035);
  }

  stop(id: string, { fadeOut = 0.1 }: { fadeOut?: number } = {}): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    this.live.delete(id);
    if (t.timer) window.clearTimeout(t.timer);
    const now = this.ctx.currentTime;
    const end = now + Math.max(0.02, fadeOut);
    // Clear whatever automation is in flight, then ramp from wherever the
    // parameter actually is. `cancelAndHold` holds the true current value;
    // the fallback holds the last requested one, which during a cross-fade
    // can be a few percent away — hence the ramp rather than a value set.
    const g = t.gain.gain;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(now);
    } else {
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, t.level), now);
    }
    g.linearRampToValueAtTime(0.0001, end);
    t.level = 0.0001;
    for (const n of t.nodes) {
      try { n.stop(end + 0.02); } catch { /* already stopped */ }
    }
    // The reverb tail lives inside the voice, so it is silenced by the same
    // ramp. Dropping the connection afterwards lets the whole graph go.
    window.setTimeout(() => { t.gain.disconnect(); t.out.disconnect(); }, (end - now + 0.3) * 1000);
  }

  stopAll(): void {
    for (const id of [...this.live.keys()]) this.stop(id, { fadeOut: 0.2 });
  }

  // -- the escape hatch --------------------------------------------------
  private playSample(id: string, track: TrackOptions, volume: number, fadeIn: number, rate: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const buf = this.samples.get(id);
    if (!buf) {
      if (this.pending.has(id) || !track.src) return;
      const token = (this.pending.get(id) ?? 0) + 1;
      this.pending.set(id, token);
      void fetch(track.src)
        .then((res) => res.arrayBuffer())
        .then((raw) => ctx.decodeAudioData(raw))
        .then((decoded) => {
          this.samples.set(id, decoded);
          this.pending.delete(id);
          if (!this.muted) this.playSample(id, track, volume, fadeIn, rate);
        })
        .catch(() => { this.pending.delete(id); });
      return;
    }

    const at = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = track.loop ?? false;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), at + Math.max(0.005, fadeIn));
    src.connect(gain);
    gain.connect(master);
    src.start(at);
    const live: LiveTrack = { nodes: [src], gain, out: gain, level: volume, timer: 0 };
    this.live.set(id, live);
    if (!src.loop) {
      src.onended = () => {
        if (this.live.get(id) === live) this.live.delete(id);
        gain.disconnect();
      };
    }
  }
}

export const audio = new AudioBus();
