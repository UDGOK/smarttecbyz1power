/**
 * Audio bus.
 *
 * Two jobs, both taken from the reference:
 *  1. per-stage ambience that cross-fades while a hold is in progress, and
 *  2. one-shot FX whose playback rate is scaled so a hold sound always lands
 *     exactly when the progress ring completes.
 *
 * No .mp3 assets ship yet. Rather than fake it with a bare oscillator — which
 * sounds like a test tone, not a place — each ambience is a filtered noise bed
 * plus a detuned drone pair, which is how these are actually built. Drop real
 * files into /assets/audio and set `src` to swap them in; nothing else changes.
 */

export interface TrackOptions {
  src?: string;
  type: 'ambient' | 'fx';
  loop?: boolean;
  volume?: number;
  /** Ambience shape: a noise bed under a detuned drone pair. */
  bed?: { cutoff: number; q: number; drone: number; detune: number; wave: OscillatorType };
  /** FX shape. */
  fx?: { wave: OscillatorType; from: number; to: number; duration: number; noise?: number };
  /** Multiplier applied to playback rate when driven by a hold. */
  holdRateScale?: number;
}

const REGISTRY: Record<string, TrackOptions> = {
  // Open air over cold ground: high, thin, almost nothing.
  'stage-land-ambient':    { type: 'ambient', loop: true, volume: 0.5, bed: { cutoff: 620, q: 0.7, drone: 110, detune: 4, wave: 'sine' } },
  // The queue: pressure. Lower, narrower, with beating between the drones.
  'stage-wait-ambient':    { type: 'ambient', loop: true, volume: 0.5, bed: { cutoff: 340, q: 2.4, drone: 73.4, detune: 11, wave: 'sawtooth' } },
  // Switchgear hum, near mains frequency.
  'stage-power-ambient':   { type: 'ambient', loop: true, volume: 0.5, bed: { cutoff: 900, q: 1.2, drone: 120, detune: 2, wave: 'triangle' } },
  // A hall full of fans: broadband, no pitch to speak of.
  'stage-machine-ambient': { type: 'ambient', loop: true, volume: 0.5, bed: { cutoff: 1800, q: 0.4, drone: 55, detune: 1, wave: 'sine' } },
  // Outside again, and open.
  'stage-campus-ambient':  { type: 'ambient', loop: true, volume: 0.5, bed: { cutoff: 1400, q: 0.5, drone: 196, detune: 6, wave: 'sine' } },

  'hold-button':   { type: 'fx', volume: 0.5, holdRateScale: 1, fx: { wave: 'triangle', from: 220, to: 660, duration: 1.2 } },
  'click':         { type: 'fx', volume: 0.35, fx: { wave: 'square',   from: 880, to: 440, duration: 0.05 } },
  'whoosh':        { type: 'fx', volume: 0.5,  fx: { wave: 'sine',     from: 400, to: 60,  duration: 0.7, noise: 0.7 } },
  'energise':      { type: 'fx', volume: 0.5,  fx: { wave: 'sawtooth', from: 120, to: 900, duration: 0.9 } },
  'power-on':      { type: 'fx', volume: 0.5,  fx: { wave: 'square',   from: 90,  to: 520, duration: 0.7 } },
  'xp-topup':      { type: 'fx', volume: 0.4,  fx: { wave: 'sine',     from: 660, to: 1320, duration: 0.22 } },
};

interface LiveTrack {
  nodes: AudioScheduledSourceNode[];
  gain: GainNode;
}

class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private live = new Map<string, LiveTrack>();
  private muted = true;

  /** Browsers require a gesture before audio may start. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); this.muted = false; return; }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise(this.ctx);
    this.muted = false;
  }

  /** Two seconds of pink-ish noise, looped. Cheap and good enough for a bed. */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.0555179;
      b1 = 0.963 * b1 + w * 0.0750759;
      b2 = 0.573 * b2 + w * 0.1538520;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  getTrackOption<K extends keyof TrackOptions>(id: string, key: K): TrackOptions[K] | undefined {
    return REGISTRY[id]?.[key];
  }

  getDuration(id: string): number | null {
    return REGISTRY[id]?.fx?.duration ?? null;
  }

  play(id: string, opts: { fadeIn?: number; volume?: number; rate?: number } = {}): void {
    const track = REGISTRY[id];
    if (!track || this.muted || !this.ctx || !this.master) return;
    if (this.live.has(id) && track.loop) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const volume = opts.volume ?? track.volume ?? 0.5;
    const nodes: AudioScheduledSourceNode[] = [];

    if (track.bed) {
      const { cutoff, q, drone, detune, wave } = track.bed;

      if (this.noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = q;
        src.connect(filter);
        filter.connect(gain);
        src.start(now);
        nodes.push(src);
      }

      // A detuned pair beats slowly against itself, which is what stops a
      // drone sounding like a synthesizer left switched on.
      for (const cents of [-detune, detune]) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = drone;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        osc.connect(g);
        g.connect(gain);
        osc.start(now);
        nodes.push(osc);
      }
    } else if (track.fx) {
      const { wave, from, to, duration, noise } = track.fx;
      const rate = opts.rate ?? 1;
      const end = now + duration / rate;

      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(from, now);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), end);
      osc.connect(gain);
      osc.start(now);
      osc.stop(end + 0.03);
      nodes.push(osc);

      if (noise && this.noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(from * 2, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), end);
        filter.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.value = noise;
        src.connect(filter);
        filter.connect(g);
        g.connect(gain);
        src.start(now);
        src.stop(end + 0.03);
        nodes.push(src);
      }

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.04, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(this.master);
      this.live.set(id, { nodes, gain });
      osc.onended = () => this.live.delete(id);
      return;
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + (opts.fadeIn ?? 0.4));
    gain.connect(this.master);
    this.live.set(id, { nodes, gain });
  }

  /** Used by hold-driven cross-fades — set a live track's level directly. */
  setLevel(id: string, { volume }: { volume: number }): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    t.gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), this.ctx.currentTime + 0.05);
  }

  stop(id: string, { fadeOut = 0.1 }: { fadeOut?: number } = {}): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    const end = this.ctx.currentTime + fadeOut;
    t.gain.gain.linearRampToValueAtTime(0.0001, end);
    for (const n of t.nodes) {
      try { n.stop(end + 0.03); } catch { /* already stopped */ }
    }
    this.live.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.live.keys()]) this.stop(id, { fadeOut: 0.2 });
  }
}

export const audio = new AudioBus();
