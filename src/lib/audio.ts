/**
 * Audio bus.
 *
 * Two jobs, both taken from the reference:
 *  1. per-stage ambience that cross-fades while a hold is in progress, and
 *  2. one-shot FX whose playback rate is scaled so a hold sound always lands
 *     exactly when the progress ring completes.
 *
 * No .mp3 assets ship yet, so every track falls back to a small WebAudio
 * synth. Drop real files into /assets/audio and set `src` to swap them in —
 * nothing else has to change.
 */

export interface TrackOptions {
  src?: string;
  type: 'ambient' | 'fx';
  loop?: boolean;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Synth fallback shape, used when `src` is absent. */
  synth?: { wave: OscillatorType; from: number; to: number; duration: number };
  /** Multiplier applied to playback rate when driven by a hold. */
  holdRateScale?: number;
}

const REGISTRY: Record<string, TrackOptions> = {
  'stage-land-ambient':   { type: 'ambient', loop: true, volume: 0.5, synth: { wave: 'sine',     from: 110, to: 110, duration: 0 } },
  'stage-wait-ambient':   { type: 'ambient', loop: true, volume: 0.5, synth: { wave: 'sawtooth', from: 70,  to: 70,  duration: 0 } },
  'hold-button':          { type: 'fx', volume: 0.85, holdRateScale: 1, synth: { wave: 'triangle', from: 220, to: 660, duration: 1.2 } },
  'click':                { type: 'fx', volume: 0.6,  synth: { wave: 'square',   from: 880, to: 440, duration: 0.06 } },
  'whoosh':               { type: 'fx', volume: 0.7,  synth: { wave: 'sine',     from: 400, to: 60,  duration: 0.5 } },
};

interface LiveTrack {
  osc: OscillatorNode;
  gain: GainNode;
  target: number;
}

class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private live = new Map<string, LiveTrack>();
  private muted = true;

  /** Browsers require a gesture before audio may start. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); this.muted = false; return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.muted = false;
  }

  getTrackOption<K extends keyof TrackOptions>(id: string, key: K): TrackOptions[K] | undefined {
    return REGISTRY[id]?.[key];
  }

  getDuration(id: string): number | null {
    return REGISTRY[id]?.synth?.duration ?? null;
  }

  play(id: string, opts: { fadeIn?: number; volume?: number; rate?: number } = {}): void {
    const track = REGISTRY[id];
    if (!track || this.muted || !this.ctx || !this.master) return;
    if (this.live.has(id) && track.loop) return;

    const shape = track.synth;
    if (!shape) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const volume = opts.volume ?? track.volume ?? 0.5;
    const rate = opts.rate ?? 1;

    osc.type = shape.wave;
    osc.frequency.setValueAtTime(shape.from, now);
    if (shape.to !== shape.from && shape.duration > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, shape.to), now + shape.duration / rate);
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + (opts.fadeIn ?? 0.02));

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);

    if (!track.loop && shape.duration > 0) {
      const end = now + shape.duration / rate;
      gain.gain.linearRampToValueAtTime(0, end);
      osc.stop(end + 0.02);
      osc.onended = () => this.live.delete(id);
    }

    this.live.set(id, { osc, gain, target: volume });
  }

  /** Used by hold-driven cross-fades — set a live track's level directly. */
  setLevel(id: string, { volume }: { volume: number }): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    t.gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), this.ctx.currentTime + 0.05);
    t.target = volume;
  }

  stop(id: string, { fadeOut = 0.1 }: { fadeOut?: number } = {}): void {
    const t = this.live.get(id);
    if (!t || !this.ctx) return;
    const end = this.ctx.currentTime + fadeOut;
    t.gain.gain.linearRampToValueAtTime(0.0001, end);
    t.osc.stop(end + 0.02);
    this.live.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.live.keys()]) this.stop(id, { fadeOut: 0.2 });
  }
}

export const audio = new AudioBus();
